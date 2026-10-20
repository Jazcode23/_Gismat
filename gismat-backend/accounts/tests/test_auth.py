from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.models import Roles, Usuario

PW = "Prueba#2026x"


class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # el límite de intentos de login usa la caché; se aísla cada prueba
        self.u = Usuario.objects.create_user("juan", "juan@t.com", PW, rol=Roles.OPERADOR, email_verificado=True)

    def login(self, **kw):
        return self.client.post("/api/auth/login/", {"usuario": "juan", "password": PW, **kw}, format="json")

    def test_login_ok_y_perfil(self):
        r = self.login()
        self.assertEqual(r.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
        self.assertEqual(self.client.get("/api/auth/perfil/").json()["rol"], "operador")

    def test_login_por_correo(self):
        r = self.client.post("/api/auth/login/", {"email": "JUAN@t.com", "password": PW}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_credenciales_invalidas_mensaje_generico(self):
        a = self.login(password="mala").json()
        b = self.client.post("/api/auth/login/", {"usuario": "noexiste", "password": "x"}, format="json").json()
        self.assertEqual(str(a), str(b))

    def test_inactivo_y_no_verificado(self):
        self.u.is_active = False
        self.u.save()
        self.assertEqual(self.login().status_code, 400)
        self.u.is_active, self.u.email_verificado = True, False
        self.u.save()
        self.assertEqual(self.login().status_code, 400)

    def test_password_hasheada(self):
        self.assertNotEqual(self.u.password, PW)
        self.assertTrue(self.u.password.startswith(("pbkdf2_", "argon2", "bcrypt")))

    def test_logout_invalida_token(self):
        tok = self.login().json()["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {tok}")
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/perfil/").status_code, 401)

    def test_token_expirado(self):
        tok = self.login().json()["token"]
        Token.objects.filter(key=tok).update(created=timezone.now() - timedelta(hours=100))
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {tok}")
        self.assertEqual(self.client.get("/api/auth/perfil/").status_code, 401)

    def test_sin_token_401(self):
        self.assertEqual(self.client.get("/api/focos/").status_code, 401)

    def test_cambio_contrasena(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.login().json()['token']}")
        r = self.client.post("/api/auth/cambiar-contrasena/", {"actual": "mala", "nueva": "Nueva#2026x"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/cambiar-contrasena/", {"actual": PW, "nueva": "debil"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/cambiar-contrasena/", {"actual": PW, "nueva": "Nueva#2026x"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.login(password="Nueva#2026x").status_code, 200)

    def test_perfil_no_permite_escalar_rol(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.login().json()['token']}")
        self.client.put("/api/auth/perfil/", {"rol": "administrador", "first_name": "x", "nombre": "Juan"}, format="json")
        self.u.refresh_from_db()
        self.assertEqual(self.u.rol, Roles.OPERADOR)

    def test_recuperacion_no_revela_existencia(self):
        a = self.client.post("/api/auth/recuperar/", {"email": "juan@t.com"}, format="json")
        b = self.client.post("/api/auth/recuperar/", {"email": "nadie@t.com"}, format="json")
        self.assertEqual(a.json(), b.json())

    def test_abm_usuarios_solo_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.login().json()['token']}")
        self.assertEqual(self.client.get("/api/usuarios/").status_code, 403)
        admin = Usuario.objects.create_user("adm", "adm@t.com", PW, rol=Roles.ADMINISTRADOR, email_verificado=True)
        t = Token.objects.create(user=admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {t.key}")
        nuevo = {"usuario": "ana", "email": "ana@t.com", "password": PW, "rol": "analista", "documento": "30111222"}
        self.assertEqual(self.client.post("/api/usuarios/", nuevo, format="json").status_code, 201)
        # duplicados
        self.assertEqual(self.client.post("/api/usuarios/", nuevo, format="json").status_code, 400)
        dup_doc = {**nuevo, "usuario": "ana2", "email": "ana2@t.com"}
        self.assertIn("documento", self.client.post("/api/usuarios/", dup_doc, format="json").json()["errors"])
        # rol inválido y contraseña débil
        self.assertEqual(self.client.post("/api/usuarios/", {**dup_doc, "documento": "1", "rol": "dios"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/usuarios/", {**dup_doc, "documento": "30999888", "password": "123"}, format="json").status_code, 400)
        # baja lógica
        uid = Usuario.objects.get(username="ana").pk
        self.assertEqual(self.client.delete(f"/api/usuarios/{uid}/").status_code, 204)
        self.assertFalse(Usuario.objects.get(pk=uid).is_active)

    def test_limite_de_intentos_de_login(self):
        codigos = [self.login(password="mala").status_code for _ in range(12)]
        self.assertIn(429, codigos)


class CorreoTests(APITestCase):
    """El mail de verificación y el de recuperación salen al correo con el que se registró la cuenta."""

    def setUp(self):
        cache.clear()
        self.admin = Usuario.objects.create_user("adm", "adm@t.com", PW, rol=Roles.ADMINISTRADOR, email_verificado=True)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")

    def test_alta_envia_verificacion_al_gmail_y_bloquea_hasta_verificar(self):
        from django.core import mail
        import re
        r = self.client.post("/api/usuarios/", {"usuario": "maria", "email": "Maria.Perez@Gmail.com", "password": PW,
                                                "rol": "operador"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Usuario.objects.get(username="maria").email, "maria.perez@gmail.com")  # normalizado
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["maria.perez@gmail.com"])
        self.client.credentials()
        login = lambda: self.client.post("/api/auth/login/", {"usuario": "maria", "password": PW}, format="json")
        self.assertEqual(login().status_code, 400)  # sin verificar no entra
        token = re.search(r"token=([^\s]+)", mail.outbox[0].body).group(1)
        self.assertEqual(self.client.post("/api/auth/verificar-email/", {"token": token}, format="json").status_code, 200)
        self.assertEqual(login().status_code, 200)

    def test_recuperacion_envia_enlace_al_correo_registrado_y_restablece(self):
        from django.core import mail
        import re
        Usuario.objects.create_user("juan", "juan@gmail.com", PW, rol=Roles.OPERADOR, email_verificado=True)
        self.client.credentials()
        self.client.post("/api/auth/recuperar/", {"email": "JUAN@gmail.com"}, format="json")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["juan@gmail.com"])
        uid, token = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body).groups()
        malo = {"uid": uid, "token": token, "nueva": "debil", "confirmar": "debil"}
        self.assertEqual(self.client.post("/api/auth/restablecer/", malo, format="json").status_code, 400)
        nueva = "Nueva#2026x"
        ok = {"uid": uid, "token": token, "nueva": nueva, "confirmar": nueva}
        self.assertEqual(self.client.post("/api/auth/restablecer/", ok, format="json").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/login/", {"usuario": "juan", "password": nueva}, format="json").status_code, 200)
        # el enlace es de un solo uso
        self.assertEqual(self.client.post("/api/auth/restablecer/", ok, format="json").status_code, 400)

    def test_correo_inexistente_no_envia_nada(self):
        from django.core import mail
        self.client.credentials()
        self.client.post("/api/auth/recuperar/", {"email": "nadie@gmail.com"}, format="json")
        self.assertEqual(len(mail.outbox), 0)
