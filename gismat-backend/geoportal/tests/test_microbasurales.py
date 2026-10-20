import io
from datetime import date

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError

from geoportal import models as m
from geoportal.management.commands import simular_microbasurales as sim
from geoportal.services.irh import calcular_irh

from .base import BaseGismat


def ejecutar(**opciones):
    salida = io.StringIO()
    call_command("simular_microbasurales", stdout=salida, **opciones)
    return salida.getvalue()


class SimularMicrobasuralesTests(BaseGismat):
    """Escenario: canal real (Canal Test) en lat -26.80 y cuatro focos reales que fijan la zona de estudio."""

    def setUp(self):
        for i, (lat, lng) in enumerate([(-26.805, -65.23), (-26.795, -65.21), (-26.81, -65.20), (-26.80, -65.245)]):
            self.crear_foco(latitud=lat, longitud=lng, ubicacion=f"Foco real {i}")
        self.huella_reales = self.huella(m.Foco.objects.all())

    def huella(self, qs):
        return list(qs.order_by("codigo").values_list("codigo", "irh", "volumen_m3", "estado", "distancia_curso_m", "direccion",
                                                       "observaciones", "fecha_registro"))

    def simulados(self):
        return sim.Command.simulados()

    def test_dry_run_no_escribe(self):
        antes = m.Foco.objects.count()
        salida = ejecutar(microbasurales=6, volcaderos=2)
        self.assertEqual(m.Foco.objects.count(), antes)
        self.assertIn("DRY-RUN", salida)
        self.assertIn("a crear: 8", salida)

    def test_se_crean_con_el_formato_de_los_focos_reales_y_sin_tocar_los_existentes(self):
        ejecutar(microbasurales=10, volcaderos=3, aplicar=True)
        sims = self.simulados()
        self.assertEqual((sims.filter(tipo="microbasural").count(), sims.filter(tipo="volcadero").count()), (10, 3))
        for f in sims:
            self.assertRegex(f.codigo, r"^(MB|VC)-\d{3}$")                          # código normal del sistema
            self.assertEqual(f.codigo.startswith("MB"), f.tipo == "microbasural")
            self.assertNotIn("SIMULACI", (f.direccion + f.observaciones).upper())   # sin carteles visibles por defecto
            self.assertEqual(f.datos_pendientes, [])
        reales = m.Foco.objects.exclude(pk__in=[f.pk for f in sims])
        self.assertEqual(self.huella(reales), self.huella_reales)                    # los existentes no cambian

    def test_distancia_microcuenca_e_irh_salen_de_las_funciones_existentes(self):
        ejecutar(microbasurales=10, volcaderos=3, aplicar=True)
        for f in self.simulados():
            self.assertEqual(f.curso_cercano_id, self.canal.id)
            self.assertIsNotNone(f.distancia_curso_m)
            self.assertGreaterEqual(f.distancia_curso_m, sim.DIST_MIN_CAUCE)           # nunca sobre el cauce
            esperado = calcular_irh(f.distancia_curso_m, f.volumen_m3, f.tipo_residuo.factor_peligrosidad, f.permeabilidad, f.estado)
            self.assertAlmostEqual(f.irh, esperado.valor)
            self.assertEqual(f.nivel_riesgo, esperado.nivel)
            dentro = self.mc.geom.contains(f.ubicacion)                                  # microcuenca solo si hay capa que lo respalde
            self.assertEqual(f.microcuenca_id == self.mc.id, dentro)
        self.assertEqual((settings.IRH_UMBRAL_MODERADO, settings.IRH_UMBRAL_CRITICO), (40.0, 70.0))

    def test_separacion_y_zona(self):
        ejecutar(microbasurales=12, volcaderos=4, aplicar=True)
        sims = list(self.simulados())
        ids = {f.pk for f in sims}
        for i, a in enumerate(sims):
            for b in sims[i + 1:]:
                minimo = sim.SEP_MINIMA[a.tipo] if a.tipo == b.tipo else 80.0
                self.assertGreaterEqual(sim.distancia_m(a.ubicacion.x, a.ubicacion.y, b.ubicacion.x, b.ubicacion.y), minimo,
                                        (a.codigo, b.codigo))
            for r in m.Foco.objects.exclude(pk__in=ids):
                self.assertGreaterEqual(sim.distancia_m(a.ubicacion.x, a.ubicacion.y, r.ubicacion.x, r.ubicacion.y), sim.SEP_REALES)

    def test_repetir_no_duplica_y_ampliar_agrega_solo_lo_que_falta(self):
        ejecutar(microbasurales=6, volcaderos=2, aplicar=True)
        base = self.huella(self.simulados())
        self.assertIn("Nada para crear", ejecutar(microbasurales=6, volcaderos=2, aplicar=True))
        self.assertEqual(self.huella(self.simulados()), base)
        ejecutar(microbasurales=8, volcaderos=3, aplicar=True)
        self.assertEqual(self.simulados().count(), 11)
        nuevos = self.simulados().order_by("-id")[:3]
        self.assertEqual(self.huella(self.simulados().exclude(pk__in=[f.pk for f in nuevos])), base)

    def test_marca_visible_solo_si_se_pide(self):
        ejecutar(microbasurales=3, volcaderos=1, identificar=True, aplicar=True)
        for f in self.simulados():
            self.assertTrue(f.direccion.startswith("SIMULACIÓN ·"))
            self.assertIn("[SIMULACIÓN] DATOS DE PRUEBA", f.observaciones)

    def test_los_codigos_siguen_la_numeracion_del_sistema(self):
        ejecutar(microbasurales=2, volcaderos=1, aplicar=True)
        codigos = sorted(int(c.split("-")[1]) for c in self.simulados().values_list("codigo", flat=True))
        self.assertEqual(codigos, [5, 6, 7])                 # a continuación de BR-001..004, como cualquier foco nuevo

    def test_revertir_elimina_solo_lo_cargado_por_el_comando(self):
        real_micro = m.Foco.objects.order_by("codigo").first()          # un microbasural REAL preexistente
        m.Foco.objects.filter(pk=real_micro.pk).update(tipo="microbasural")
        base = self.huella(m.Foco.objects.all())
        ejecutar(microbasurales=6, volcaderos=2, aplicar=True)
        self.assertIn("DRY-RUN", ejecutar(revertir=True))
        self.assertEqual(self.simulados().count(), 8)
        ejecutar(revertir=True, aplicar=True)
        self.assertEqual(self.simulados().count(), 0)
        self.assertEqual(self.huella(m.Foco.objects.all()), base)       # incluido el microbasural real
        self.assertEqual(m.CursoAgua.objects.count(), 1)

    def test_historial_coherente_y_volcaderos_recurrentes(self):
        ejecutar(microbasurales=10, volcaderos=14, aplicar=True)
        for f in self.simulados():
            self.assertLess(f.fecha_registro, date.today())
            for h in f.historial_irh.all():
                self.assertGreaterEqual(h.fecha_calculo.date(), f.fecha_registro)
            for i in f.intervenciones.all():
                self.assertGreaterEqual(i.fecha, f.fecha_registro)
        rec = [f for f in self.simulados() if "Reincidente" in f.observaciones]
        self.assertTrue(rec)
        self.assertTrue(all(f.tipo == "volcadero" and f.intervenciones.exists() for f in rec))

    def test_exige_cursos_reales(self):
        m.CursoAgua.objects.all().delete()
        with self.assertRaises(CommandError):
            ejecutar(microbasurales=3, volcaderos=1, aplicar=True)
        self.assertEqual(self.simulados().count(), 0)

    def test_sin_microcuencas_lo_informa_y_no_inventa_asociaciones(self):
        m.Microcuenca.objects.all().delete()
        salida = ejecutar(microbasurales=4, volcaderos=1, aplicar=True)
        self.assertIn("LIMITACIÓN", salida)
        self.assertEqual(self.simulados().filter(microcuenca__isnull=False).count(), 0)

    def test_cantidad_invalida(self):
        with self.assertRaises(CommandError):
            ejecutar(microbasurales=501)


class FuncionesPurasTests(BaseGismat):
    """Sin base de datos: ubicación, atributos e historia dependen solo de la clave y de la semilla."""

    def contexto(self):
        recta = [(-65.25, -26.80), (-65.20, -26.80)]

        def cercano(x, y):
            return None, abs(y + 26.80) * 111320 if -65.25 <= x <= -65.20 else 5000.0

        return {"caja": (-65.26, -26.83, -65.18, -26.77), "dentro": lambda x, y: True, "dist_borde": lambda x, y: 100.0,
                "hotspots": [(-65.22, -26.81), (-65.24, -26.79)], "lineas": [(1, recta)], "cercano": cercano}

    def test_colocar_es_determinista_y_respeta_separacion(self):
        ctx, colocados, puntos = self.contexto(), [], []
        for n in range(1, 41):
            c = sim.clave_de("microbasural", n)
            p = sim.colocar(c, "microbasural", 1, ctx, colocados)
            self.assertIsNotNone(p)
            self.assertEqual(p, sim.colocar(c, "microbasural", 1, ctx, colocados))      # misma entrada, misma salida
            colocados.append((p["lng"], p["lat"], "microbasural"))
            puntos.append(p)
        mins = min(sim.distancia_m(a["lng"], a["lat"], b["lng"], b["lat"]) for i, a in enumerate(puntos) for b in puntos[i + 1:])
        self.assertGreaterEqual(mins, sim.SEP_MINIMA["microbasural"])
        self.assertGreaterEqual(min(p["dist"] for p in puntos), sim.DIST_MIN_CAUCE)
        self.assertNotEqual(sim.colocar(c, "microbasural", 1, ctx, []), sim.colocar(c, "microbasural", 2, ctx, []))  # otra semilla

    def test_volcaderos_mayormente_cerca_del_cauce_y_el_resto_tierra_adentro(self):
        """El diseño apunta a ~65 % cerca de un curso de agua. Se mide sobre una muestra grande (con pocos puntos la
        proporción varía mucho por azar) y se exige un rango razonable, no un valor exacto."""
        ctx, n, cerca, lejos = self.contexto(), 200, 0, 0
        for k in range(n):
            p = sim.colocar(f"volcadero-{k:04d}", "volcadero", 7, ctx, [])
            cerca += p["dist"] <= 250
            if p["modo"] == "disperso":
                lejos += 1
                self.assertGreater(p["dist"], 250)           # los "tierra adentro" nunca quedan junto al agua
        self.assertGreaterEqual(cerca / n, 0.50)
        self.assertLessEqual(cerca / n, 0.80)
        self.assertEqual(cerca + lejos, n)

    def test_atributos_por_tipo_y_fecha(self):
        hoy = date(2026, 10, 10)
        for n in range(1, 60):
            mb = sim.atributos(sim.clave_de("microbasural", n), "microbasural", 1, hoy)
            vc = sim.atributos(sim.clave_de("volcadero", n), "volcadero", 1, hoy)
            self.assertTrue(0.3 <= mb["volumen"] <= 8 and 30 <= vc["volumen"] <= 420)
            self.assertFalse(mb["recurrente"])
            self.assertTrue(date(2026, 1, 3) <= mb["reg"] < hoy and date(2026, 1, 3) <= vc["reg"] < hoy)
            self.assertEqual(mb, sim.atributos(sim.clave_de("microbasural", n), "microbasural", 1, hoy))

    def test_plan_historial_usa_la_funcion_de_irh_recibida(self):
        hoy, llamadas = date(2026, 10, 10), []

        def irh(vol, estado):
            llamadas.append((vol, estado))
            return calcular_irh(60.0, vol, 0.6, "media", estado)

        for n in range(1, 30):
            clave = sim.clave_de("volcadero", n)
            a = sim.atributos(clave, "volcadero", 1, hoy)
            h = sim.plan_historial(clave, "volcadero", 1, a, hoy, 0.6, irh)
            self.assertTrue(all(a["reg"] <= f < hoy for f, _, _ in h["filas"]))
            self.assertTrue(all(i["fecha"] >= a["reg"] for i in h["intervenciones"]))
            self.assertTrue(all(0 <= r.valor <= 100 for _, r, _ in h["filas"]))
        self.assertTrue(llamadas)
