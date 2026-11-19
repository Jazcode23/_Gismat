"""ABM de focos con foto (multipart), metadatos para interpretar gráficos y KPI del dashboard."""
import io

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from geoportal import models as m

from .base import BaseGismat


def imagen(nombre="foto.png"):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (70, 110, 60)).save(buf, format="PNG")
    return SimpleUploadedFile(nombre, buf.getvalue(), content_type="image/png")


def multipart(payload, **extra):
    """Igual que el formulario del frontend: todos los valores como texto."""
    return {**{k: str(v) for k, v in payload.items()}, **extra}


@override_settings(MEDIA_ROOT="/tmp/gismat_test_media")
class FotoFocoTests(BaseGismat):
    def test_alta_con_foto_multipart(self):
        self.login_as("operador")
        r = self.client.post("/api/focos/", multipart(self.payload(), foto=imagen()), format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["foto"].endswith(".png"))

    def test_reemplazar_y_quitar_foto(self):
        self.login_as("operador")
        f = self.client.post("/api/focos/", multipart(self.payload(), foto=imagen("a.png")), format="multipart").json()
        r = self.client.patch(f"/api/focos/{f['id']}/", {"foto": imagen("b.png")}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("b", r.json()["foto"])
        # El frontend quita la foto enviando el campo vacío
        r = self.client.patch(f"/api/focos/{f['id']}/", multipart(self.payload(), foto=""), format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["foto"])

    def test_edicion_json_no_toca_la_foto(self):
        self.login_as("operador")
        f = self.client.post("/api/focos/", multipart(self.payload(), foto=imagen()), format="multipart").json()
        r = self.client.patch(f"/api/focos/{f['id']}/", {"observaciones": "x"}, format="json")
        self.assertEqual(r.json()["foto"], f["foto"])

    def test_foto_invalida_se_rechaza_con_error_por_campo(self):
        self.login_as("operador")
        malo = SimpleUploadedFile("x.txt", b"no es imagen", content_type="text/plain")
        r = self.client.post("/api/focos/", multipart(self.payload(), foto=malo), format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("foto", r.json()["errors"])
        self.assertEqual(m.Foco.objects.count(), 0)


class MetadatosTests(BaseGismat):
    def test_metadatos_reflejan_umbrales_reales(self):
        self.login_as("supervisor")
        r = self.client.get("/api/metadatos/")
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(j["irh"]["umbrales"], {"moderado": settings.IRH_UMBRAL_MODERADO, "critico": settings.IRH_UMBRAL_CRITICO})
        self.assertEqual([n["nivel"] for n in j["irh"]["niveles"]], ["Crítico", "Moderado", "Bajo"])
        self.assertAlmostEqual(sum(p["peso"] for p in j["irh"]["pesos"]), 1.0)
        for g in ("detecciones_mensuales", "confianza_ia", "riesgo_por_nivel", "riesgo_mensual"):
            for campo in ("mide", "unidad", "periodo", "fuente", "comoLeer"):
                self.assertTrue(j["graficos"][g][campo], (g, campo))

    def test_metadatos_requieren_sesion(self):
        self.assertIn(self.client.get("/api/metadatos/").status_code, (401, 403))

    @override_settings(IRH_UMBRAL_CRITICO=80.0)
    def test_si_cambia_el_umbral_cambian_los_textos(self):
        self.login_as("analista")
        j = self.client.get("/api/metadatos/").json()
        self.assertIn("≥ 80", j["irh"]["leyenda"])
        self.assertIn("≥ 80", j["graficos"]["riesgo_mensual"]["fuente"])


class DashboardKpiTests(BaseGismat):
    def test_cursos_afectados_y_alertas(self):
        self.crear_foco()
        d = self.client.get("/api/dashboard/").json()
        self.assertEqual(d["cursosAfectados"], 1)
        self.assertIn("activas", d["alertas"])


class BajaPrecondicionTests(BaseGismat):
    """CU007: la baja solo procede desde Activo o Saneado."""

    def test_baja_desde_activo_y_saneado(self):
        for estado in ("activo", "limpiado"):
            f = self.crear_foco(estado=estado)
            self.login_as("administrador")  # la baja es solo del administrador
            r = self.client.delete(f"/api/focos/{f['id']}/", {"motivo": "t"}, format="json")
            self.assertEqual(r.status_code, 200, (estado, r.content))
            self.assertEqual(r.json()["estado"], "inactivo")

    def test_baja_desde_pendiente_se_rechaza_y_no_cambia_el_estado(self):
        f = self.crear_foco(estado="pendiente")
        self.login_as("administrador")
        r = self.client.delete(f"/api/focos/{f['id']}/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Activo o Saneado", r.json()["detail"])
        self.assertEqual(m.Foco.objects.get(codigo=f["id"]).estado, "pendiente")

    def test_baja_conserva_historial_e_intervenciones(self):
        f = self.crear_foco()
        antes = m.HistorialIRH.objects.filter(foco__codigo=f["id"]).count()
        self.login_as("administrador")
        self.client.delete(f"/api/focos/{f['id']}/", {}, format="json")
        self.assertGreaterEqual(m.HistorialIRH.objects.filter(foco__codigo=f["id"]).count(), antes)
        self.assertTrue(m.Foco.objects.filter(codigo=f["id"]).exists())

    def test_foco_dado_de_baja_no_aparece_en_el_visor(self):
        f = self.crear_foco(estado="activo")
        self.login_as("administrador")
        self.assertIn(f["id"], [x["id"] for x in self.client.get("/api/geoportal/focos").json()])
        self.client.delete(f"/api/focos/{f['id']}/", {}, format="json")
        self.assertNotIn(f["id"], [x["id"] for x in self.client.get("/api/geoportal/focos").json()])
        # sigue consultable si se pide explícitamente por estado
        self.assertIn(f["id"], [x["id"] for x in self.client.get("/api/geoportal/focos?estado=inactivo").json()])
