"""Envío de correos del sistema (verificación de cuenta y recuperación de contraseña).

Un fallo de SMTP (credenciales mal, sin red, límite de Gmail) NO debe tumbar la API ni revelar si un correo existe:
se registra en el log (sin credenciales) y quien llama decide qué responder.
"""
import logging
import smtplib

from django.core.mail import send_mail

logger = logging.getLogger("gismat.correo")


def enviar_correo(asunto, cuerpo, destino):
    """Envía un correo de texto plano. Devuelve True si el servidor lo aceptó, False si falló."""
    try:
        return send_mail(asunto, cuerpo, None, [destino], fail_silently=False) == 1
    except (smtplib.SMTPException, OSError) as exc:  # incluye timeouts, DNS, TLS, autenticación, destinatario rechazado
        logger.error("No se pudo enviar el correo '%s' (%s): %s", asunto, type(exc).__name__, exc)
        return False
