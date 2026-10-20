import json

from django.db.models import Prefetch
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import AccionPermitida, puede

from . import models as m
from . import serializers as s
from .filters import filtrar_detecciones, filtrar_focos
from .services import alertas as srv_alertas
from .services import dashboard, geo, reportes
from .services.focos import dar_de_baja, recalcular, registrar_intervencion


def focos_base():
    return (m.Foco.objects.select_related("microcuenca", "curso_cercano", "tipo_residuo")
            .prefetch_related(Prefetch("intervenciones", queryset=m.Intervencion.objects.select_related("responsable")),
                              "alertas"))


class FocoViewSet(viewsets.ModelViewSet):
    serializer_class = s.FocoSerializer
    permission_classes = [AccionPermitida]
    lookup_field = "codigo"
    lookup_value_regex = r"[^/]+"
    acciones = {"list": "ver", "retrieve": "ver", "create": "crear_foco", "update": "editar_foco",
                "partial_update": "editar_foco", "destroy": "baja_foco", "historial": "ver", "irh": "ver",
                "calcular_irh": "editar_foco", "intervenciones": None, "cercanos": "ver", "asignar_cuadrilla": "asignar"}

    def get_queryset(self):
        return filtrar_focos(focos_base(), self.request.query_params)

    def destroy(self, request, *args, **kwargs):
        foco = self.get_object()
        if foco.estado == "inactivo":
            return Response({"detail": "El foco ya está dado de baja."}, status=400)
        dar_de_baja(foco, request.data.get("motivo", "") if hasattr(request.data, "get") else "")
        return Response(s.FocoSerializer(foco, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"])
    def historial(self, request, codigo=None):
        """Historial del foco: evolución del IRH + intervenciones."""
        foco = self.get_object()
        return Response({
            "foco": foco.codigo,
            "irh": s.HistorialIRHSerializer(foco.historial_irh.all(), many=True).data,
            "intervenciones": s.IntervencionSerializer(foco.intervenciones.all(), many=True).data})

    @action(detail=True, methods=["get"])
    def irh(self, request, codigo=None):
        f = self.get_object()
        ultimo = f.historial_irh.first()
        return Response({"foco": f.codigo, "irh": f.irh, "nivelRiesgo": f.nivel_riesgo,
                         "variables": ultimo.variables if ultimo else {}, "calculadoEn": ultimo.fecha_calculo if ultimo else None})

    @action(detail=True, methods=["post"], url_path="calcular-irh")
    def calcular_irh(self, request, codigo=None):
        f = self.get_object()
        if f.estado == "inactivo":
            raise ValidationError("El foco está dado de baja.")
        r = recalcular(f, motivo="manual")
        return Response({"foco": f.codigo, **r.as_dict()})

    @action(detail=True, methods=["get", "post"])
    def intervenciones(self, request, codigo=None):
        f = self.get_object()
        if request.method == "GET":
            if not puede(request.user, "ver"):
                return Response(status=403)
            return Response(s.IntervencionSerializer(f.intervenciones.all(), many=True).data)
        if not puede(request.user, "intervenir"):
            return Response({"detail": AccionPermitida.message}, status=403)
        ser = s.IntervencionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = dict(ser.validated_data)
        cuad, texto = s.resolver_cuadrilla(d.pop("cuadrilla", ""))
        try:
            i = registrar_intervencion(
                f, request.user, tipo=d["tipo"], observaciones=d.get("observaciones", ""), cuadrilla=cuad,
                cuadrilla_texto=texto, fecha=d.get("fecha"), etiquetas=d.get("etiquetas"),
                volumen_removido_ton=d.get("volumen_removido_ton", 0), estado=d.get("estado"),
                resultado=d.get("resultadoFoco"))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(s.IntervencionSerializer(i).data, status=201)

    @action(detail=True, methods=["post"], url_path="asignar-cuadrilla")
    def asignar_cuadrilla(self, request, codigo=None):
        """Pantalla 'Asignar Cuadrilla': registra una orden de despacho (intervención programada)."""
        f = self.get_object()
        cuad, texto = s.resolver_cuadrilla(request.data.get("cuadrilla", ""))
        if not cuad:
            raise ValidationError({"cuadrilla": "Cuadrilla inexistente."})
        if not cuad.disponible:
            raise ValidationError({"cuadrilla": "La cuadrilla no está disponible."})
        try:
            i = registrar_intervencion(f, request.user, tipo="Orden de despacho e inspección",
                                       observaciones=request.data.get("observaciones", ""), cuadrilla=cuad,
                                       estado="programada", etiquetas=["Cuadrilla asignada"])
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(s.IntervencionSerializer(i).data, status=201)

    @action(detail=True, methods=["get"])
    def cercanos(self, request, codigo=None):
        f = self.get_object()
        radio = float(request.query_params.get("metros", 500))
        qs = geo.focos_en_radio(f.ubicacion, radio).exclude(pk=f.pk)
        return Response(s.FocoSerializer(focos_base().filter(pk__in=qs.values("pk")), many=True,
                                         context=self.get_serializer_context()).data)


class IntervencionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = s.IntervencionSerializer
    permission_classes = [AccionPermitida]
    acciones = {"list": "ver", "retrieve": "ver"}

    def get_queryset(self):
        qs = m.Intervencion.objects.select_related("foco", "responsable", "cuadrilla")
        p = self.request.query_params
        if v := p.get("foco"):
            qs = qs.filter(foco__codigo=v)
        if v := p.get("desde"):
            qs = qs.filter(fecha__gte=v)
        if v := p.get("hasta"):
            qs = qs.filter(fecha__lte=v)
        if v := p.get("estado"):
            qs = qs.filter(estado=v)
        return qs


class SoloLectura(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AccionPermitida]
    acciones = {"list": "ver", "retrieve": "ver"}
    lookup_field = "codigo"


class CursoAguaViewSet(SoloLectura):
    queryset = m.CursoAgua.objects.all()
    serializer_class = s.CursoAguaSerializer


class ZonaRiesgoViewSet(SoloLectura):
    queryset = m.ZonaRiesgo.objects.all()
    serializer_class = s.ZonaRiesgoSerializer


class PuntoMonitoreoViewSet(SoloLectura):
    queryset = m.PuntoMonitoreo.objects.all()
    serializer_class = s.PuntoMonitoreoSerializer


class BarrioViewSet(SoloLectura):
    queryset = m.Barrio.objects.all()
    serializer_class = s.BarrioSerializer


class MicrocuencaViewSet(SoloLectura):
    """Microcuencas con riesgo acumulado (forma Microcuenca del frontend)."""

    def list(self, request):
        return Response([s.microcuenca_a_dict(r) for r in geo.carga_por_microcuenca()])

    def retrieve(self, request, codigo=None):
        for r in geo.carga_por_microcuenca():
            if r["microcuenca"].codigo == codigo:
                d = s.microcuenca_a_dict(r)
                focos = geo.focos_en_microcuenca(r["microcuenca"]).exclude(estado="inactivo")
                d["focos"] = s.FocoSerializer(focos_base().filter(pk__in=focos.values("pk")), many=True,
                                              context={"request": request}).data
                return Response(d)
        return Response(status=404)

    @action(detail=False, methods=["get"])
    def riesgo(self, request):
        """Carga acumulada de riesgo por microcuenca."""
        return self.list(request)


class TipoResiduoViewSet(SoloLectura):
    queryset = m.TipoResiduo.objects.all()
    lookup_field = "codigo"

    def list(self, request):
        return Response([{"id": t.codigo, "nombre": t.nombre, "descripcion": t.descripcion,
                          "factorPeligrosidad": t.factor_peligrosidad} for t in self.queryset])


class CuadrillaViewSet(SoloLectura):
    queryset = m.Cuadrilla.objects.all()

    def list(self, request):
        return Response([{"id": c.codigo, "nombre": c.nombre, "especialidad": c.especialidad,
                          "disponible": c.disponible} for c in self.queryset])


class AlertaViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = s.AlertaSerializer
    permission_classes = [AccionPermitida]
    acciones = {"list": "ver", "retrieve": "ver", "atender": "editar_foco"}

    def get_queryset(self):
        qs = m.Alerta.objects.select_related("foco", "microcuenca")
        p = self.request.query_params
        for campo, filtro in (("nivel", "nivel"), ("estado", "estado"), ("tipo", "tipo"), ("foco", "foco__codigo")):
            if v := p.get(campo):
                qs = qs.filter(**{filtro: v})
        return qs

    @action(detail=True, methods=["post"])
    def atender(self, request, pk=None):
        a = self.get_object()
        a.estado = "atendida"
        a.save(update_fields=["estado"])
        return Response(s.AlertaSerializer(a).data)


class DashboardView(APIView):
    permission_classes = [AccionPermitida]
    acciones = {"get": "ver"}

    def get(self, request):
        try:
            meses = max(1, min(24, int(request.query_params.get("meses", 6))))
        except ValueError:
            raise ValidationError({"meses": "Debe ser un entero."})
        return Response(dashboard.indicadores(meses))


class ReporteFocosView(APIView):
    """GET /api/reportes/focos/?formato=pdf|csv  (+ los mismos filtros que /api/focos/)."""

    permission_classes = [AccionPermitida]
    acciones = {"get": "reportes"}

    def get(self, request):
        formato = request.query_params.get("formato", "pdf").lower()
        if formato not in ("pdf", "csv"):
            raise ValidationError({"formato": "Use pdf o csv."})
        focos = filtrar_focos(focos_base(), request.query_params).order_by("-irh")
        nombre = f"reporte-gismat-{timezone.localdate():%Y%m%d}.{formato}"
        if formato == "csv":
            resp = HttpResponse(reportes.generar_csv(focos), content_type="text/csv; charset=utf-8")
        else:
            resp = HttpResponse(reportes.generar_pdf(focos, request.user), content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{nombre}"'
        return resp


# ------------------------------------------------------------------ GeoJSON
def _fc(features):
    return {"type": "FeatureCollection", "features": features}


class GeoJSONView(APIView):
    """GET /api/geojson/<capa>/  — capas: focos, cursos-agua, microcuencas, zonas-riesgo, puntos-monitoreo, barrios."""

    permission_classes = [AccionPermitida]
    acciones = {"get": "ver"}

    def get(self, request, capa):
        ctx = {"request": request}
        if capa == "focos":
            qs = filtrar_focos(focos_base(), request.query_params)
            items = [(f.ubicacion, s.FocoSerializer(f, context=ctx).data) for f in qs]
        elif capa == "cursos-agua":
            items = [(o.geom, s.CursoAguaSerializer(o).data) for o in m.CursoAgua.objects.all()]
        elif capa == "microcuencas":
            items = [(r["microcuenca"].geom, s.microcuenca_a_dict(r)) for r in geo.carga_por_microcuenca()]
        elif capa == "zonas-riesgo":
            items = [(o.geom, s.ZonaRiesgoSerializer(o).data) for o in m.ZonaRiesgo.objects.all()]
        elif capa == "puntos-monitoreo":
            items = [(o.geom, s.PuntoMonitoreoSerializer(o).data) for o in m.PuntoMonitoreo.objects.all()]
        elif capa == "barrios":
            items = [(o.geom, s.BarrioSerializer(o).data) for o in m.Barrio.objects.all()]
        else:
            return Response({"detail": "Capa inexistente."}, status=404)
        feats = []
        for g, props in items:
            props = {k: v for k, v in props.items() if k != "coordenadas"} if capa != "focos" else props
            feats.append({"type": "Feature", "id": props.get("id"), "geometry": json.loads(g.geojson), "properties": props})
        return Response(_fc(feats))


# ------------------------------------------------------------------ Compatibilidad con GeoportalService
CAPAS = [  # mismo contenido que INITIAL_LAYERS del frontend
    ("layer_focos", "Basurales / Focos de residuos", "trash-2", True, 1, "focos", "#ef4444"),
    ("layer_cursos", "Cursos de agua (Ríos y Canales)", "droplet", True, 0.9, "hidrologia", "#0284c7"),
    ("layer_microcuencas", "Microcuencas urbanas", "waves", True, 0.65, "cuencas", "#0d9488"),
    ("layer_zonas_riesgo", "Zonas de riesgo y anegamiento", "alert-triangle", True, 0.55, "riesgo", "#f59e0b"),
    ("layer_monitoreo", "Puntos de monitoreo hidrométrico", "map-pin", True, 1, "monitoreo", "#6366f1"),
    ("layer_barrios", "Barrios y sectores urbanos", "home", False, 0.45, "base_urbana", "#64748b"),
    ("layer_riesgo_calor", "Simbología Graduada IRH (Buffer de Afectación)", "flame", False, 0.6, "riesgo", "#dc2626"),
]


class GeoportalViewSet(viewsets.ViewSet):
    """/api/geoportal/…  Replica 1:1 los métodos de src/services/geoportalService.ts, de modo que el
    frontend solo necesita activar `useApiBackend` (o apuntar el fetch a estas rutas)."""

    permission_classes = [AccionPermitida]
    acciones = {}

    def _ctx(self):
        return {"request": self.request}

    def capas(self, request):
        n_focos = m.Foco.objects.count()
        conteos = {"layer_focos": n_focos, "layer_cursos": m.CursoAgua.objects.count(),
                   "layer_microcuencas": m.Microcuenca.objects.count(), "layer_zonas_riesgo": m.ZonaRiesgo.objects.count(),
                   "layer_monitoreo": m.PuntoMonitoreo.objects.count(), "layer_barrios": m.Barrio.objects.count(),
                   "layer_riesgo_calor": n_focos}
        return Response([{"id": i, "nombre": n, "icono": ic, "visible": v, "opacidad": o, "categoria": c,
                          "conteo": conteos[i], "color": col} for i, n, ic, v, o, c, col in CAPAS])

    def focos(self, request):
        return Response(s.FocoSerializer(filtrar_focos(focos_base(), request.query_params).order_by("codigo"),
                                         many=True, context=self._ctx()).data)

    def foco(self, request, codigo):
        return Response(s.FocoSerializer(get_object_or_404(focos_base(), codigo=codigo), context=self._ctx()).data)

    def cursos(self, request):
        return Response(s.CursoAguaSerializer(m.CursoAgua.objects.order_by("id"), many=True).data)

    def microcuencas(self, request):
        return Response([s.microcuenca_a_dict(r) for r in geo.carga_por_microcuenca()])

    def zonas(self, request):
        return Response(s.ZonaRiesgoSerializer(m.ZonaRiesgo.objects.order_by("id"), many=True).data)

    def puntos(self, request):
        return Response(s.PuntoMonitoreoSerializer(m.PuntoMonitoreo.objects.order_by("id"), many=True).data)

    def barrios(self, request):
        return Response(s.BarrioSerializer(m.Barrio.objects.order_by("id"), many=True).data)

    def alertas(self, request):
        qs = m.Alerta.objects.select_related("foco", "microcuenca").exclude(estado="atendida", nivel__in=["critica", "advertencia"])
        return Response(s.AlertaSerializer(qs, many=True).data)

    def estadisticas(self, request):
        return Response(dashboard.estadisticas_geoportal())

    def buscar(self, request):
        """Misma forma que SearchResultItem (focos, microcuencas, cursos)."""
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response([])
        out = []
        for f in filtrar_focos(focos_base(), {"q": q})[:7]:
            out.append({"id": f.codigo, "titulo": f"{f.codigo} — {f.direccion}",
                        "subtitulo": f"Foco {f.tipo} | IRH: {f.irh:g} ({f.nivel_riesgo}) | {f.barrio}",
                        "categoria": "foco", "coordenadas": [f.ubicacion.y, f.ubicacion.x],
                        "data": s.FocoSerializer(f, context=self._ctx()).data})
        for r in geo.carga_por_microcuenca():
            mc = r["microcuenca"]
            if q.lower() in mc.nombre.lower():
                c = mc.geom.centroid
                out.append({"id": mc.codigo, "titulo": mc.nombre,
                            "subtitulo": f"Microcuenca | IRH Prom: {r['irh_promedio']:g} | {r['focos_totales']} focos",
                            "categoria": "microcuenca", "coordenadas": [c.y, c.x], "data": s.microcuenca_a_dict(r)})
        for c in m.CursoAgua.objects.filter(nombre__icontains=q):
            mid = c.geom.interpolate_normalized(0.5)
            out.append({"id": c.codigo, "titulo": c.nombre,
                        "subtitulo": f"{c.tipo} ({geo.longitud_km(c)} km) | Estado: {c.estado_conservacion}",
                        "categoria": "curso", "coordenadas": [mid.y, mid.x], "data": s.CursoAguaSerializer(c).data})
        return Response(out[:7])


# ------------------------------------------------------------------ Trazabilidad y detecciones IA
class TrazabilidadViewSet(viewsets.ViewSet):
    """Reemplazo de `gismatStore` (pantalla Trazabilidad)."""

    permission_classes = [AccionPermitida]
    acciones = {"list": "ver", "resumen": "ver", "intervenciones": "intervenir"}

    def _qs(self):
        return focos_base().prefetch_related("historial_irh").exclude(estado="inactivo").order_by("-fecha_actualizacion")

    def list(self, request):
        return Response([s.foco_a_trace(f) for f in filtrar_focos(self._qs(), request.query_params)])

    def retrieve(self, request, pk=None):
        return Response(s.foco_a_trace(get_object_or_404(self._qs(), codigo=pk)))

    @action(detail=False, methods=["get"])
    def resumen(self, request):
        ind = dashboard.indicadores(1)
        return Response({"totalInterventions": ind["intervenciones"]["total"],
                         "recoveredSpaces": ind["espaciosRecuperados"],
                         "tonsRemoved": ind["intervenciones"]["toneladasRemovidas"]})

    @action(detail=True, methods=["post"], url_path="intervenciones")
    def intervenciones(self, request, pk=None):
        """Body = addInterventionToFoco: {title, desc, tags, cuadrilla, date}. Devuelve el FocoTraceItem actualizado."""
        f = get_object_or_404(self._qs(), codigo=pk)
        ser = s.IntervencionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = dict(ser.validated_data)
        cuad, texto = s.resolver_cuadrilla(d.pop("cuadrilla", ""))
        try:
            registrar_intervencion(f, request.user, tipo=d["tipo"], observaciones=d.get("observaciones", ""),
                                   cuadrilla=cuad, cuadrilla_texto=texto, fecha=d.get("fecha"),
                                   etiquetas=d.get("etiquetas"), volumen_removido_ton=d.get("volumen_removido_ton", 0),
                                   resultado=d.get("resultadoFoco"))
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(s.foco_a_trace(get_object_or_404(self._qs(), codigo=pk)), status=201)


class DeteccionIAViewSet(viewsets.ViewSet):
    permission_classes = [AccionPermitida]
    # "exportar" pide el mismo permiso que "list": se descarga exactamente lo que el usuario ya puede ver en pantalla.
    acciones = {"list": "ver", "create": "validar_ia", "confirmar": "validar_ia", "descartar": "validar_ia",
                "exportar": "ver"}

    def list(self, request):
        qs = filtrar_detecciones(m.DeteccionIA.objects.select_related("foco"), request.query_params,
                                 excluir_descartadas_por_defecto=True)
        return Response([s.DeteccionSerializer(d).data for d in qs])

    def create(self, request):
        ser = s.DeteccionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return Response(s.DeteccionSerializer(ser.save()).data, status=201)

    @action(detail=False, methods=["get"])
    def exportar(self, request):
        """GET /api/detecciones-ia/exportar/?formato=geojson|csv + los mismos filtros que la lista (estado, q, tipo, mes,
        confianza_min, origen, riesgo). Exporta TODAS las que coinciden, sin paginar. Sin 'estado' incluye todos los estados."""
        formato = request.query_params.get("formato", "geojson").lower()
        if formato not in ("geojson", "csv"):
            raise ValidationError({"formato": "Use geojson o csv."})
        qs = filtrar_detecciones(m.DeteccionIA.objects.select_related("foco"), request.query_params).order_by("-fecha", "-id")
        nombre = f"detecciones-ia-{timezone.localdate():%Y%m%d}.{formato}"
        if formato == "csv":
            resp = HttpResponse(reportes.generar_csv_detecciones(qs), content_type="text/csv; charset=utf-8")
        else:
            resp = HttpResponse(reportes.generar_geojson_detecciones(qs), content_type="application/geo+json")
        resp["Content-Disposition"] = f'attachment; filename="{nombre}"'
        return resp

    @action(detail=True, methods=["post"])
    def confirmar(self, request, pk=None):
        """Valida la detección: crea el foco, calcula su IRH y lo vincula. Idempotente."""
        det = get_object_or_404(m.DeteccionIA, codigo=pk)
        if det.estado == "descartado":
            raise ValidationError("La detección fue descartada.")
        if det.foco_id:
            return Response(s.DeteccionSerializer(det).data)
        d = request.data
        foco = m.Foco(
            tipo=d.get("tipo") or det.tipo_foco or "basural", estado="pendiente", ubicacion=det.ubicacion, direccion=det.direccion,
            volumen_m3=float(d.get("volumenM3", det.area_m2 * 0.5)), superficie_m2=det.area_m2,
            permeabilidad=d.get("permeabilidad", "media"), creado_por=request.user,
            observaciones=f"Detección IA {det.codigo} (confianza {det.confianza:g}%), validada por el operador."
                          + (" [DATO DE PRUEBA: la detección es simulada, no una detección real.]" if det.origen == "simulado" else ""))
        if d.get("tipoResiduo"):
            foco.tipo_residuo = m.TipoResiduo.objects.filter(codigo=d["tipoResiduo"]).first()
        recalcular(foco, motivo="alta")
        det.foco, det.estado = foco, "confirmado"
        det.save(update_fields=["foco", "estado"])
        return Response(s.DeteccionSerializer(det).data)

    @action(detail=True, methods=["post"])
    def descartar(self, request, pk=None):
        det = get_object_or_404(m.DeteccionIA, codigo=pk)
        if det.foco_id:
            raise ValidationError("La detección ya generó un foco.")
        det.estado = "descartado"
        det.save(update_fields=["estado"])
        return Response(s.DeteccionSerializer(det).data)
