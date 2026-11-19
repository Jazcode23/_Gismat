from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("geoportal.urls")),
    # Fotos de campo: se sirven también con DEBUG apagado (static() no sirve nada en producción).
    # También bajo /api/media/: si el frontend reenvía solo /api/* al backend, las fotos viajan por esa misma ruta.
    re_path(r"^(?:api/)?media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
