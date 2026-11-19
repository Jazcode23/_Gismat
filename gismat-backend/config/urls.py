from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from geoportal.storage import servir_archivo

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("geoportal.urls")),
    # Fotos de campo (guardadas en la base). También bajo /media/ por compatibilidad con URLs ya emitidas.
    re_path(r"^(?:api/)?media/(?P<path>.*)$", servir_archivo),
]
