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

    def test_atender_la_alerta_cambia_el_estado_del_foco_a_pendiente_de_intervencion(self):
        codigo = self.foco_critico()
        self.assertEqual(m.Foco.objects.get(codigo=codigo).estado, "activo")
        self.login_as("supervisor")
        a = next(x for x in self.client.get("/api/geoportal/alertas").json() if x["focoId"] == codigo)
        self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json")
        self.assertEqual(m.Foco.objects.get(codigo=codigo).estado, "pendiente")
        # al repetir la acción no cambia nada ni se vuelve a emitir la alerta
        self.client.post(f"/api/alertas/{a['pk']}/atender/", {}, format="json")
        self.assertEqual(m.Foco.objects.get(codigo=codigo).estado, "pendiente")
        self.assertFalse(any(x["focoId"] == codigo for x in self.client.get("/api/geoportal/alertas").json()))

    def test_operador_y_analista_no_pueden_marcar_alertas_como_atendidas(self):
        codigo = self.foco_critico()
        pk = m.Alerta.objects.filter(foco__codigo=codigo).first().pk
        for rol in ("operador", "analista"):
            self.login_as(rol)
            self.assertEqual(self.client.post(f"/api/alertas/{pk}/atender/", {}, format="json").status_code, 403, rol)
        self.assertEqual(m.Alerta.objects.get(pk=pk).estado, "activa")
