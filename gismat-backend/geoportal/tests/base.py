from django.contrib.gis.geos import LineString, Point, Polygon
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.models import Roles, Usuario
from geoportal import models as m

PW = "Prueba#2026x"


@override_settings(FOCO_CODIGO_RESERVADO=0)  # las pruebas no dependen de la reserva configurada en el entorno
class BaseGismat(APITestCase):
    """Escenario: un canal horizontal en lat -26.80 y una microcuenca que lo rodea."""

    @classmethod
    def setUpTestData(cls):
        cls.tipo_ind = m.TipoResiduo.objects.create(codigo="industrial", nombre="Industrial", factor_peligrosidad=0.9)
        cls.tipo_org = m.TipoResiduo.objects.create(codigo="organico", nombre="Orgánico", factor_peligrosidad=0.3)
        cls.canal = m.CursoAgua.objects.create(codigo="canal-test", nombre="Canal Test", tipo="Canal Troncal Pluvial",
                                               geom=LineString((-65.25, -26.80), (-65.20, -26.80), srid=4326))
        cls.mc = m.Microcuenca.objects.create(codigo="mc-test", nombre="Microcuenca Test", geom=Polygon(
            ((-65.26, -26.79), (-65.19, -26.79), (-65.19, -26.82), (-65.26, -26.82), (-65.26, -26.79)), srid=4326))
        m.Cuadrilla.objects.create(codigo="alfa", nombre="Cuadrilla Alfa")
        cls.users = {}
        for rol in Roles.values:
            cls.users[rol] = Usuario.objects.create_user(username=rol, email=f"{rol}@t.com", password=PW, rol=rol,
                                                         email_verificado=True)

    def login_as(self, rol):
        Token.objects.filter(user=self.users[rol]).delete()
        t = Token.objects.create(user=self.users[rol])
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {t.key}")

    def payload(self, **kw):
        base = {"tipo": "basural", "ubicacion": "Av. Test 123", "latitud": -26.8009, "longitud": -65.22,
                "volumenM3": 400, "permeabilidad": "alta", "tipoResiduo": "industrial", "barrio": "Test"}
        base.update(kw)
        return base

    def crear_foco(self, **kw):
        self.login_as("analista")
        r = self.client.post("/api/focos/", self.payload(**kw), format="json")
        assert r.status_code == 201, r.content
        return r.json()
