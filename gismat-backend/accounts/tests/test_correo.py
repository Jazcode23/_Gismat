import smtplib
from io import StringIO

from django.core import mail
from django.core.cache import cache
from django.core.checks import run_checks
from django.core.management import call_command
from django.test import SimpleTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.emails import enviar_correo
from accounts.models import Roles, Usuario

PW = "Prueba#2026x"
SMTP = "django.core.mail.backends.smtp.EmailBackend"


class BackendQueFalla:
    """Simula que Gmail rechaza el envío (credenciales inválidas)."""

    def __init__(self, *a, **k):
        pass

    def send_messages(self, msgs):
        raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")

    def open(self): ...
    def close(self): ...


class FalloDeSmtpTests(APITestCase):
    def setUp(self):
        cache.clear()
        admin = Usuario.objects.create_user("adm", "adm@t.com", PW, rol=Roles.ADMINISTRADOR, email_verificado=True)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=admin).key}")

    @override_settings(EMAIL_BACKEND="accounts.tests.test_correo.BackendQueFalla")
    def test_alta_con_smtp_caido_crea_la_cuenta_y_avisa(self):
        r = self.client.post("/api/usuarios/", {"usuario": "ana", "email": "ana@gmail.com", "password": PW, "rol": "operador"},
                             format="json")
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.json()["correoEnviado"])
        self.assertIn("no se pudo enviar", r.json()["aviso"])
        self.assertFalse(Usuario.objects.get(username="ana").email_verificado)  # sigue bloqueada hasta verificar

    def test_alta_normal_informa_correo_enviado(self):
        r = self.client.post("/api/usuarios/", {"usuario": "bea", "email": "bea@gmail.com", "password": PW, "rol": "operador"},
                             format="json")
        self.assertTrue(r.json()["correoEnviado"])
        self.assertNotIn("aviso", r.json())
        self.assertEqual(mail.outbox[0].to, ["bea@gmail.com"])

    @override_settings(EMAIL_BACKEND="accounts.tests.test_correo.BackendQueFalla")
    def test_recuperacion_con_smtp_caido_no_delata_si_el_correo_existe(self):
        Usuario.objects.create_user("juan", "juan@gmail.com", PW, email_verificado=True)
        self.client.credentials()
        a = self.client.post("/api/auth/recuperar/", {"email": "juan@gmail.com"}, format="json")
        b = self.client.post("/api/auth/recuperar/", {"email": "nadie@gmail.com"}, format="json")
        self.assertEqual((a.status_code, b.status_code), (200, 200))
        self.assertEqual(a.json(), b.json())

    @override_settings(EMAIL_BACKEND="accounts.tests.test_correo.BackendQueFalla")
    def test_enviar_correo_devuelve_false_y_no_lanza(self):
        self.assertFalse(enviar_correo("x", "y", "a@b.com"))


class ConfiguracionYComandoTests(SimpleTestCase):
    @override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST="", EMAIL_HOST_USER="", EMAIL_HOST_PASSWORD="")
    def test_chequeo_avisa_si_falta_configuracion(self):
        ids = {w.id for w in run_checks()}
        self.assertIn("gismat.W001", ids)

    @override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST="smtp.gmail.com", EMAIL_HOST_USER="tu.cuenta@gmail.com",
                       EMAIL_HOST_PASSWORD="contraseña-de-aplicación")
    def test_chequeo_detecta_valores_de_ejemplo(self):
        self.assertIn("gismat.W002", {w.id for w in run_checks()})

    @override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST="smtp.gmail.com", EMAIL_HOST_USER="real@gmail.com",
                       EMAIL_HOST_PASSWORD="abcdefghijklmnop")
    def test_configuracion_correcta_sin_avisos(self):
        self.assertEqual({w.id for w in run_checks()} & {"gismat.W001", "gismat.W002", "gismat.W003"}, set())

    @override_settings(EMAIL_HOST_PASSWORD="SuperSecretaDeAplicacion", EMAIL_HOST_USER="real@gmail.com")
    def test_probar_correo_no_expone_la_contrasena(self):
        out = StringIO()
        call_command("probar_correo", "dest@gmail.com", stdout=out)
        self.assertNotIn("SuperSecretaDeAplicacion", out.getvalue())
        self.assertIn("24 caracteres", out.getvalue())
        self.assertEqual(mail.outbox[-1].to, ["dest@gmail.com"])

    def test_probar_correo_valida_destino(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command("probar_correo", "no-es-un-correo", stdout=StringIO())

    @override_settings(EMAIL_BACKEND="accounts.tests.test_correo.BackendQueFalla")
    def test_probar_correo_diagnostica_error_de_autenticacion(self):
        err = StringIO()
        with self.assertRaises(SystemExit):
            call_command("probar_correo", "dest@gmail.com", stdout=StringIO(), stderr=err)
        self.assertIn("CONTRASEÑA DE APLICACIÓN", err.getvalue())
