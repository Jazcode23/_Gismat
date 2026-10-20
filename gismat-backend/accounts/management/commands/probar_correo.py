"""Envía un correo de prueba usando la configuración actual (.env) y diagnostica el resultado.

    python manage.py probar_correo tu.cuenta@gmail.com

Nunca imprime la contraseña (solo cuántos caracteres tiene). Código de salida 1 si el envío falla.
"""
import smtplib
import socket
import ssl

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError


def diagnostico(exc):
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return ("Gmail rechazó el usuario/contraseña. Causas típicas: (1) usaste la contraseña normal de Gmail en vez de una "
                "CONTRASEÑA DE APLICACIÓN; (2) la verificación en 2 pasos no está activada; (3) la contraseña de aplicación "
                "fue revocada o está mal copiada; (4) EMAIL_HOST_USER no es la cuenta que generó la contraseña.")
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused)):
        return "El servidor rechazó el remitente o el destinatario. Revisá DEFAULT_FROM_EMAIL (debe ser la cuenta autenticada) y el destino."
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return "El servidor no admite STARTTLS/AUTH con este puerto. Probá EMAIL_PORT=587 + EMAIL_USE_TLS=True (o 465 + EMAIL_USE_SSL=True)."
    if isinstance(exc, ssl.SSLError):
        return "Falló el cifrado TLS. Revisá que el puerto y EMAIL_USE_TLS/EMAIL_USE_SSL coincidan (587→TLS, 465→SSL) y la hora del servidor."
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return "Tiempo de espera agotado: probablemente el firewall o la red bloquean la salida al puerto SMTP."
    if isinstance(exc, (socket.gaierror, ConnectionError, OSError)):
        return "No hay conexión con el servidor SMTP (DNS, firewall o puerto bloqueado). Revisá EMAIL_HOST y la salida a internet."
    return "Error inesperado de SMTP."


class Command(BaseCommand):
    help = "Envía un correo de prueba y diagnostica problemas de configuración SMTP."

    def add_arguments(self, p):
        p.add_argument("destino", help="Dirección que recibirá el correo de prueba.")

    def handle(self, *a, destino, **kw):
        try:
            validate_email(destino)
        except ValidationError:
            raise CommandError(f"'{destino}' no es una dirección de correo válida.")
        real = settings.EMAIL_BACKEND.endswith("smtp.EmailBackend")
        pw = settings.EMAIL_HOST_PASSWORD
        self.stdout.write("Configuración de correo detectada:")
        self.stdout.write(f"  backend ........ {settings.EMAIL_BACKEND}")
        self.stdout.write(f"  servidor ....... {settings.EMAIL_HOST or '(vacío)'}:{settings.EMAIL_PORT}  "
                          f"TLS={settings.EMAIL_USE_TLS} SSL={settings.EMAIL_USE_SSL} timeout={settings.EMAIL_TIMEOUT}s")
        self.stdout.write(f"  usuario ........ {settings.EMAIL_HOST_USER or '(vacío)'}")
        self.stdout.write(f"  contraseña ..... {'definida (%d caracteres)' % len(pw) if pw else '(vacía)'}")
        self.stdout.write(f"  remitente ...... {settings.DEFAULT_FROM_EMAIL}")
        self.stdout.write(f"  FRONTEND_URL ... {settings.FRONTEND_URL}")
        if not real:
            self.stdout.write(self.style.WARNING(
                "\nEMAIL_BACKEND NO es SMTP: el mensaje solo se imprimirá en esta consola y NO llegará a ninguna casilla.\n"
                "Configurá EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend y las variables EMAIL_* en .env."))
        elif len(pw) != 16 and "gmail" in settings.EMAIL_HOST:
            self.stdout.write(self.style.WARNING(
                "\nAviso: las contraseñas de aplicación de Google tienen 16 letras; la tuya tiene %d. "
                "Si es tu contraseña normal de Gmail, NO funcionará." % len(pw)))
        try:
            send_mail("GISMAT - Prueba de correo",
                      "Este es un correo de prueba de GISMAT.\n\nSi lo estás leyendo, el envío por SMTP funciona.",
                      None, [destino], fail_silently=False)
        except Exception as exc:  # noqa: BLE001 — se informa y se sale con error
            self.stderr.write(self.style.ERROR(f"\n✘ Falló el envío: {type(exc).__name__}: {exc}"))
            self.stderr.write(f"→ {diagnostico(exc)}")
            raise SystemExit(1)
        if real:
            self.stdout.write(self.style.SUCCESS(f"\n✔ El servidor aceptó el correo para {destino}. Revisá la bandeja (y spam)."))
        else:
            self.stdout.write(self.style.WARNING("\n(Mensaje procesado por el backend de desarrollo; no se envió por internet.)"))
