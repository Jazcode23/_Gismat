"""CU015 - Validar detección de IA (Operador Municipal)."""
from unittest import mock

from django.contrib.gis.geos import Point

from geoportal import models as m

from .base import BaseGismat


class ValidarDeteccionTests(BaseGismat):
    def detecciones(self, **kw):
        base = dict(ubicacion=Point(-65.2301, -26.8171, srid=4326), direccion="Detección de prueba", confianza=88,
                    area_m2=300, cauce="Canal Norte", distancia_curso_m=80, origen="simulado")
        base.update(kw)
        return m.DeteccionIA.objects.create(**base)

    def pendientes(self):
        r = self.client.get("/api/detecciones-ia/")
        self.assertEqual(r.status_code, 200)
        return [d["id"] for d in r.json() if d["statusType"] == "nuevo"]

    def test_listado_incluye_ubicacion_numerica_fecha_y_superficie_para_el_mapa(self):
        det = self.detecciones()
        self.login_as("operador")
        item = next(d for d in self.client.get("/api/detecciones-ia/").json() if d["id"] == det.codigo)
        self.assertAlmostEqual(item["latitud"], -26.8171, places=4)
        self.assertAlmostEqual(item["longitud"], -65.2301, places=4)
        self.assertEqual(item["areaM2"], 300)
        self.assertEqual(item["date"], det.fecha.isoformat())  # fecha de captura (flujo 5a)

    def test_confirmar_incorpora_el_foco_y_calcula_el_irh(self):
        det = self.detecciones()
        self.login_as("operador")
        r = self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        self.assertEqual(d["statusType"], "confirmado")
        self.assertTrue(d["focoId"])
        self.assertIsNotNone(d["irh"])
        foco = m.Foco.objects.get(codigo=d["focoId"])
        self.assertEqual(foco.estado, "pendiente")
        self.assertTrue(m.HistorialIRH.objects.filter(foco=foco).exists())
        self.assertNotIn(det.codigo, self.pendientes())

    def test_confirmar_dos_veces_no_duplica_el_foco(self):
        det = self.detecciones()
        self.login_as("operador")
        self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json")
        antes = m.Foco.objects.count()
        r = self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(m.Foco.objects.count(), antes)

    def test_descartar_la_saca_de_pendientes_y_no_crea_foco(self):
        det = self.detecciones()
        self.login_as("operador")
        focos = m.Foco.objects.count()
        self.assertIn(det.codigo, self.pendientes())
        r = self.client.post(f"/api/detecciones-ia/{det.codigo}/descartar/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["statusType"], "descartado")
        self.assertNotIn(det.codigo, self.pendientes())
        self.assertEqual(m.Foco.objects.count(), focos)
        # la descartada sigue consultable explícitamente (trazabilidad) y no se puede confirmar después
        self.assertIn(det.codigo, [d["id"] for d in self.client.get("/api/detecciones-ia/?estado=descartado").json()])
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json").status_code, 400)

    def test_no_se_puede_descartar_una_detección_ya_confirmada(self):
        det = self.detecciones()
        self.login_as("operador")
        self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json")
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{det.codigo}/descartar/", {}, format="json").status_code, 400)

    def test_error_tecnico_al_confirmar_deja_la_deteccion_pendiente_y_sin_foco_huerfano(self):
        det = self.detecciones()
        self.login_as("operador")
        focos = m.Foco.objects.count()
        with mock.patch("geoportal.views.recalcular", side_effect=RuntimeError("falla simulada")):
            r = self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json")
        self.assertEqual(r.status_code, 500)
        self.assertIn("permanece pendiente", r.json()["detail"])
        det.refresh_from_db()
        self.assertEqual(det.estado, "nuevo")
        self.assertIsNone(det.foco_id)
        self.assertEqual(m.Foco.objects.count(), focos)
        self.assertIn(det.codigo, self.pendientes())

    def test_permisos_por_rol(self):
        det = self.detecciones()
        self.login_as("supervisor")
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{det.codigo}/confirmar/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{det.codigo}/descartar/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/detecciones-ia/").status_code, 200)  # puede consultar
        det.refresh_from_db()
        self.assertEqual(det.estado, "nuevo")


class AnalisisSimuladoTests(BaseGismat):
    """El 'módulo de IA' simulado genera detecciones preliminares nuevas que luego se validan."""

    def test_analizar_crea_detecciones_nuevas_simuladas_y_validables(self):
        self.crear_foco()  # el análisis se ubica cerca de los focos conocidos
        self.login_as("operador")
        antes = m.DeteccionIA.objects.filter(estado="nuevo").count()
        r = self.client.post("/api/detecciones-ia/analizar/", {"cantidad": 4}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual(d["creadas"], 4)
        self.assertTrue(d["simulado"])
        self.assertEqual(m.DeteccionIA.objects.filter(estado="nuevo").count(), antes + 4)
        for x in d["detecciones"]:
            self.assertEqual(x["statusType"], "nuevo")
            self.assertEqual(x["origen"], "simulado")  # nunca se hace pasar por real
            self.assertTrue(-27.0 < x["latitud"] < -26.6 and -65.5 < x["longitud"] < -65.0)
        # y se pueden validar: confirmar la primera, descartar la segunda
        a, b = d["detecciones"][:2]
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{a['id']}/confirmar/", {}, format="json").json()["statusType"], "confirmado")
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{b['id']}/descartar/", {}, format="json").json()["statusType"], "descartado")

    def test_cantidad_se_limita_y_se_valida(self):
        self.crear_foco()
        self.login_as("operador")
        self.assertEqual(self.client.post("/api/detecciones-ia/analizar/", {"cantidad": 500}, format="json").json()["creadas"], 8)
        self.assertEqual(self.client.post("/api/detecciones-ia/analizar/", {"cantidad": "abc"}, format="json").status_code, 400)

    def test_supervisor_no_puede_ejecutar_el_analisis(self):
        self.login_as("supervisor")
        self.assertEqual(self.client.post("/api/detecciones-ia/analizar/", {}, format="json").status_code, 403)
