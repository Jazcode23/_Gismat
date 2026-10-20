from django.conf import settings
from django.core.checks import Error, Warning, register

PLACEHOLDERS = ("tu.cuenta@gmail.com", "cambiar", "contraseña-de-aplicación")


@register()
def configuracion_correo(app_configs, **kwargs):
    """Avisa (python manage.py check / runserver) si se pidió SMTP pero la configuración está incompleta."""
    if not settings.EMAIL_BACKEND.endswith("smtp.EmailBackend"):
        return []
    faltan = [n for n in ("EMAIL_HOST", "EMAIL_HOST_USER", "EMAIL_HOST_PASSWORD") if not getattr(settings, n)]
    out = []
    if faltan:
        out.append(Warning(f"EMAIL_BACKEND es SMTP pero faltan: {', '.join(faltan)}. Los correos NO se enviarán.",
                           hint="Completá las variables EMAIL_* en .env (ver docs/CORREO.md).", id="gismat.W001"))
    elif any(p in (settings.EMAIL_HOST_USER + settings.EMAIL_HOST_PASSWORD).lower() for p in PLACEHOLDERS):
        out.append(Warning("EMAIL_HOST_USER / EMAIL_HOST_PASSWORD todavía tienen valores de ejemplo.",
                           hint="Reemplazalos por tu cuenta y tu contraseña de aplicación de Google.", id="gismat.W002"))
    if settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL:
        out.append(Warning("EMAIL_USE_TLS y EMAIL_USE_SSL no pueden estar activos a la vez.",
                           hint="Puerto 587 → TLS=True/SSL=False; puerto 465 → SSL=True/TLS=False.", id="gismat.W003"))
    return out


@register()
def configuracion_registro(app_configs, **kwargs):
    from .models import Roles
    rol = settings.REGISTRO_ROL_POR_DEFECTO
    if rol not in Roles.values:
        return [Error(f"REGISTRO_ROL_POR_DEFECTO='{rol}' no es un rol válido.", hint=f"Usá uno de: {', '.join(Roles.values)}.",
                      id="gismat.E001")]
    if rol == Roles.ADMINISTRADOR and settings.REGISTRO_PUBLICO:
        return [Error("REGISTRO_ROL_POR_DEFECTO no puede ser 'administrador' con el registro público activo: cualquiera "
                      "podría darse de alta como administrador.", hint="Usá supervisor, operador o analista.", id="gismat.E002")]
    return []
