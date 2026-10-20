from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("focos", v.FocoViewSet, basename="foco")
router.register("intervenciones", v.IntervencionViewSet, basename="intervencion")
router.register("cursos-agua", v.CursoAguaViewSet, basename="curso-agua")
router.register("microcuencas", v.MicrocuencaViewSet, basename="microcuenca")
router.register("zonas-riesgo", v.ZonaRiesgoViewSet, basename="zona-riesgo")
router.register("puntos-monitoreo", v.PuntoMonitoreoViewSet, basename="punto-monitoreo")
router.register("barrios", v.BarrioViewSet, basename="barrio")
router.register("tipos-residuo", v.TipoResiduoViewSet, basename="tipo-residuo")
router.register("cuadrillas", v.CuadrillaViewSet, basename="cuadrilla")
router.register("alertas", v.AlertaViewSet, basename="alerta")
router.register("trazabilidad/focos", v.TrazabilidadViewSet, basename="trazabilidad")
router.register("detecciones-ia", v.DeteccionIAViewSet, basename="deteccion-ia")

g = v.GeoportalViewSet.as_view
geoportal = [
    path("capas", g({"get": "capas"})),
    path("focos", g({"get": "focos"})),
    path("focos/<str:codigo>", g({"get": "foco"})),
    path("cursos-agua", g({"get": "cursos"})),
    path("microcuencas", g({"get": "microcuencas"})),
    path("zonas-riesgo", g({"get": "zonas"})),
    path("puntos-monitoreo", g({"get": "puntos"})),
    path("barrios", g({"get": "barrios"})),
    path("alertas", g({"get": "alertas"})),
    path("estadisticas", g({"get": "estadisticas"})),
    path("buscar", g({"get": "buscar"})),
]

urlpatterns = [
    path("dashboard/", v.DashboardView.as_view()),
    path("reportes/focos/", v.ReporteFocosView.as_view()),
    path("geojson/<str:capa>/", v.GeoJSONView.as_view()),
    path("geoportal/", include(geoportal)),
    path("", include(router.urls)),
]
