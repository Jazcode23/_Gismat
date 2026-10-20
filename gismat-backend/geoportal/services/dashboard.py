"""Indicadores del dashboard y estadísticas del geoportal."""
from datetime import timedelta

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from calendar import monthrange
from datetime import date

from ..models import Alerta, Foco, HistorialIRH, Intervencion
from .irh import clasificar
from . import geo

ABIERTOS = ["activo", "pendiente"]


def estadisticas_geoportal():
    f = Foco.objects.exclude(estado="inactivo")
    ab = f.filter(estado__in=ABIERTOS)
    return {
        "totalFocos": Foco.objects.count(),
        "focosActivos": ab.count(),
        "focosCriticos": ab.filter(nivel_riesgo="Crítico").count(),
        "focosLimpiados": f.filter(estado="limpiado").count(),
        "irhPromedioSMT": round(ab.aggregate(a=Avg("irh"))["a"] or 0, 1),
        "residuosEstimadosM3": round(ab.aggregate(s=Sum("volumen_m3"))["s"] or 0),
        "distanciaPromedioCauce": round(ab.aggregate(a=Avg("distancia_curso_m"))["a"] or 0, 1),
        "alertasActivas": Alerta.objects.filter(estado="activa").exclude(nivel="informativa").count(),
    }


def indicadores(meses=6):
    hoy = timezone.localdate()
    vig = Foco.objects.exclude(estado="inactivo")
    ab = vig.filter(estado__in=ABIERTOS)
    por_nivel = {n: vig.filter(nivel_riesgo=n).count() for n in ("Bajo", "Moderado", "Crítico")}
    por_estado = {e: Foco.objects.filter(estado=e).count() for e in ("activo", "pendiente", "limpiado", "inactivo")}
    ints = Intervencion.objects.filter(estado="completada")
    desde = (hoy.replace(day=1) - timedelta(days=31 * (meses - 1))).replace(day=1)
    evol = (HistorialIRH.objects.filter(fecha_calculo__date__gte=desde)
            .annotate(mes=TruncMonth("fecha_calculo")).values("mes")
            .annotate(irh_promedio=Avg("valor"), calculos=Count("id")).order_by("mes"))
    vigentes_n = vig.count()
    con_interv = vig.filter(intervenciones__estado="completada").distinct().count()

    # Distribución en los 4 rangos que muestra el dashboard (los niveles Bajo/Moderado/Crítico se mantienen aparte)
    rangos = [("Crítico (>80 IRH)", 80, 101), ("Alto (60 – 79 IRH)", 60, 80),
              ("Moderado (40 – 59 IRH)", 40, 60), ("Bajo Control (<40 IRH)", -1, 40)]
    distribucion = []
    for nombre, lo, hi in rangos:
        n = vig.filter(irh__gte=max(lo, 0) if lo >= 0 else 0, irh__lt=hi).count()
        distribucion.append({"rango": nombre, "cantidad": n,
                             "porcentaje": round(100 * n / vigentes_n, 1) if vigentes_n else 0})

    # Reducción acumulada: IRH inicial (primer cálculo de cada foco) vs IRH actual
    iniciales = {}
    for fid, valor in HistorialIRH.objects.order_by("foco_id", "fecha_calculo", "id").values_list("foco_id", "valor"):
        iniciales.setdefault(fid, valor)
    actuales = dict(vig.values_list("id", "irh"))
    base = [iniciales[i] for i in actuales if i in iniciales]
    prom_ini = sum(base) / len(base) if base else 0
    prom_act = sum(actuales[i] for i in actuales if i in iniciales) / len(base) if base else 0
    reduccion = round(100 * (prom_ini - prom_act) / prom_ini) if prom_ini else 0

    # Evolución mensual del año en curso: intervenciones y focos hoy saneados que se intervinieron ese mes
    meses = []
    for mes in range(1, hoy.month + 1):
        del_mes = Intervencion.objects.filter(fecha__year=hoy.year, fecha__month=mes)
        meses.append({"mes": mes, "intervenciones": del_mes.count(),
                      "saneados": del_mes.filter(foco__estado="limpiado").values("foco").distinct().count()})

    # Focos por nivel de riesgo al cierre de cada mes (último IRH conocido a esa fecha; si el foco es posterior al
    # primer cálculo registrado se usa el valor inicial)
    historia = {}
    for fid, fecha, valor in HistorialIRH.objects.order_by("foco_id", "fecha_calculo", "id").values_list(
            "foco_id", "fecha_calculo", "valor"):
        historia.setdefault(fid, []).append((fecha.date(), valor))
    registro = dict(vig.values_list("id", "fecha_registro"))
    niveles_mes = []
    for mes in range(1, hoy.month + 1):
        corte = hoy if mes == hoy.month else date(hoy.year, mes, monthrange(hoy.year, mes)[1])
        cuenta = {"Crítico": 0, "Moderado": 0, "Bajo": 0}
        for fid, alta in registro.items():
            h = historia.get(fid)
            if alta > corte or not h:
                continue
            previos = [v for f, v in h if f <= corte]
            cuenta[clasificar(previos[-1] if previos else h[0][1])] += 1
        niveles_mes.append({"mes": mes, **{k.lower().replace("í", "i"): v for k, v in cuenta.items()}})

    hace30 = hoy - timedelta(days=30)
    cuadrillas = {}
    for mc_id, txt in (Intervencion.objects.filter(fecha__gte=hace30, foco__microcuenca__isnull=False)
                       .exclude(cuadrilla_texto="").values_list("foco__microcuenca__codigo", "cuadrilla_texto")):
        cuadrillas.setdefault(mc_id, set()).add(txt)

    return {
        "totalFocos": Foco.objects.count(),
        "focosVigentes": vigentes_n,
        "focosIrhProvisorio": vig.exclude(datos_pendientes=[]).count(),
        "tasaIntervencion": round(100 * con_interv / vigentes_n) if vigentes_n else 0,
        "reduccionIRH": reduccion,
        "distribucionIRH": distribucion,
        "evolucionMensual": meses,
        "evolucionNiveles": niveles_mes,
        "focosActivos": ab.count(),
        "focosInactivos": por_estado["inactivo"],
        "focosPorNivelRiesgo": por_nivel,
        "focosPorEstado": por_estado,
        "espaciosRecuperados": por_estado["limpiado"],
        "irhPromedio": round(ab.aggregate(a=Avg("irh"))["a"] or 0, 1),
        "intervenciones": {
            "total": Intervencion.objects.count(),
            "completadas": ints.count(),
            "mesActual": Intervencion.objects.filter(fecha__year=hoy.year, fecha__month=hoy.month).count(),
            "toneladasRemovidas": round(ints.aggregate(s=Sum("volumen_removido_ton"))["s"] or 0, 1),
        },
        "alertas": {
            "activas": Alerta.objects.filter(estado="activa").count(),
            "criticas": Alerta.objects.filter(estado="activa", nivel="critica").count(),
            "porNivel": {n: Alerta.objects.filter(estado="activa", nivel=n).count()
                         for n in ("critica", "advertencia", "informativa")},
        },
        "riesgoPorMicrocuenca": [
            {"id": r["microcuenca"].codigo, "nombre": r["microcuenca"].nombre, "irhPromedio": r["irh_promedio"],
             "nivelRiesgo": r["nivel_riesgo"], "cargaAcumulada": r["carga_acumulada"],
             "focosActivos": r["focos_activos"], "focosCriticos": r["focos_criticos"],
             "focosTotales": r["focos_totales"],
             "cuadrillasActivas": len(cuadrillas.get(r["microcuenca"].codigo, ()))}
            for r in geo.carga_por_microcuenca()],
        "evolucionIRH": [{"mes": e["mes"].strftime("%Y-%m"), "irhPromedio": round(e["irh_promedio"], 1),
                          "calculos": e["calculos"]} for e in evol],
    }
