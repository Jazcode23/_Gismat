import io
import json
import math
import tempfile
from datetime import date
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.test import override_settings

from django.contrib.gis.geos import Point
from django.core.management import call_command
from django.core.management.base import CommandError

from geoportal import models as m
from geoportal.management.commands import simular_detecciones_ia as hist

from .base import BaseGismat

HOY = date(2026, 10, 10)


def ejecutar(**opciones):
    salida = io.StringIO()
    with mock.patch.object(hist.timezone, "localdate", return_value=HOY):
        call_command("simular_detecciones_ia", stdout=salida, **opciones)
    return salida.getvalue()


class SimularDeteccionesTests(BaseGismat):
    """Escenario: Canal Test real, 8 focos con fechas de alta de marzo a octubre y dos detecciones preexistentes
    (una REAL y una de ejemplo creada por otro comando de simulación)."""

    def setUp(self):
        # los archivos de seguimiento (data/*.json) van a una carpeta temporal: las pruebas no tocan la carpeta real
        carpeta = tempfile.TemporaryDirectory()
        self.addCleanup(carpeta.cleanup)
        ajuste = override_settings(BASE_DIR=Path(carpeta.name))
        ajuste.enable()
        self.addCleanup(ajuste.disable)
        tipos = ["basural", "microbasural", "volcadero", "basural", "microbasural", "volcadero", "basural", "microbasural"]
        for i in range(8):
            f = self.crear_foco(latitud=-26.795 - i * 0.004, longitud=-65.245 + i * 0.006, ubicacion=f"Foco {i}")
            m.Foco.objects.filter(codigo=f["id"]).update(fecha_registro=date(2026, 3 + i, 12), tipo=tipos[i])
        self.real = m.DeteccionIA.objects.create(
            ubicacion=Point(-65.2, -26.81, srid=4326), direccion="Detección real de prueba", confianza=91, area_m2=210,
            fecha=date(2026, 8, 3), estado="nuevo", cauce="", pendiente="2%", densidad="Media", vulnerabilidad_hidrica=50,
            escurrimiento=40, residuos_peligrosos=30)
        self.ejemplo = m.DeteccionIA.objects.create(
            ubicacion=Point(-65.21, -26.80, srid=4326), direccion="Río Salí - Tramo 3", confianza=80, area_m2=300,
            fecha=date(2026, 10, 2), estado="nuevo", cauce="RÍO SALÍ (Cauce)", pendiente="2%", densidad="Media",
            vulnerabilidad_hidrica=50, escurrimiento=40, residuos_peligrosos=30)
        self.huella_real = self.huella(self.real)

    def huella(self, det):
        d = m.DeteccionIA.objects.get(pk=det.pk)
        return (d.codigo, d.estado, d.fecha, d.confianza, d.direccion, d.origen, d.tipo_foco, d.foco_id, d.area_m2)

    def simuladas(self):
        return m.DeteccionIA.objects.filter(origen="simulado")

    def test_dry_run_no_escribe(self):
        antes = m.DeteccionIA.objects.count()
        salida = ejecutar(total=60)
        self.assertEqual(m.DeteccionIA.objects.count(), antes)
        self.assertIn("DRY-RUN", salida)
        self.assertIn("Detecciones reales (no se tocan): 1", salida)

    def test_crea_historia_de_enero_a_octubre_marcada_como_simulada(self):
        ejecutar(total=60, aplicar=True)
        sims = list(self.simuladas())
        self.assertGreaterEqual(len(sims), 60)
        self.assertTrue(all(date(2026, 1, 1) <= d.fecha <= HOY for d in sims))
        meses = {d.fecha.month for d in sims}
        self.assertEqual(meses, set(range(1, 11)))                                  # hay detecciones en los diez meses
        self.assertEqual({d.estado for d in sims}, {"nuevo", "confirmado", "descartado"})
        tipos = {d.tipo_foco or d.foco.tipo for d in sims}
        self.assertEqual(tipos, {"basural", "microbasural", "volcadero"})
        objetivo = hist.objetivo_por_mes(60, HOY)
        for mes, n in objetivo.items():
            self.assertGreaterEqual(sum(1 for d in sims if d.fecha.month == mes), n, f"mes {mes}")
        for d in sims:
            self.assertTrue(-90 <= d.ubicacion.y <= 90 and -180 <= d.ubicacion.x <= 180)
            self.assertTrue(d.tipo_foco)
            if d.estado == "descartado":
                self.assertLessEqual(d.confianza, 76)
            if d.estado == "confirmado" and d.id > self.ejemplo.id:
                self.assertGreaterEqual(d.confianza, 78)
        self.assertGreater(m.DeteccionIA.objects.exclude(estado="descartado").filter(origen="simulado", estado="nuevo").count(), 0)

    def test_no_modifica_ni_elimina_lo_real(self):
        ejecutar(total=60, aplicar=True)
        self.assertEqual(self.huella(self.real), self.huella_real)                   # ni origen ni tipo ni nada
        self.assertEqual(m.DeteccionIA.objects.get(pk=self.real.pk).origen, "oficial")
        ejecutar(revertir=True, aplicar=True)
        self.assertEqual(self.huella(self.real), self.huella_real)

    def test_ids_viejos_de_otra_base_no_marcan_ni_borran_detecciones_reales(self):
        """Los archivos data/*.json guardan IDs de UNA base. Si la base se recrea y un ID coincide con una detección real,
        esa detección no debe tratarse como simulada."""
        datos = Path(settings.BASE_DIR) / "data"
        datos.mkdir()
        (datos / "simulacion_historial.json").write_text(json.dumps({"detecciones": [self.real.pk]}), encoding="utf-8")
        (datos / "simulacion_detecciones.json").write_text(json.dumps({
            "creadas": [self.real.pk], "codigos": {str(self.real.pk): "AI-999"},
            "marcadas": {str(self.real.pk): {"origen": "oficial", "tipo_foco": ""}}}), encoding="utf-8")
        ejecutar(total=30, aplicar=True)
        self.assertEqual(self.huella(self.real), self.huella_real)
        ejecutar(revertir=True, aplicar=True)
        self.assertTrue(m.DeteccionIA.objects.filter(pk=self.real.pk).exists())
        self.assertEqual(self.huella(self.real), self.huella_real)

    def test_la_historia_heredada_se_reconoce_solo_con_su_firma(self):
        propia = m.DeteccionIA.objects.create(
            ubicacion=Point(-65.2, -26.8, srid=4326), direccion="X - área lindante", confianza=60, area_m2=100, fecha=date(2026, 4, 4),
            estado="descartado", pendiente=hist.PENDIENTES[0], densidad=hist.DENSIDADES[0], tipo_foco="")
        datos = Path(settings.BASE_DIR) / "data"
        datos.mkdir()
        (datos / "simulacion_historial.json").write_text(json.dumps({"detecciones": [propia.pk, self.real.pk]}), encoding="utf-8")
        ejecutar(total=30, aplicar=True)
        self.assertEqual(m.DeteccionIA.objects.get(pk=propia.pk).origen, "simulado")     # firma + ID: se reconoce
        self.assertEqual(m.DeteccionIA.objects.get(pk=self.real.pk).origen, "oficial")   # ID en el archivo, sin firma: es real

    def test_marca_la_de_ejemplo_de_otro_comando_sin_cambiarle_nada_mas(self):
        antes = self.huella(self.ejemplo)
        ejecutar(total=30, aplicar=True)
        despues = m.DeteccionIA.objects.get(pk=self.ejemplo.pk)
        self.assertEqual(despues.origen, "simulado")
        self.assertIn(despues.tipo_foco, ("basural", "microbasural", "volcadero"))
        self.assertEqual((despues.codigo, despues.estado, despues.fecha, despues.confianza, despues.direccion, despues.area_m2),
                         (antes[0], antes[1], antes[2], antes[3], antes[4], antes[8]))

    def test_las_confirmadas_se_vinculan_a_focos_existentes_sin_modificarlos(self):
        focos_antes = list(m.Foco.objects.order_by("codigo").values_list("codigo", "irh", "volumen_m3", "estado", "fecha_registro", "tipo"))
        ejecutar(total=60, aplicar=True)
        conf = [d for d in self.simuladas() if d.estado == "confirmado"]
        self.assertTrue(conf)
        self.assertEqual(len({d.foco_id for d in conf}), len(conf))                  # un foco, una detección
        for d in conf:
            self.assertLessEqual(d.fecha, d.foco.fecha_registro)                     # la detección es anterior al alta
            self.assertEqual(d.tipo_foco, d.foco.tipo)
            k = math.cos(math.radians(d.ubicacion.y))
            metros = math.hypot((d.ubicacion.x - d.foco.ubicacion.x) * 111320 * k, (d.ubicacion.y - d.foco.ubicacion.y) * 111320)
            self.assertLessEqual(metros, 15)
        self.assertEqual(list(m.Foco.objects.order_by("codigo").values_list("codigo", "irh", "volumen_m3", "estado", "fecha_registro", "tipo")),
                         focos_antes)

    def test_repetir_no_duplica_y_es_reproducible(self):
        ejecutar(total=60, aplicar=True)
        base = sorted(self.simuladas().values_list("fecha", "tipo_foco", "estado", "confianza", "direccion"))
        self.assertIn("Nada para crear", ejecutar(total=60, aplicar=True))
        self.assertEqual(sorted(self.simuladas().values_list("fecha", "tipo_foco", "estado", "confianza", "direccion")), base)
        ejecutar(revertir=True, aplicar=True)                                         # misma semilla => misma historia
        ejecutar(total=60, aplicar=True)
        self.assertEqual(sorted(self.simuladas().values_list("fecha", "tipo_foco", "estado", "confianza", "direccion")), base)

    def test_ampliar_agrega_solo_lo_que_falta(self):
        ejecutar(total=40, aplicar=True)
        previas = sorted(self.simuladas().values_list("codigo", "fecha", "estado", "direccion"))
        ejecutar(total=70, aplicar=True)
        ahora = sorted(self.simuladas().values_list("codigo", "fecha", "estado", "direccion"))
        self.assertGreater(len(ahora), len(previas))
        self.assertTrue(set(previas) <= set(ahora))                                   # lo anterior queda intacto

    def test_revertir_deja_todo_como_estaba(self):
        antes = sorted(m.DeteccionIA.objects.values_list("codigo", "estado", "fecha", "origen", "tipo_foco", "direccion"))
        ejecutar(total=60, aplicar=True)
        self.assertIn("DRY-RUN", ejecutar(revertir=True))
        ejecutar(revertir=True, aplicar=True)
        self.assertEqual(sorted(m.DeteccionIA.objects.values_list("codigo", "estado", "fecha", "origen", "tipo_foco", "direccion")), antes)
        with self.assertRaises(CommandError):
            ejecutar(revertir=True, aplicar=True)                                     # ya no hay nada que revertir

    def test_errores_claros(self):
        with self.assertRaises(CommandError):
            ejecutar(total=5000)
        m.CursoAgua.objects.all().delete()
        with self.assertRaises(CommandError):
            ejecutar(total=60, aplicar=True)


class FuncionesPurasTests(BaseGismat):
    def test_objetivo_por_mes_suma_exactamente_el_total(self):
        for total in (0, 1, 7, 60, 120, 333):
            for mes in (1, 5, 10):
                objetivo = hist.objetivo_por_mes(total, date(2026, mes, 15))
                self.assertEqual(sum(objetivo.values()), total)
                self.assertEqual(set(objetivo), set(range(1, mes + 1)))

    def test_prob_pendiente_alta_en_el_mes_actual_y_baja_en_los_viejos(self):
        hoy = date(2026, 10, 10)
        self.assertGreater(hist.prob_pendiente(10, hoy), hist.prob_pendiente(9, hoy))
        self.assertGreater(hist.prob_pendiente(9, hoy), hist.prob_pendiente(8, hoy))
        self.assertLessEqual(hist.prob_pendiente(3, hoy), 0.1)

    def test_tipo_estable_es_determinista_y_variado(self):
        tipos = {hist.tipo_estable(f"AI-{n:03d}") for n in range(1, 80)}
        self.assertEqual(tipos, {"basural", "microbasural", "volcadero"})
        self.assertEqual(hist.tipo_estable("AI-007"), hist.tipo_estable("AI-007"))
