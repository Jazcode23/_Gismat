import re

from django.contrib.auth import authenticate
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import serializers

from .models import Roles, Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    """Salida/alta/edición por el administrador. La contraseña es write-only."""

    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    nombre = serializers.CharField(source="first_name", required=False, allow_blank=True)
    apellido = serializers.CharField(source="last_name", required=False, allow_blank=True)
    usuario = serializers.CharField(source="username")
    estado = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "nombre", "apellido", "email", "documento", "usuario", "password",
                  "rol", "is_active", "estado", "email_verificado", "fecha_creacion"]
        read_only_fields = ["email_verificado", "fecha_creacion", "estado"]

    def get_estado(self, obj):
        return "Activo" if obj.is_active else "Inactivo"

    def validate_email(self, v):
        v = v.lower()
        qs = Usuario.objects.filter(email__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un usuario con ese correo.")
        return v

    def validate_documento(self, v):
        if v in (None, ""):
            return None
        if not v.isdigit() or not (7 <= len(v) <= 11):
            raise serializers.ValidationError("El documento debe tener entre 7 y 11 dígitos numéricos.")
        qs = Usuario.objects.filter(documento=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un usuario con ese documento.")
        return v

    def validate_usuario(self, v):
        qs = Usuario.objects.filter(username__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ese nombre de usuario ya está en uso.")
        return v

    def validate(self, attrs):
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "La contraseña es obligatoria."})
        if attrs.get("password"):
            validate_password(attrs["password"], self.instance)
        return attrs

    def create(self, validated):
        password = validated.pop("password")
        return Usuario.objects.create_user(password=password, **validated)

    def update(self, instance, validated):
        password = validated.pop("password", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class PerfilSerializer(serializers.ModelSerializer):
    """El propio usuario solo puede editar nombre, apellido y correo; nunca rol ni estado."""

    nombre = serializers.CharField(source="first_name", required=False, allow_blank=True)
    apellido = serializers.CharField(source="last_name", required=False, allow_blank=True)
    usuario = serializers.CharField(source="username", read_only=True)

    class Meta:
        model = Usuario
        fields = ["id", "nombre", "apellido", "email", "documento", "usuario", "rol", "fecha_creacion"]
        read_only_fields = ["documento", "rol", "fecha_creacion"]

    def validate_email(self, v):
        v = v.lower()
        if Usuario.objects.filter(email__iexact=v).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Ya existe un usuario con ese correo.")
        return v


class LoginSerializer(serializers.Serializer):
    # El login acepta usuario o correo (la pantalla de acceso del frontend pide "correo").
    usuario = serializers.CharField(required=False)
    email = serializers.CharField(required=False)
    password = serializers.CharField(style={"input_type": "password"})

    def validate(self, attrs):
        ident = (attrs.get("usuario") or attrs.get("email") or "").strip()
        if not ident:
            raise serializers.ValidationError("Ingresá usuario o correo.")
        username = ident
        if "@" in ident:
            u = Usuario.objects.filter(email__iexact=ident).first()
            username = u.username if u else ident
        user = authenticate(username=username, password=attrs["password"])
        # Mensaje genérico: no revela si el usuario existe.
        if user is None:
            raise serializers.ValidationError("Credenciales inválidas.")
        if not user.is_active:
            raise serializers.ValidationError("Tu cuenta está inactiva. Contactá al administrador.")
        if not user.email_verificado:
            raise serializers.ValidationError("Tu correo todavía no fue verificado.")
        attrs["user"] = user
        return attrs


class CambioContrasenaSerializer(serializers.Serializer):
    actual = serializers.CharField(write_only=True)
    nueva = serializers.CharField(write_only=True)

    def validate_actual(self, v):
        if not self.context["request"].user.check_password(v):
            raise serializers.ValidationError("La contraseña actual es incorrecta.")
        return v

    def validate_nueva(self, v):
        validate_password(v, self.context["request"].user)
        return v


class RecuperacionSerializer(serializers.Serializer):
    email = serializers.EmailField()


class RestablecerSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    nueva = serializers.CharField(write_only=True)
    confirmar = serializers.CharField(write_only=True)

    def validate(self, a):
        if a["nueva"] != a["confirmar"]:
            raise serializers.ValidationError({"confirmar": "Las contraseñas no coinciden."})
        validate_password(a["nueva"])
        return a


# ----------------------------------------------------------------- Registro público
# El formulario del frontend puede nombrar los campos de distintas formas; se aceptan estos alias (el primero es el canónico).
ALIAS_REGISTRO = {
    "usuario": ("usuario", "username", "nombre_usuario", "nombreUsuario", "user"),
    "email": ("email", "correo", "correo_electronico", "correoElectronico", "mail"),
    "password": ("password", "contrasena", "contraseña", "clave", "pass"),
    "confirmar": ("confirmar", "confirmar_password", "confirmarPassword", "confirmPassword", "confirm_password", "password2",
                  "password_confirm", "confirmarContrasena", "confirmar_contrasena", "repetir_password", "repetirPassword"),
    "nombre": ("nombre", "nombres", "first_name", "firstName"),
    "apellido": ("apellido", "apellidos", "last_name", "lastName"),
    "documento": ("documento", "dni", "nro_documento", "nroDocumento"),
    "nombre_completo": ("nombre_completo", "nombreCompleto", "fullName", "full_name"),
}
USUARIO_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")


def normalizar_registro(data):
    """Devuelve (datos con claves canónicas, {canónica: clave que usó el cliente}). Ignora todo lo demás
    (rol, is_staff, is_superuser... nunca se toman del cliente)."""
    datos, usadas = {}, {}
    for canon, nombres in ALIAS_REGISTRO.items():
        for n in nombres:
            if n in data and data.get(n) is not None:
                v = data.get(n)
                datos[canon] = v.strip() if isinstance(v, str) and canon not in ("password", "confirmar") else v
                usadas[canon] = n
                break
    completo = datos.pop("nombre_completo", None)
    if completo and not datos.get("nombre"):  # "Juan Pérez" -> nombre + apellido
        partes = str(completo).split(None, 1)
        datos["nombre"] = partes[0]
        if len(partes) > 1 and not datos.get("apellido"):
            datos["apellido"] = partes[1]
        usadas.setdefault("nombre", usadas.get("nombre_completo", "nombre_completo"))
    if "nombre_completo" in usadas:
        usadas.setdefault("nombre", usadas["nombre_completo"])
        usadas.setdefault("apellido", usadas["nombre_completo"])
    return datos, usadas


class RegistroSerializer(serializers.Serializer):
    usuario = serializers.CharField(error_messages={"required": "El nombre de usuario es obligatorio.",
                                                    "blank": "El nombre de usuario es obligatorio.",
                                                    "null": "El nombre de usuario es obligatorio."})
    email = serializers.CharField(error_messages={"required": "El correo electrónico es obligatorio.",
                                                  "blank": "El correo electrónico es obligatorio.",
                                                  "null": "El correo electrónico es obligatorio."})
    password = serializers.CharField(write_only=True, trim_whitespace=False,
                                     error_messages={"required": "La contraseña es obligatoria.",
                                                     "blank": "La contraseña es obligatoria.",
                                                     "null": "La contraseña es obligatoria."})
    confirmar = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    nombre = serializers.CharField(required=False, allow_blank=True, max_length=150)
    apellido = serializers.CharField(required=False, allow_blank=True, max_length=150)
    documento = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_usuario(self, v):
        if not USUARIO_RE.match(v):
            raise serializers.ValidationError(
                "Usá entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo (sin espacios ni @).")
        if Usuario.objects.filter(username__iexact=v).exists():
            raise serializers.ValidationError("Ese nombre de usuario ya está registrado.")
        return v

    def validate_email(self, v):
        v = v.lower()
        try:
            validate_email(v)
        except DjangoValidationError:
            raise serializers.ValidationError("Ingresá un correo electrónico válido.")
        if Usuario.objects.filter(email__iexact=v).exists():
            raise serializers.ValidationError("Ese correo electrónico ya está registrado.")
        return v

    def validate_documento(self, v):
        if v in (None, ""):
            return None
        if not v.isdigit() or not (7 <= len(v) <= 11):
            raise serializers.ValidationError("El documento debe tener entre 7 y 11 dígitos numéricos.")
        if Usuario.objects.filter(documento=v).exists():
            raise serializers.ValidationError("Ese documento ya está registrado.")
        return v

    def to_internal_value(self, data):
        """Valida todo en una sola pasada: la contraseña se revisa aunque usuario/correo tengan errores,
        así el formulario puede mostrar todos los problemas juntos."""
        try:
            salida, errores = super().to_internal_value(data), {}
        except serializers.ValidationError as e:
            salida, errores = None, dict(e.detail)
        pw, conf = data.get("password"), data.get("confirmar")
        if isinstance(pw, str) and pw and "password" not in errores:
            try:  # política del sistema (8+, mayúscula, minúscula, número, símbolo) + similitud/comunes
                validate_password(pw, Usuario(username=str(data.get("usuario") or ""), email=str(data.get("email") or ""),
                                              first_name=str(data.get("nombre") or ""), last_name=str(data.get("apellido") or "")))
            except DjangoValidationError as e:
                errores["password"] = list(e.messages)
        if isinstance(pw, str) and pw and conf not in (None, "") and conf != pw:
            errores["confirmar"] = ["Las contraseñas no coinciden."]
        if errores:
            raise serializers.ValidationError(errores)
        return salida

    def create(self, a):
        return Usuario.objects.create_user(
            username=a["usuario"], email=a["email"], password=a["password"], first_name=a.get("nombre", ""),
            last_name=a.get("apellido", ""), documento=a.get("documento"), rol=settings.REGISTRO_ROL_POR_DEFECTO,
            is_active=True, email_verificado=not settings.REGISTRO_VERIFICAR_CORREO)
