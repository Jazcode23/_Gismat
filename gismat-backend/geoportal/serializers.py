"""Serializadores. La salida replica EXACTAMENTE los tipos del frontend (src/types/geoportal.ts,
src/services/gismatStore.ts) para que pueda consumirse sin tocar ninguna pantalla."""
from django.conf import settings
from django.contrib.gis.geos import Point
from rest_framework import serializers

from . import models as m
from .services import geo
from .services.focos import dar_de_baja, recalcular

FMT_FECHA = ["%Y-%m-%d", "%d/%m/%Y"]


def ring_latlng(poligono):
    """Anillo exterior como [[lat,lng],...] sin repetir el primer vértice (formato del frontend)."""
    pts = list(poligono.exterior_ring.coords)[:-1]
    return [[round(y, 6), round(x, 6)] for x, y in pts]


def line_latlng(linea):
    return [[round(y, 6), round(x, 6)] for x, y in linea.coords]


def dmy(fecha):
    return fecha.strftime("%d/%m/%Y")


def coords_texto(punto):
    ns = "S" if punto.y < 0 else "N"
    eo = "O" if punto.x < 0 else "E"
    return f"{abs(punto.y):.4f}° {ns}, {abs(punto.x):.4f}° {eo}"


# ----------------------------------------------------------------- Capas geográficas
class CursoAguaSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="codigo")
    longitudKm = serializers.SerializerMethodField()
    estadoConservacion = serializers.CharField(source="estado_conservacion")
    bufferMetros = serializers.IntegerField(source="buffer_metros")
    coordenadas = serializers.SerializerMethodField()

    class Meta:
        model = m.CursoAgua
        fields = ["id", "nombre", "tipo", "longitudKm", "estadoConservacion", "coordenadas", "bufferMetros", "origen"]

    def get_longitudKm(self, o):
        return geo.longitud_km(o)

    def get_coordenadas(self, o):
        return line_latlng(o.geom)


class ZonaRiesgoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="codigo")
    coordenadas = serializers.SerializerMethodField()

    class Meta:
        model = m.ZonaRiesgo
        fields = ["id", "nombre", "tipo", "nivel", "coordenadas", "descripcion"]

    def get_coordenadas(self, o):
        return ring_latlng(o.geom)


class PuntoMonitoreoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="codigo")
    coordenadas = serializers.SerializerMethodField()
    ultimoDato = serializers.CharField(source="ultimo_dato")
    valorMedido = serializers.CharField(source="valor_medido")
    estado = serializers.SerializerMethodField()

    class Meta:
        model = m.PuntoMonitoreo
        fields = ["id", "nombre", "tipo", "coordenadas", "ultimoDato", "valorMedido", "estado"]

    def get_coordenadas(self, o):
        return [round(o.geom.y, 6), round(o.geom.x, 6)]

    def get_estado(self, o):
        return "Operativo" if o.operativo else "Mantenimiento"


class BarrioSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="codigo")
    habitantesAprox = serializers.IntegerField(source="habitantes_aprox")
    coordenadas = serializers.SerializerMethodField()

    class Meta:
        model = m.Barrio
        fields = ["id", "nombre", "habitantesAprox", "coordenadas"]

    def get_coordenadas(self, o):
        return ring_latlng(o.geom)


def microcuenca_a_dict(fila):
    """`fila` viene de geo.carga_por_microcuenca()."""
    mc = fila["microcuenca"]
    return {
        "id": mc.codigo, "nombre": mc.nombre, "superficieKm2": geo.superficie_km2(mc),
        "irhPromedio": fila["irh_promedio"], "nivelRiesgo": fila["nivel_riesgo"],
        "focosTotales": fila["focos_totales"], "focosActivos": fila["focos_activos"],
        "focosCriticos": fila["focos_criticos"], "cursosAsociados": mc.cursos_asociados,
        "recomendaciones": mc.recomendaciones, "coordenadas": ring_latlng(mc.geom), "color": mc.color,
        "cargaAcumulada": fila["carga_acumulada"], "volumenM3": fila["volumen_m3"], "origen": mc.origen,
    }


# ----------------------------------------------------------------- Intervenciones
class IntervencionSerializer(serializers.ModelSerializer):
    """Entrada tolerante: acepta los nombres del frontend (title/desc/tags/cuadrilla/date)."""

    tipo = serializers.CharField(max_length=200, required=False)
    title = serializers.CharField(max_length=200, write_only=True, required=False)
    observaciones = serializers.CharField(required=False, allow_blank=True)
    desc = serializers.CharField(write_only=True, required=False, allow_blank=True)
    etiquetas = serializers.ListField(child=serializers.CharField(max_length=80), required=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=80), write_only=True, required=False)
    cuadrilla = serializers.CharField(required=False, allow_blank=True, write_only=True)
    date = serializers.DateField(input_formats=FMT_FECHA, write_only=True, required=False)
    fecha = serializers.DateField(input_formats=FMT_FECHA, required=False)
    volumen_removido_ton = serializers.FloatField(min_value=0, max_value=100000, required=False)
    resultadoFoco = serializers.ChoiceField(choices=["activo", "pendiente", "limpiado"], write_only=True, required=False)
    cuadrillaNombre = serializers.SerializerMethodField()
    responsableNombre = serializers.SerializerMethodField()
    focoId = serializers.CharField(source="foco.codigo", read_only=True)

    class Meta:
        model = m.Intervencion
        fields = ["id", "focoId", "fecha", "tipo", "title", "observaciones", "desc", "etiquetas", "tags",
                  "cuadrilla", "date", "cuadrillaNombre", "responsableNombre", "volumen_removido_ton", "estado",
                  "irh_antes", "irh_despues", "resultadoFoco"]
        read_only_fields = ["irh_antes", "irh_despues"]

    def get_cuadrillaNombre(self, o):
        return o.cuadrilla_texto

    def get_responsableNombre(self, o):
        return o.responsable.nombre_completo if o.responsable else ""

    def validate(self, a):
        a["tipo"] = a.pop("title", None) or a.get("tipo")
        if not a["tipo"]:
            raise serializers.ValidationError({"tipo": "El tipo de intervención es obligatorio."})
        if "desc" in a:
            a["observaciones"] = a.pop("desc")
        if "tags" in a:
            a["etiquetas"] = a.pop("tags")
        if "date" in a:
            a["fecha"] = a.pop("date")
        return a

    def to_representation(self, o):
        d = super().to_representation(o)
        d["title"], d["desc"], d["tags"] = o.tipo, o.observaciones, o.etiquetas
        d["date"] = dmy(o.fecha)
        d["cuadrilla"] = o.cuadrilla_texto
        return d


def resolver_cuadrilla(valor):
    """Acepta código ('alfa') o nombre libre. Devuelve (Cuadrilla|None, texto)."""
    if not valor:
        return None, ""
    c = m.Cuadrilla.objects.filter(codigo=valor).first() or m.Cuadrilla.objects.filter(nombre__iexact=valor).first()
    return c, (c.nombre if c else valor)


# ----------------------------------------------------------------- Foco
AFECTAN_IRH = {"ubicacion", "volumen_m3", "permeabilidad", "tipo_residuo", "estado"}


class FocoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="codigo", read_only=True)
    ubicacion = serializers.CharField(source="direccion", max_length=200)
    latitud = serializers.FloatField(write_only=True, required=False)
    longitud = serializers.FloatField(write_only=True, required=False)
    tipo = serializers.ChoiceField(choices=m.Foco.Tipo.choices)
    estado = serializers.ChoiceField(choices=m.Foco.Estado.choices, required=False)
    volumenM3 = serializers.FloatField(source="volumen_m3", min_value=0, max_value=1_000_000, required=False)
    superficieM2 = serializers.FloatField(source="superficie_m2", min_value=0, max_value=100_000_000, required=False)
    permeabilidad = serializers.ChoiceField(choices=m.Foco.Permeabilidad.choices, required=False)
    permeabilidadDetalle = serializers.CharField(source="permeabilidad_detalle", required=False, allow_blank=True,
                                                 max_length=120)
    tipoResiduo = serializers.SlugRelatedField(source="tipo_residuo", slug_field="codigo", required=False,
                                               allow_null=True, queryset=m.TipoResiduo.objects.all())
    proximaAccionRecomendada = serializers.CharField(source="proxima_accion", required=False, allow_blank=True)
    foto = serializers.ImageField(required=False, allow_null=True)

    # --- solo lectura (forma FocoAmbiente del frontend)
    fechaRegistro = serializers.DateField(source="fecha_registro", read_only=True)
    coordenadas = serializers.SerializerMethodField()
    nivelRiesgo = serializers.CharField(source="nivel_riesgo", read_only=True)
    distanciaCursoAgua = serializers.SerializerMethodField()
    cursoAguaCercano = serializers.SerializerMethodField()
    microcuencaId = serializers.SerializerMethodField()
    volumenEstimado = serializers.SerializerMethodField()
    permeabilidadSuelo = serializers.SerializerMethodField()
    ultimaIntervencion = serializers.SerializerMethodField()
    fechaActualizacion = serializers.DateTimeField(source="fecha_actualizacion", read_only=True)
    datosPendientes = serializers.JSONField(source="datos_pendientes", read_only=True)
    irhProvisorio = serializers.BooleanField(source="irh_provisorio", read_only=True)
    totalIntervenciones = serializers.SerializerMethodField()
    alertasActivas = serializers.SerializerMethodField()

    class Meta:
        model = m.Foco
        fields = ["id", "tipo", "estado", "fechaRegistro", "ubicacion", "barrio", "coordenadas", "latitud", "longitud",
                  "irh", "nivelRiesgo", "distanciaCursoAgua", "cursoAguaCercano", "microcuencaId", "volumenEstimado",
                  "volumenM3", "permeabilidad", "permeabilidadDetalle", "permeabilidadSuelo", "observaciones",
                  "ultimaIntervencion", "proximaAccionRecomendada", "superficieM2", "tipoResiduo", "foto",
                  "fechaActualizacion", "totalIntervenciones", "alertasActivas", "datosPendientes", "irhProvisorio"]
        read_only_fields = ["irh"]

    # ---- lectura
    def get_coordenadas(self, o):
        return [round(o.ubicacion.y, 6), round(o.ubicacion.x, 6)]

    def get_distanciaCursoAgua(self, o):
        return round(o.distancia_curso_m) if o.distancia_curso_m is not None else None

    def get_cursoAguaCercano(self, o):
        return o.curso_cercano.nombre if o.curso_cercano else ""

    def get_microcuencaId(self, o):
        return o.microcuenca.codigo if o.microcuenca else ""

    def get_volumenEstimado(self, o):
        if "volumen" in (o.datos_pendientes or []):
            return "Sin relevar"
        ton = round(o.volumen_m3 * settings.DENSIDAD_RESIDUOS_T_M3)
        return f"~{round(o.volumen_m3)} m³ (~{ton} Toneladas)"

    def get_permeabilidadSuelo(self, o):
        if "permeabilidad" in (o.datos_pendientes or []):
            return "Sin relevar"
        base = o.get_permeabilidad_display()
        return f"{base} ({o.permeabilidad_detalle})" if o.permeabilidad_detalle else base

    def get_totalIntervenciones(self, o):
        return len(o.intervenciones.all())

    def get_alertasActivas(self, o):
        return sum(1 for a in o.alertas.all() if a.estado == "activa")

    def get_ultimaIntervencion(self, o):
        i = next(iter(o.intervenciones.all()), None)
        if not i:
            return None
        return {"fecha": i.fecha.isoformat(), "cuadrilla": i.cuadrilla_texto, "descripcion": i.observaciones or i.tipo,
                "volumenRemovidoTon": i.volumen_removido_ton}

    def to_representation(self, o):
        d = super().to_representation(o)
        d["latitud"], d["longitud"] = round(o.ubicacion.y, 6), round(o.ubicacion.x, 6)
        return d

    # ---- validación
    def validate(self, a):
        lat, lng = a.pop("latitud", None), a.pop("longitud", None)
        if self.instance is None and (lat is None or lng is None):
            raise serializers.ValidationError({"latitud": "Latitud y longitud son obligatorias."})
        if (lat is None) != (lng is None):
            raise serializers.ValidationError({"latitud": "Enviá latitud y longitud juntas."})
        if lat is not None:
            lng_min, lat_min, lng_max, lat_max = settings.GISMAT_BBOX
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise serializers.ValidationError({"latitud": "Coordenadas fuera de rango."})
            if not (lat_min <= lat <= lat_max and lng_min <= lng <= lng_max):
                raise serializers.ValidationError({"latitud": "La ubicación está fuera del área de San Miguel de Tucumán."})
            a["ubicacion_punto"] = Point(lng, lat, srid=4326)
        if a.get("estado") == m.Foco.Estado.INACTIVO:
            raise serializers.ValidationError({"estado": "Para dar de baja usá DELETE /api/focos/{id}/."})
        if self.instance and self.instance.estado == m.Foco.Estado.INACTIVO:
            raise serializers.ValidationError("El foco está dado de baja y no puede modificarse.")
        return a

    def create(self, validated):
        punto = validated.pop("ubicacion_punto")
        # Lo que el cliente no informa queda "pendiente de relevar" (IRH provisorio) en vez de asumirse
        pendientes = [nombre for nombre, campo in (("volumen", "volumen_m3"), ("permeabilidad", "permeabilidad"),
                                                   ("tipo_residuo", "tipo_residuo"))
                      if validated.get(campo) is None]
        foco = m.Foco(ubicacion=punto, creado_por=self.context["request"].user, datos_pendientes=pendientes, **validated)
        recalcular(foco, motivo="alta")
        return foco

    def update(self, foco, validated):
        punto = validated.pop("ubicacion_punto", None)
        recalcula = bool(punto) or bool(AFECTAN_IRH & set(validated))
        if punto:
            foco.ubicacion = punto
        for k, v in validated.items():
            setattr(foco, k, v)
        # Al relevar un dato pendiente deja de estar pendiente
        resueltos = {"volumen_m3": "volumen", "permeabilidad": "permeabilidad", "tipo_residuo": "tipo_residuo"}
        foco.datos_pendientes = [d for d in (foco.datos_pendientes or [])
                                 if not any(k in validated and validated[k] is not None and d == n
                                            for k, n in resueltos.items())]
        if recalcula:
            recalcular(foco, motivo="modificacion")
        else:
            foco.save()
        return foco


# ----------------------------------------------------------------- Historial, alertas
class HistorialIRHSerializer(serializers.ModelSerializer):
    fecha = serializers.DateTimeField(source="fecha_calculo")

    class Meta:
        model = m.HistorialIRH
        fields = ["id", "fecha", "valor", "nivel", "variables", "motivo"]


class AlertaSerializer(serializers.ModelSerializer):
    """Forma EnvironmentalAlert del frontend + recomendación y estado."""

    id = serializers.SerializerMethodField()
    descripcion = serializers.CharField(source="mensaje")
    fecha = serializers.SerializerMethodField()
    focoId = serializers.CharField(source="foco.codigo")
    microcuencaId = serializers.SerializerMethodField()
    coordenadas = serializers.SerializerMethodField()

    class Meta:
        model = m.Alerta
        fields = ["id", "titulo", "descripcion", "tipo", "nivel", "fecha", "focoId", "microcuencaId", "coordenadas",
                  "recomendacion", "estado"]

    def get_id(self, o):
        return f"ALT-{o.fecha.year}-{o.pk:03d}"

    def get_fecha(self, o):
        from django.utils import timezone
        return timezone.localtime(o.fecha).strftime("%Y-%m-%d %H:%M")

    def get_microcuencaId(self, o):
        return o.microcuenca.codigo if o.microcuenca else None

    def get_coordenadas(self, o):
        return [round(o.foco.ubicacion.y, 6), round(o.foco.ubicacion.x, 6)]


# ----------------------------------------------------------------- Pantallas de trazabilidad / IA
BADGES = {
    "recuperado": ("Espacio Recuperado", "bg-emerald-50 text-emerald-700 border-emerald-200", "bg-emerald-500"),
    "pendiente": ("Pendiente de Acción", "bg-red-50 text-red-700 border-red-200", "bg-red-500"),
    "cuadrilla": ("Cuadrilla Asignada", "bg-amber-50 text-amber-700 border-amber-200", "bg-amber-500"),
    "curso": ("Intervención en Curso", "bg-blue-50 text-blue-700 border-blue-200", "bg-blue-500"),
    "inactivo": ("Inactivo", "bg-slate-50 text-slate-600 border-slate-200", "bg-slate-400"),
}


def foco_a_trace(f):
    """Forma FocoTraceItem (gismatStore.ts)."""
    ints = list(f.intervenciones.all())  # más reciente primero
    hist = list(f.historial_irh.all())
    inicial = hist[-1].valor if hist else f.irh
    if f.estado == "inactivo":
        k = "inactivo"
    elif f.estado == "limpiado":
        k = "recuperado"
    elif ints and ints[0].estado in ("programada", "en_proceso"):
        k = "cuadrilla"
    elif ints:
        k = "curso"
    else:
        k = "pendiente"
    badge, clase, dot = BADGES[k]
    irh = round(f.irh)
    if k == "recuperado" and inicial > f.irh:
        irh_inicial = f"Inicial: {round(inicial)} (-{round((inicial - f.irh) / inicial * 100)}%)"
    else:
        irh_inicial = f"Riesgo {f.nivel_riesgo}"
    barra = "bg-red-500" if f.irh >= settings.IRH_UMBRAL_CRITICO else "bg-amber-500" if f.irh >= settings.IRH_UMBRAL_MODERADO else "bg-emerald-500"
    prio = {"Crítico": "Alta (Crítico)", "Moderado": "Media (Moderado)", "Bajo": "Baja (Mitigado)"}[f.nivel_riesgo]
    ult = ints[0] if ints else None
    cuenca = (f.curso_cercano.nombre.split(" (")[0] if f.curso_cercano else (f.microcuenca.nombre if f.microcuenca else ""))
    tipo_txt = f.get_tipo_display() + (f" + {f.tipo_residuo.nombre}" if f.tipo_residuo else "")
    lista = []
    for i, x in enumerate(ints):
        lista.append({"id": str(x.pk), "title": x.tipo, "badge": "RECIENTE" if i == 0 else None,
                      "date": dmy(x.fecha), "desc": x.observaciones, "tags": x.etiquetas,
                      "cuadrilla": x.cuadrilla_texto, "toneladas": x.volumen_removido_ton})
    return {
        "id": f.codigo, "cuenca": cuenca, "location": f.direccion, "statusBadge": badge, "statusBadgeClass": clase,
        "irhActual": irh, "irhInitial": irh_inicial, "irhBarClass": barra, "irhWidth": f"{irh}%", "dotClass": dot,
        "lastDate": dmy(ult.fecha if ult else f.fecha_registro), "lastAction": ult.tipo if ult else "Registro inicial",
        "tipoFoco": tipo_txt, "superficie": f"~{round(f.superficie_m2)} m²",
        "cuadrilla": (ult.cuadrilla_texto if ult and ult.cuadrilla_texto else "Pendiente Asignación"),
        "prioridad": f"{prio} • IRH: {irh}", "coords": coords_texto(f.ubicacion),
        "distCuenca": f"{round(f.distancia_curso_m)}m" if f.distancia_curso_m is not None else "-",
        "intervencionesList": lista, "volumenRemovidoTon": sum(x.volumen_removido_ton for x in ints),
    }


class DeteccionSerializer(serializers.ModelSerializer):
    """Forma AIDetectionItem (gismatStore.ts) para lectura; alta con latitud/longitud (módulo IA)."""

    latitud = serializers.FloatField(write_only=True)
    longitud = serializers.FloatField(write_only=True)
    ubicacion = serializers.CharField(source="direccion", write_only=True)
    confianza = serializers.FloatField(min_value=0, max_value=100, write_only=True)
    area_m2 = serializers.FloatField(min_value=0, write_only=True, required=False)

    class Meta:
        model = m.DeteccionIA
        fields = ["latitud", "longitud", "ubicacion", "confianza", "area_m2", "cauce", "distancia_curso_m",
                  "pendiente", "densidad", "vulnerabilidad_hidrica", "escurrimiento", "residuos_peligrosos", "fecha", "tipo_foco"]

    def create(self, v):
        v["ubicacion"] = Point(v.pop("longitud"), v.pop("latitud"), srid=4326)
        return m.DeteccionIA.objects.create(**v)

    def to_representation(self, o):
        nuevo = o.estado == "nuevo"
        confirmado = o.estado == "confirmado"
        return {
            "id": o.codigo, "location": o.direccion, "coords": coords_texto(o.ubicacion),
            "confidence": f"{round(o.confianza)}%", "confianzaValor": o.confianza, "area": f"~{round(o.area_m2)} m²", "date": o.fecha.isoformat(),
            # statusType: nuevo | confirmado | descartado (antes, todo lo que no era "nuevo" figuraba como "confirmado")
            "statusType": o.estado,
            "statusText": "Nuevo / Pendiente IRH" if nuevo else (
                (f"Confirmado ({o.foco.codigo})" if o.foco else "Confirmado") if confirmado else "Descartado"),
            "statusSub": "Cálculo IRH al confirmar foco" if nuevo else (
                (f"IRH {o.foco.irh:g} calculado" if o.foco else "Foco confirmado") if confirmado else "Descartada por el operador"),
            "dotColor": "bg-blue-500 ring-2 ring-blue-500/30" if nuevo else ("bg-emerald-500" if confirmado else "bg-slate-400"),
            "distancia": f"{round(o.distancia_curso_m)} metros" if o.distancia_curso_m is not None else "-",
            "cauce": o.cauce, "pendiente": o.pendiente, "densidad": o.densidad,
            "vulnHidrica": o.vulnerabilidad_hidrica, "escurrimiento": o.escurrimiento,
            "residuosPeligrosos": o.residuos_peligrosos, "estado": o.estado,
            "focoId": o.foco.codigo if o.foco else None,
            # tipo informado por la IA o, si no lo hay, el del foco asociado; origen: "simulado" = dato de prueba, no es una detección real
            "tipoFoco": o.tipo_foco or (o.foco.tipo if o.foco else ""),
            "origen": "simulado" if o.origen == "simulado" else "real",
            "riesgo": o.foco.nivel_riesgo if o.foco else None,
            "irh": o.foco.irh if o.foco else None,
        }
