"""Manejo uniforme de errores: {"detail": "...", "errors": {campo: [mensajes]}}."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler


def manejador_errores(exc, context):
    if isinstance(exc, DjangoValidationError):
        return Response({"detail": "Datos inválidos.", "errors": exc.message_dict if hasattr(exc, "message_dict")
                         else {"non_field_errors": exc.messages}}, status=400)
    if isinstance(exc, IntegrityError):
        return Response({"detail": "La operación viola una restricción de integridad."}, status=409)
    resp = exception_handler(exc, context)
    if resp is not None and resp.status_code == 400 and not (isinstance(resp.data, dict) and set(resp.data) == {"detail"}):
        resp.data = {"detail": "Datos inválidos.", "errors": resp.data}
    return resp
