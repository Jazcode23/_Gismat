"""Permisos por rol. La matriz vive en un único lugar (PERMISOS) para poder auditarla.

Acciones:  ver, crear_foco, editar_foco, baja_foco, intervenir, asignar,
           validar_ia, reportes, usuarios
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Roles

PERMISOS = {
    Roles.ADMINISTRADOR: {"ver", "crear_foco", "editar_foco", "baja_foco", "intervenir",
                          "asignar", "validar_ia", "reportes", "usuarios"},
    Roles.OPERADOR: {"ver", "crear_foco", "editar_foco", "intervenir", "validar_ia"},
    Roles.ANALISTA: {"ver", "crear_foco", "editar_foco", "asignar", "validar_ia", "reportes"},
    Roles.SUPERVISOR: {"ver", "asignar", "reportes"},
}


def puede(user, accion):
    return bool(user and user.is_authenticated and user.is_active
                and accion in PERMISOS.get(user.rol, set()))


class AccionPermitida(BasePermission):
    """Uso: permission_classes = [AccionPermitida]; en la vista, `acciones = {'create': 'crear_foco', ...}`.
    Las lecturas exigen 'ver'. Un método sin acción declarada se deniega."""

    message = "Tu rol no tiene permiso para esta operación."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.is_active):
            return False
        mapa = getattr(view, "acciones", {})
        nombre = getattr(view, "action", None) or request.method.lower()
        if nombre in mapa and mapa[nombre] is None:  # la vista valida el permiso internamente
            return True
        accion = mapa.get(nombre)
        if accion is None:
            return request.method in SAFE_METHODS and puede(request.user, "ver")
        return puede(request.user, accion)


class SoloAdministrador(BasePermission):
    message = "Solo el Administrador puede gestionar usuarios."

    def has_permission(self, request, view):
        return puede(request.user, "usuarios")
