from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from . import models as m

for modelo in (m.CursoAgua, m.Microcuenca, m.ZonaRiesgo, m.PuntoMonitoreo, m.Barrio):
    admin.site.register(modelo, GISModelAdmin)
admin.site.register([m.TipoResiduo, m.Cuadrilla])


@admin.register(m.Foco)
class FocoAdmin(GISModelAdmin):
    list_display = ("codigo", "direccion", "estado", "irh", "nivel_riesgo")
    list_filter = ("estado", "nivel_riesgo", "tipo")
    search_fields = ("codigo", "direccion")
    readonly_fields = ("irh", "nivel_riesgo", "distancia_curso_m", "microcuenca", "curso_cercano")


@admin.register(m.HistorialIRH)
class HistorialAdmin(admin.ModelAdmin):
    list_display = ("foco", "fecha_calculo", "valor", "nivel", "motivo")

    def has_change_permission(self, request, obj=None):
        return False  # el historial es de solo inserción

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register([m.Intervencion, m.Alerta, m.DeteccionIA])
