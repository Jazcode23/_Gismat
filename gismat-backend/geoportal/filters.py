"""Filtros de focos. Acepta los nombres del frontend (GeoportalFilters) y alias en español."""
from django.db.models import Q

from .models import Alerta, Foco
from .services import geo


def _p(params, *claves):
    for c in claves:
        v = params.get(c)
        if v not in (None, "", "todos", "todas"):
            return v
    return None


def _num(v, nombre):
    from rest_framework.exceptions import ValidationError
    try:
        return float(v)
    except (TypeError, ValueError):
        raise ValidationError({nombre: "Debe ser numérico."})


def filtrar_focos(qs, params):
    from rest_framework.exceptions import ValidationError
    if v := _p(params, "tipoFoco", "tipo"):
        qs = qs.filter(tipo=v)
    if v := _p(params, "estado"):
        qs = qs.filter(estado=v)
    if v := _p(params, "nivelRiesgo", "nivel"):
        qs = qs.filter(nivel_riesgo=v)
    if v := _p(params, "microcuenca"):
        qs = qs.filter(microcuenca__codigo=v)
    if v := _p(params, "tipoResiduo", "tipo_residuo"):
        qs = qs.filter(tipo_residuo__codigo=v)
    if (v := params.get("irhMin")) not in (None, ""):
        qs = qs.filter(irh__gte=_num(v, "irhMin"))
    if (v := params.get("irhMax")) not in (None, ""):
        qs = qs.filter(irh__lte=_num(v, "irhMax"))
    if (v := params.get("proximidadMax")) not in (None, "", "0"):
        qs = qs.filter(distancia_curso_m__lte=_num(v, "proximidadMax"))
    if v := _p(params, "desde"):
        qs = qs.filter(fecha_registro__gte=v)
    if v := _p(params, "hasta"):
        qs = qs.filter(fecha_registro__lte=v)
    if v := _p(params, "barrio"):
        qs = qs.filter(barrio__icontains=v)
    if v := _p(params, "searchQuery", "q"):
        qs = qs.filter(Q(codigo__icontains=v) | Q(direccion__icontains=v) | Q(barrio__icontains=v)
                       | Q(curso_cercano__nombre__icontains=v))
    if str(params.get("soloAlertas", "")).lower() in ("1", "true"):
        qs = qs.filter(alertas__estado=Alerta.Estado.ACTIVA).distinct()
    # zona = "lat_min,lng_min,lat_max,lng_max"  |  cerca = "lat,lng,metros"
    if z := params.get("zona"):
        try:
            a, b, c, d = (float(x) for x in z.split(","))
        except ValueError:
            raise ValidationError({"zona": "Formato: lat_min,lng_min,lat_max,lng_max"})
        qs = qs.filter(pk__in=geo.focos_en_bbox(a, b, c, d).values("pk"))
    if cr := params.get("cerca"):
        try:
            lat, lng, r = (float(x) for x in cr.split(","))
        except ValueError:
            raise ValidationError({"cerca": "Formato: lat,lng,metros"})
        qs = qs.filter(pk__in=geo.focos_en_radio(geo.punto(lat, lng), r).values("pk"))
    return qs


# ------------------------------------------------------------------ Detecciones de IA
ESTADOS_DETECCION = ("nuevo", "confirmado", "descartado")
TIPOS_FOCO = ("basural", "microbasural", "volcadero")


def filtrar_detecciones(qs, params, excluir_descartadas_por_defecto=False):
    """Filtros de detecciones de IA. Los usan la lista y la exportación, así lo que se descarga coincide con lo que se ve.

    estado=nuevo|confirmado|descartado|todos    q=texto (ID, ubicación o cauce)    tipo=basural|microbasural|volcadero
    mes=AAAA-MM    confianza_min=0-100    origen=real|simulado    riesgo=Crítico|Moderado|Bajo (del foco asociado)
    Sin 'estado', la lista oculta las descartadas (compatibilidad) y la exportación incluye todas."""
    import re

    from rest_framework.exceptions import ValidationError

    estado = (params.get("estado") or "").strip().lower()
    if estado in ("", "todos", "todas"):
        if estado == "" and excluir_descartadas_por_defecto:
            qs = qs.exclude(estado="descartado")
    elif estado in ESTADOS_DETECCION:
        qs = qs.filter(estado=estado)
    else:
        raise ValidationError({"estado": "Use nuevo, confirmado, descartado o todos."})
    if q := (params.get("q") or "").strip():
        qs = qs.filter(Q(codigo__icontains=q) | Q(direccion__icontains=q) | Q(cauce__icontains=q))
    if tipo := _p(params, "tipo", "tipoFoco"):
        if tipo not in TIPOS_FOCO:
            raise ValidationError({"tipo": "Use basural, microbasural o volcadero."})
        qs = qs.filter(Q(tipo_foco=tipo) | Q(tipo_foco="", foco__tipo=tipo))     # el informado por la IA o, si no, el del foco
    if mes := _p(params, "mes"):
        hallado = re.fullmatch(r"(\d{4})-(0[1-9]|1[0-2])", mes)
        if not hallado:
            raise ValidationError({"mes": "Formato: AAAA-MM."})
        qs = qs.filter(fecha__year=int(hallado.group(1)), fecha__month=int(hallado.group(2)))
    if (c := _p(params, "confianza_min", "confianzaMin")) is not None:
        qs = qs.filter(confianza__gte=_num(c, "confianza_min"))
    if origen := _p(params, "origen"):
        if origen not in ("real", "simulado"):
            raise ValidationError({"origen": "Use real o simulado."})
        qs = qs.filter(origen="simulado") if origen == "simulado" else qs.exclude(origen="simulado")
    if riesgo := _p(params, "riesgo"):
        qs = qs.filter(foco__nivel_riesgo=riesgo)
    return qs
