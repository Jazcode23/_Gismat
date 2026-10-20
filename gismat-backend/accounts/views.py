from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.db import IntegrityError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import enviar_correo
from .models import Usuario
from .permissions import SoloAdministrador
from .serializers import (CambioContrasenaSerializer, RegistroSerializer, normalizar_registro, LoginSerializer, PerfilSerializer,
                          RecuperacionSerializer, RestablecerSerializer, UsuarioSerializer)

SALT_VERIFICACION = "gismat-verificar-email"


def enviar_verificacion(usuario):
    token = signing.dumps({"uid": usuario.pk}, salt=SALT_VERIFICACION)
    link = f"{settings.FRONTEND_URL}/verificar-email?token={token}"
    return enviar_correo("GISMAT - Verificá tu correo",
                         f"Hola {usuario.nombre_completo},\n\nConfirmá tu correo ingresando a:\n{link}\n",
                         usuario.email)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "login"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
        Token.objects.filter(user=user).delete()  # una sesión vigente por usuario
        token = Token.objects.create(user=user)
        return Response({"token": token.key, "usuario": PerfilSerializer(user).data})


class RegistroView(APIView):
    """Registro público (pantalla "Registrate"). Crea la cuenta en PostgreSQL con la contraseña hasheada.

    No devuelve token: después de registrarse la persona inicia sesión con el login normal."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "registro"

    def post(self, request):
        if not settings.REGISTRO_PUBLICO:
            return Response({"detail": "El registro público está deshabilitado. Solicitá tu cuenta al administrador."}, status=403)
        if not hasattr(request.data, "get"):
            return Response({"detail": "Datos inválidos.", "errors": {"non_field_errors": ["Se esperaba un objeto JSON."]}}, status=400)
        datos, usadas = normalizar_registro(request.data)
        s = RegistroSerializer(data=datos)

        def error(errs):  # las claves de `errors` son las que usó el frontend (p. ej. "correo", no "email")
            return Response({"detail": "Revisá los datos del formulario.",
                             "errors": {usadas.get(k, k): v for k, v in errs.items()}}, status=400)

        if not s.is_valid():
            return error(s.errors)
        try:
            user = s.save()
        except IntegrityError:  # dos registros simultáneos con el mismo usuario/correo/documento
            s2 = RegistroSerializer(data=datos)
            s2.is_valid()
            return error(s2.errors or {"non_field_errors": ["Ese usuario o correo ya está registrado."]})
        verificar = settings.REGISTRO_VERIFICAR_CORREO
        out = {"detail": ("Cuenta creada. Te enviamos un correo para verificarla antes de iniciar sesión." if verificar
                          else "Cuenta creada. Ya podés iniciar sesión."),
               "usuario": PerfilSerializer(user).data, "puedeIniciarSesion": not verificar,
               "requiereVerificacionCorreo": verificar}
        if verificar:
            out["correoEnviado"] = enviar_verificacion(user)
        return Response(out, status=201)


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PerfilView(APIView):
    def get(self, request):
        return Response(PerfilSerializer(request.user).data)

    def put(self, request):
        s = PerfilSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    patch = put


class CambioContrasenaView(APIView):
    def post(self, request):
        s = CambioContrasenaSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data["nueva"])
        request.user.save()
        Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Contraseña actualizada. Volvé a iniciar sesión."})


class VerificarEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            data = signing.loads(request.data.get("token", ""), salt=SALT_VERIFICACION, max_age=3 * 24 * 3600)
            user = Usuario.objects.get(pk=data["uid"])
        except (signing.BadSignature, Usuario.DoesNotExist):
            return Response({"detail": "El enlace es inválido o expiró."}, status=400)
        user.email_verificado = True
        user.save(update_fields=["email_verificado"])
        return Response({"detail": "Correo verificado."})


class RecuperarView(APIView):
    """Siempre responde 200 para no revelar si el correo existe."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "recuperacion"

    def post(self, request):
        s = RecuperacionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = Usuario.objects.filter(email__iexact=s.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/restablecer?uid={uid}&token={token}"
            # Si el envío falla se registra en el log y la respuesta es la misma (no revela si el correo existe)
            enviar_correo("GISMAT - Restablecer contraseña",
                          f"Para crear una nueva contraseña ingresá a:\n{link}\n\nSi no lo pediste, ignorá este correo.",
                          user.email)
        return Response({"detail": "Si el correo está registrado, te enviamos instrucciones."})


class RestablecerView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "recuperacion"

    def post(self, request):
        s = RestablecerSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = Usuario.objects.get(pk=force_str(urlsafe_base64_decode(s.validated_data["uid"])))
        except (Usuario.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({"detail": "Enlace inválido."}, status=400)
        if not default_token_generator.check_token(user, s.validated_data["token"]):
            return Response({"detail": "El enlace es inválido o expiró."}, status=400)
        user.set_password(s.validated_data["nueva"])
        user.save()
        Token.objects.filter(user=user).delete()
        return Response({"detail": "Contraseña restablecida."})


class UsuarioViewSet(viewsets.ModelViewSet):
    """ABM de usuarios (solo Administrador). La baja es lógica: is_active=False."""

    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [SoloAdministrador]

    def perform_create(self, serializer):
        user = serializer.save()
        self._correo_enviado = enviar_verificacion(user)

    def create(self, request, *args, **kwargs):
        resp = super().create(request, *args, **kwargs)
        # Campos agregados: la cuenta se crea igual aunque el correo falle, pero el administrador debe enterarse.
        resp.data["correoEnviado"] = self._correo_enviado
        if not self._correo_enviado:
            resp.data["aviso"] = ("El usuario se creó pero no se pudo enviar el correo de verificación. "
                                  "Revisá la configuración de correo (docs/CORREO.md) o verificalo desde /admin/.")
        return resp

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({"detail": "No podés dar de baja tu propia cuenta."}, status=400)
        user.is_active = False
        user.save(update_fields=["is_active"])
        Token.objects.filter(user=user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="reactivar")
    def reactivar(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UsuarioSerializer(user).data)
