from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication


class TokenConExpiracion(TokenAuthentication):
    """Token DRF que caduca a las TOKEN_TTL_HOURS horas de emitido y exige usuario activo."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if timezone.now() - token.created > timedelta(hours=settings.TOKEN_TTL_HOURS):
            token.delete()
            raise exceptions.AuthenticationFailed("La sesión expiró. Iniciá sesión nuevamente.")
        return user, token
