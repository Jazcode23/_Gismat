"""CU016 - Recibir y consultar alerta automática (Supervisor)."""
from geoportal import models as m

from .base import BaseGismat


class AlertaCriticaTests(BaseGismat):
    def foco_critico(self):
        """Foco con datos completos, junto al canal de prueba (a ~100 m), con IRH crítico."""
        f = self.crear_foco(estado="activo", volumenM3=900)
        self.assertEqual(f["nivelRiesgo"], "Crítico", f)
        return f["id"]

    def test_foco_critico_genera_alerta_con_recomendacion_accionable_para_el_supervisor(self):
        codigo = self.foco_critico()
        self.login_as("supervisor")
        alertas = [a for a in self.client.get("/api/geoportal/alertas").json() if a["focoId"] == codigo]
        self.assertEqual(len(alertas), 1)
        a = alertas[0]
        self.assertEqual(a["nivel"], "critica")
        self.assertEqual(a["estado"], "activa")
        self.assertEqual(a["destinatario"], "Supervisor")
        self.assertIn("Limpieza prioritaria", a["recomendacion"])   # al menos una recomendación accionable
        self.assertGreaterEqual(len([x for x in a["recomendacion"].split(";") if x.strip()]), 1)
        self.assertIsInstance(a["pk"], int)

    def test_supervisor_marca_la_alerta_como_atendida_y_deja_de_figurar(self):
        codigo = self.foco_critico()
        self.login_as("supervisor")
        a = next(x for x in self.client.get("/api/geoportal/alertas").json() if x["focoId"] == codigo)
        r = self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["estado"], "atendida")
        self.assertFalse(any(x["focoId"] == codigo for x in self.client.get("/api/geoportal/alertas").json()))
        # idempotente
        self.assertEqual(self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json").status_code, 200)

    def test_atender_la_alerta_deja_al_foco_en_intervencion(self):
        codigo = self.foco_critico()
        self.login_as("supervisor")
        self.assertFalse(self.client.get(f"/api/focos/{codigo}/").json()["enIntervencion"])
        a = next(x for x in self.client.get("/api/geoportal/alertas").json() if x["focoId"] == codigo)
        self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json")
        self.assertTrue(self.client.get(f"/api/focos/{codigo}/").json()["enIntervencion"])
        self.assertEqual(m.Foco.objects.get(codigo=codigo).intervenciones.count(), 1)
        visor = next(x for x in self.client.get("/api/geoportal/focos").json() if x["id"] == codigo)
        self.assertTrue(visor["enIntervencion"])   # también en el visor geográfico
        # repetir la acción no duplica la intervención ni vuelve a emitir la alerta
        self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json")
        self.assertEqual(m.Foco.objects.get(codigo=codigo).intervenciones.count(), 1)
        self.assertFalse(any(x["focoId"] == codigo for x in self.client.get("/api/geoportal/alertas").json()))
        # Trazabilidad lo muestra como intervención en curso
        t = next(x for x in self.client.get("/api/trazabilidad/focos/").json() if x["id"] == codigo)
        self.assertEqual(t["statusBadge"], "Intervención en Curso")

    def test_operador_y_analista_no_pueden_marcar_alertas_como_atendidas(self):
        codigo = self.foco_critico()
        pk = m.Alerta.objects.filter(foco__codigo=codigo).first().pk
        for rol in ("operador", "analista"):
            self.login_as(rol)
            self.assertEqual(self.client.post(f"/api/alertas/{pk}/atender/", {}, format="json").status_code, 403, rol)
        self.assertEqual(m.Alerta.objects.get(pk=pk).estado, "activa")


class SeguimientoAlertasTests(BaseGismat):
    def setUp(self):
        from datetime import timedelta
        from django.utils import timezone
        self.timedelta, self.ahora = timedelta, timezone.now()

    def foco_critico(self):
        return self.crear_foco(estado="activo", volumenM3=900)["id"]

    def test_foco_critico_atendido_vuelve_a_alertar_si_sigue_sin_intervenirse(self):
        from geoportal.services import alertas
        codigo = self.foco_critico()
        self.login_as("supervisor")
        a = m.Alerta.objects.get(foco__codigo=codigo)
        self.client.post(f"/api/alertas/{a.pk}/atender/", {}, format="json")
        self.assertEqual(alertas.revisar(self.ahora + self.timedelta(days=1)), [])        # todavía es pronto
        self.assertEqual(alertas.revisar(self.ahora + self.timedelta(days=4)), [])        # en intervención: no se insiste
        m.Intervencion.objects.filter(foco__codigo=codigo).update(estado="completada")    # se terminó y el foco sigue crítico
        nuevas = alertas.revisar(self.ahora + self.timedelta(days=4))                     # pasaron más de 3 días
        self.assertEqual(len(nuevas), 1)
        self.assertEqual(nuevas[0].nivel, "critica")
        self.assertIn("Seguimiento", nuevas[0].titulo)
        self.assertEqual(alertas.revisar(self.ahora + self.timedelta(days=4)), [])        # sin duplicados mientras haya una activa

    def test_foco_limpiado_no_genera_alertas_de_seguimiento(self):
        from geoportal.services import alertas
        codigo = self.foco_critico()
        m.Alerta.objects.filter(foco__codigo=codigo).update(estado="atendida")
        m.Foco.objects.filter(codigo=codigo).update(estado="limpiado")
        self.assertEqual(alertas.revisar(self.ahora + self.timedelta(days=30)), [])

    def test_foco_alto_que_nunca_tuvo_alerta_la_recibe_en_la_revision(self):
        from geoportal.services import alertas
        codigo = self.foco_critico()
        m.Alerta.objects.filter(foco__codigo=codigo).delete()
        self.assertEqual(len(alertas.revisar(self.ahora)), 1)
