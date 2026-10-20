from unittest import mock

from django.contrib.auth.hashers import identify_hasher
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Roles, Usuario

PW = "Clave#Segura2026"
URL = "/api/auth/registro/"


def datos(**kw):
    base = {"usuario": "maria.perez", "email": "maria.perez@gmail.com", "password": PW, "confirmar": PW,
            "nombre": "María", "apellido": "Pérez"}
    base.update(kw)
    return {k: v for k, v in base.items() if v is not None}


class RegistroTests(APITestCase):
    def setUp(self):
        cache.clear()
        # usuarios demo existentes
        for n, rol in (("admin", Roles.ADMINISTRADOR), ("operador", Roles.OPERADOR), ("analista", Roles.ANALISTA),
                       ("supervisor", Roles.SUPERVISOR)):
            Usuario.objects.create_user(n, f"{n}@gismat.local", "Demo#Gismat2026", rol=rol, email_verificado=True)

    def login(self, usuario, password):
        return self.client.post("/api/auth/login/", {"usuario": usuario, "password": password}, format="json")

    # ------------------------------------------------------------ camino feliz
    def test_registro_guarda_en_la_base_y_permite_iniciar_sesion(self):
        r = self.client.post(URL, datos(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        u = Usuario.objects.get(username="maria.perez")
        self.assertEqual((u.email, u.first_name, u.last_name), ("maria.perez@gmail.com", "María", "Pérez"))
        self.assertTrue(u.is_active and u.email_verificado)
        self.assertNotEqual(u.password, PW)                       # nunca en texto plano
        self.assertEqual(identify_hasher(u.password).algorithm, "pbkdf2_sha256")
        self.assertTrue(u.check_password(PW))
        self.assertNotIn(PW, r.content.decode())                   # la contraseña no vuelve en la respuesta
        self.assertNotIn("password", r.json()["usuario"])
        self.assertTrue(r.json()["puedeIniciarSesion"])
        self.assertNotIn("token", r.json())                        # inicia sesión por el login normal
        self.assertEqual(len(mail.outbox), 0)                      # sin envío de correos
        ok = self.login("maria.perez", PW)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.login("maria.perez@gmail.com", PW).status_code, 200)  # también por correo

    def test_correo_se_guarda_normalizado(self):
        self.client.post(URL, datos(email="  Maria.Perez@GMAIL.com "), format="json")
        self.assertEqual(Usuario.objects.get(username="maria.perez").email, "maria.perez@gmail.com")

    def test_acepta_otros_nombres_de_campo_del_formulario(self):
        r = self.client.post(URL, {"username": "juan_g", "correo": "juan@gmail.com", "contraseña": PW,
                                   "confirmPassword": PW, "nombreCompleto": "Juan Carlos García"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        u = Usuario.objects.get(username="juan_g")
        self.assertEqual((u.first_name, u.last_name), ("Juan", "Carlos García"))

    def test_acepta_formulario_urlencoded(self):
        r = self.client.post(URL, datos(), format="multipart")
        self.assertEqual(r.status_code, 201, r.content)

    def test_confirmacion_es_opcional(self):
        self.assertEqual(self.client.post(URL, datos(confirmar=None), format="json").status_code, 201)

    # ------------------------------------------------------------ duplicados (insensibles a mayúsculas)
    def test_correo_duplicado(self):
        self.client.post(URL, datos(), format="json")
        r = self.client.post(URL, datos(usuario="otra", email="MARIA.PEREZ@gmail.com"), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["errors"], {"email": ["Ese correo electrónico ya está registrado."]})
        self.assertEqual(Usuario.objects.filter(username="otra").count(), 0)

    def test_usuario_duplicado(self):
        self.client.post(URL, datos(), format="json")
        r = self.client.post(URL, datos(usuario="MARIA.perez", email="otro@gmail.com"), format="json")
        self.assertEqual(r.json()["errors"], {"usuario": ["Ese nombre de usuario ya está registrado."]})

    def test_no_se_puede_registrar_el_nombre_de_un_usuario_demo(self):
        for n in ("admin", "Operador", "ANALISTA", "supervisor"):
            r = self.client.post(URL, datos(usuario=n, email=f"x{n}@gmail.com"), format="json")
            self.assertEqual(r.status_code, 400, n)
            self.assertIn("usuario", r.json()["errors"])

    def test_los_errores_usan_las_claves_que_envio_el_frontend(self):
        self.client.post(URL, datos(), format="json")
        r = self.client.post(URL, {"username": "z_user", "correo": "maria.perez@gmail.com", "contraseña": PW}, format="json")
        self.assertEqual(list(r.json()["errors"]), ["correo"])

    def test_documento_duplicado_e_invalido(self):
        self.client.post(URL, datos(documento="30111222"), format="json")
        r = self.client.post(URL, datos(usuario="otra", email="o@gmail.com", documento="30111222"), format="json")
        self.assertIn("documento", r.json()["errors"])
        r = self.client.post(URL, datos(usuario="otra", email="o@gmail.com", documento="abc"), format="json")
        self.assertIn("documento", r.json()["errors"])

    # ------------------------------------------------------------ validaciones
    def test_campos_obligatorios_con_mensajes_claros(self):
        r = self.client.post(URL, {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], "Revisá los datos del formulario.")
        self.assertEqual(r.json()["errors"], {"usuario": ["El nombre de usuario es obligatorio."],
                                              "email": ["El correo electrónico es obligatorio."],
                                              "password": ["La contraseña es obligatoria."]})

    def test_correo_invalido(self):
        for mal in ("no-es-correo", "a@b", "@gmail.com", "a b@gmail.com"):
            r = self.client.post(URL, datos(email=mal), format="json")
            self.assertIn("email", r.json()["errors"], mal)

    def test_usuario_invalido(self):
        for mal in ("ab", "con espacio", "con@arroba", "x" * 31, "ñandú!"):
            r = self.client.post(URL, datos(usuario=mal), format="json")
            self.assertIn("usuario", r.json()["errors"], mal)

    def test_contrasena_debil_y_no_coincidente(self):
        r = self.client.post(URL, datos(password="debil", confirmar="debil"), format="json")
        self.assertIn("password", r.json()["errors"])
        r = self.client.post(URL, datos(confirmar="Otra#Clave2026"), format="json")
        self.assertEqual(r.json()["errors"], {"confirmar": ["Las contraseñas no coinciden."]})
        self.assertEqual(Usuario.objects.filter(username="maria.perez").count(), 0)

    def test_todos_los_errores_se_informan_juntos(self):
        r = self.client.post(URL, {"usuario": "x", "email": "malo", "password": "123", "confirmar": "456"}, format="json")
        self.assertEqual(sorted(r.json()["errors"]), ["confirmar", "email", "password", "usuario"])

    def test_cuerpo_que_no_es_objeto(self):
        self.assertEqual(self.client.post(URL, [1, 2], format="json").status_code, 400)

    # ------------------------------------------------------------ seguridad
    def test_no_se_puede_elegir_rol_ni_privilegios(self):
        r = self.client.post(URL, datos(rol="administrador", is_staff=True, is_superuser=True, is_active=False,
                                        email_verificado=False), format="json")
        self.assertEqual(r.status_code, 201)
        u = Usuario.objects.get(username="maria.perez")
        self.assertEqual(u.rol, "supervisor")
        self.assertFalse(u.is_staff or u.is_superuser)
        self.assertTrue(u.is_active and u.email_verificado)

    @override_settings(REGISTRO_ROL_POR_DEFECTO="operador")
    def test_rol_por_defecto_configurable(self):
        self.client.post(URL, datos(), format="json")
        self.assertEqual(Usuario.objects.get(username="maria.perez").rol, "operador")

    @override_settings(REGISTRO_PUBLICO=False)
    def test_registro_deshabilitado(self):
        r = self.client.post(URL, datos(), format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Usuario.objects.filter(username="maria.perez").count(), 0)

    def test_limite_de_registros_por_hora(self):
        from rest_framework.throttling import SimpleRateThrottle
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {"registro": "3/hour"}):
            codigos = [self.client.post(URL, datos(usuario=f"user{i}", email=f"user{i}@gmail.com"), format="json").status_code
                       for i in range(5)]
        self.assertEqual(codigos, [201, 201, 201, 429, 429])

    def test_cuenta_registrada_tiene_los_permisos_del_rol_asignado(self):
        self.client.post(URL, datos(), format="json")
        tok = self.login("maria.perez", PW).json()["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {tok}")
        self.assertEqual(self.client.get("/api/focos/").status_code, 200)       # supervisor: ver
        self.assertEqual(self.client.post("/api/focos/", {}, format="json").status_code, 403)  # no crea focos
        self.assertEqual(self.client.get("/api/usuarios/").status_code, 403)    # no gestiona usuarios

    # ------------------------------------------------------------ usuarios demo siguen funcionando
    def test_usuarios_demo_siguen_iniciando_sesion(self):
        self.client.post(URL, datos(), format="json")
        for n in ("admin", "operador", "analista", "supervisor"):
            r = self.login(n, "Demo#Gismat2026")
            self.assertEqual(r.status_code, 200, n)
            self.assertEqual(r.json()["usuario"]["rol"], {"admin": "administrador"}.get(n, n))

    # ------------------------------------------------------------ modo con verificación de correo
    @override_settings(REGISTRO_VERIFICAR_CORREO=True)
    def test_con_verificacion_exige_confirmar_el_correo(self):
        r = self.client.post(URL, datos(), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.json()["puedeIniciarSesion"])
        self.assertTrue(r.json()["correoEnviado"])
        self.assertEqual(mail.outbox[0].to, ["maria.perez@gmail.com"])
        self.assertEqual(self.login("maria.perez", PW).status_code, 400)
