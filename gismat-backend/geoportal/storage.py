"""Almacenamiento de archivos subidos (fotos de campo) en la base de datos.

En hosting con disco efímero (p. ej. Render sin disco persistente) los archivos guardados en /media se pierden en cada
reinicio o despliegue. Guardarlos en la base los hace durar lo mismo que los datos del foco y se sirven por /api/media/.
"""
import mimetypes

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.http import Http404, HttpResponse
from django.utils.deconstruct import deconstructible


def _modelo():
    from .models import ArchivoSubido
    return ArchivoSubido


@deconstructible
class AlmacenEnBD(Storage):
    def _open(self, name, mode="rb"):
        try:
            return ContentFile(bytes(_modelo().objects.get(nombre=name).contenido), name=name)
        except _modelo().DoesNotExist:
            raise FileNotFoundError(name)

    def _save(self, name, content):
        content.seek(0)
        _modelo().objects.update_or_create(nombre=name, defaults={
            "contenido": content.read(), "tipo": mimetypes.guess_type(name)[0] or "application/octet-stream"})
        return name

    def exists(self, name):
        return _modelo().objects.filter(nombre=name).exists()

    def delete(self, name):
        _modelo().objects.filter(nombre=name).delete()

    def size(self, name):
        return len(bytes(_modelo().objects.get(nombre=name).contenido))

    def url(self, name):
        return f"{settings.MEDIA_URL}{name}"


def servir_archivo(request, path):
    """GET /api/media/<ruta> (y /media/<ruta>): devuelve el archivo guardado en la base."""
    try:
        a = _modelo().objects.only("contenido", "tipo").get(nombre=path)
    except _modelo().DoesNotExist:
        raise Http404("Archivo inexistente")
    r = HttpResponse(bytes(a.contenido), content_type=a.tipo)
    r["Cache-Control"] = "public, max-age=86400"  # al reemplazar una foto cambia el nombre, no hay caché vieja
    r["X-Content-Type-Options"] = "nosniff"
    return r
