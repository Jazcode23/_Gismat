"""Configuración de GISMAT. Todo valor sensible sale de variables de entorno."""
import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# PROJ/GDAL: load_dotenv NO pisa variables que ya existen en el sistema. En Windows, el instalador de PostGIS suele dejar
# PROJ_LIB apuntando a SU copia de PROJ, incompatible con la de OSGeo4W que usa GeoDjango ("proj.db ... comes from another
# PROJ installation"). Si .env define estas variables, tienen prioridad. Sin esas líneas en .env no cambia nada.
# El valor correcto lo informa:  python manage.py diagnosticar_gdal_proj
for _var, _valor in dotenv_values(BASE_DIR / ".env").items():
    if _var in ("PROJ_DATA", "PROJ_LIB", "GDAL_DATA") and _valor:
        os.environ[_var] = _valor


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "si")


def env_list(name, default=""):
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "insegura-solo-desarrollo"
    else:
        raise RuntimeError("Falta la variable de entorno DJANGO_SECRET_KEY")

# GeoDjango necesita GDAL y GEOS. Si no los encuentra solo (típico en Windows), indicar la ruta de la DLL/.so en .env
# (ej. GDAL_LIBRARY_PATH=C:\\OSGeo4W\\bin\\gdal311.dll  y  GEOS_LIBRARY_PATH=C:\\OSGeo4W\\bin\\geos_c.dll).
if os.environ.get("GDAL_LIBRARY_PATH"):
    GDAL_LIBRARY_PATH = os.environ["GDAL_LIBRARY_PATH"]
if os.environ.get("GEOS_LIBRARY_PATH"):
    GEOS_LIBRARY_PATH = os.environ["GEOS_LIBRARY_PATH"]

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "accounts",
    "geoportal",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": os.environ.get("DB_NAME", "gismat"),
        "USER": os.environ.get("DB_USER", "gismat"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.Usuario"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "accounts.validators.PoliticaContrasena"},
]

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Tucuman"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- API
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.TokenConExpiracion"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"login": "10/min", "recuperacion": "5/min", "registro": "20/hour"},
    "EXCEPTION_HANDLER": "geoportal.api_errors.manejador_errores",
    # Sin paginación: el frontend espera arreglos planos (FocoAmbiente[]).
    "DEFAULT_PAGINATION_CLASS": None,
}

# ---------------------------------------------------------------- Seguridad
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
TOKEN_TTL_HOURS = int(os.environ.get("TOKEN_TTL_HOURS", "12"))

if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------- Correo
# Por defecto el correo se imprime en consola (desarrollo). Para envío real configurar EMAIL_BACKEND=...smtp.EmailBackend
# y las variables EMAIL_* en .env (ver docs/CORREO.md). Las credenciales NUNCA van en el código.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "").strip()
# Google muestra la contraseña de aplicación en bloques de 4 ("abcd efgh ijkl mnop"): se aceptan los espacios.
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "").replace(" ", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)      # puerto 587 (STARTTLS)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)     # puerto 465 (SSL directo); no combinar con TLS
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "20"))  # un SMTP caído no debe colgar la API
# Gmail reescribe/rechaza remitentes distintos de la cuenta autenticada: por defecto se usa EMAIL_HOST_USER.
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL") or EMAIL_HOST_USER or "gismat@localhost"
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# ---------------------------------------------------------------- GISMAT
IRH_UMBRAL_MODERADO = float(os.environ.get("IRH_UMBRAL_MODERADO", "40"))
IRH_UMBRAL_CRITICO = float(os.environ.get("IRH_UMBRAL_CRITICO", "70"))
# Caja geográfica válida para registrar focos (San Miguel de Tucumán y alrededores): lng_min, lat_min, lng_max, lat_max
GISMAT_BBOX = (-65.45, -27.00, -65.00, -26.60)
# Densidad media usada para convertir m³ <-> toneladas (deducida de los datos municipales del frontend)
DENSIDAD_RESIDUOS_T_M3 = 0.6
# Códigos de foco (BR-001...) <= este número están reservados para el relevamiento original (p. ej. 243 filas del
# dataset municipal); los focos nuevos continúan después. 0 = sin reserva.
FOCO_CODIGO_RESERVADO = int(os.environ.get("FOCO_CODIGO_RESERVADO", "0"))

# ---------------------------------------------------------------- Registro público de usuarios
# POST /api/auth/registro/. El rol NUNCA lo elige quien se registra: se asigna REGISTRO_ROL_POR_DEFECTO (el de menor
# poder de escritura). Un Administrador puede cambiarlo después desde /api/usuarios/ o /admin/.
REGISTRO_PUBLICO = env_bool("REGISTRO_PUBLICO", True)
REGISTRO_ROL_POR_DEFECTO = os.environ.get("REGISTRO_ROL_POR_DEFECTO", "supervisor")
# False: la cuenta queda activa y el correo solo se guarda (sin envío de mails). True: exige verificar el correo
# (se envía el enlace de verificación; requiere configurar el correo, ver docs/CORREO.md).
REGISTRO_VERIFICAR_CORREO = env_bool("REGISTRO_VERIFICAR_CORREO", False)
