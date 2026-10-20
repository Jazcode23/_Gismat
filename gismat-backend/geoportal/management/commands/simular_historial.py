"""Simula la HISTORIA de los meses anteriores sobre los focos ya simulados (reversible, dry-run por defecto).

    python manage.py simular_historial                 # DRY-RUN: muestra el plan por mes, no escribe nada
    python manage.py simular_historial --aplicar       # escribe la historia simulada
    python manage.py simular_historial --revertir      # muestra qué deshacería
    python manage.py simular_historial --revertir --aplicar

Requisito: haber ejecutado antes simular_datos_faltantes (los focos deben tener la marca [SIMULADO]).

Qué hace (todo con valores FICTICIOS y deterministas: misma corrida => mismos valores):
  1. Reparte la fecha de alta de los focos simulados entre enero y el mes actual (hoy todos figuran en octubre
     porque esa fue la fecha de carga del CSV). Los focos conservan su ID, dirección y coordenadas.
  2. INSERTA en el historial de IRH una evolución mensual hacia atrás (el volumen crece con el tiempo, el IRH se
     calcula con la fórmula real del sistema). No modifica ni borra ninguna fila existente del historial.
  3. Agrega intervenciones completadas en meses pasados (algunas dejan el foco limpiado).
  4. Agrega detecciones de IA históricas: confirmadas (vinculadas a focos reales), y descartadas.
Todo lo creado queda registrado en data/simulacion_historial.json; --revertir lo elimina y restaura las fechas.
Orden para deshacer todo: primero simular_historial --revertir --aplicar y después simular_datos_faltantes --revertir.
"""
import calendar
import json
import random
from datetime import date, datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.services.focos import recalcular
from geoportal.services.irh import calcular_irh

MARCA_SIM = "[SIMULADO]"
MARCA_HIST = "[HISTORIAL SIMULADO]"
ETIQUETA = "simulado"
PESOS_MES = [3, 4, 5, 6, 8, 9, 10, 12, 13, 9]   # altas relativas de enero a octubre (más recientes, más altas)
PCT_PASADAS = 0.34                               # fracción de focos con una intervención en un mes pasado
PCT_LIMPIAS = 0.33                               # de esas, las que dejan el foco limpiado
N_CONFIRMADAS, N_DESCARTADAS = 16, 7
TIPOS_INT = ["Limpieza y retiro de residuos", "Retiro de escombros y desmalezado", "Operativo de saneamiento",
             "Retiro de residuos voluminosos"]
CUADRILLAS = ["Cuadrilla Alfa – Saneamiento Hidráulico", "Cuadrilla Beta – Desobstrucción Pluvial",
              "Cuadrilla Gamma – Residuos Especiales", "Cuadrilla Espacios Verdes - Brigada 01"]
PENDIENTES = ["4.8% con dirección de escorrentía", "3.6% hacia colector", "2.9% moderada", "1.5% planicie aluvial"]
DENSIDADES = ["Alta (~310 hab/ha)", "Media (~220 hab/ha)", "Media (~170 hab/ha)", "Baja (~90 hab/ha)"]


# ---------- lógica pura (sin base de datos) ----------
def _fin_de_mes(anio, mes):
    return date(anio, mes, calendar.monthrange(anio, mes)[1])


def planificar(entradas, hoy, densidad, irh):
    """entradas: [{id, codigo, distancia, vol, factor, perm, estado, ints:[(fecha, ton)]}].
    Devuelve por foco: fecha de alta, filas de historial [(fecha, resultado_irh, motivo)] y la intervención pasada."""
    ini = date(hoy.year, 1, 3)
    planes = []
    for e in entradas:
        rnd = random.Random(f"gismat-hist-{e['codigo']}")
        mes = min(rnd.choices(range(1, 11), PESOS_MES)[0], hoy.month)
        primero = max(date(hoy.year, mes, 1), ini)
        ultimo = min(_fin_de_mes(hoy.year, mes), hoy - timedelta(days=1))
        reg = ultimo if ultimo <= primero else primero + timedelta(days=rnd.randint(0, (ultimo - primero).days))

        v_actual = e["vol"]
        v_fin = v_actual + sum(t for _, t in e["ints"]) / densidad     # volumen antes de las intervenciones de hoy
        g0 = rnd.uniform(0.30, 0.65)

        past = None
        desde, hasta = reg + timedelta(days=25), hoy - timedelta(days=25)
        if not e["ints"] and e["estado"] == "activo" and desde < hasta and rnd.random() < PCT_PASADAS:
            p = desde + timedelta(days=rnd.randint(0, (hasta - desde).days))
            limpia = rnd.random() < PCT_LIMPIAS
            if limpia:
                v_now = round(rnd.uniform(6, 16), 1)
                v_after, v_peak, objetivo = v_now * rnd.uniform(0.6, 1.0), max(v_actual * rnd.uniform(1.0, 1.6), 40.0), v_now
            else:
                v_after = v_actual * rnd.uniform(0.55, 0.95)
                v_peak, objetivo, v_now = max(v_after * rnd.uniform(1.4, 2.4), v_after + 25.0), v_actual, None
            past = {"fecha": p, "limpia": limpia, "v_after": v_after, "v_peak": v_peak, "objetivo": objetivo, "v_now": v_now}

        def vol(t):
            if past and t >= past["fecha"]:
                f = (t - past["fecha"]).days / max(1, (hoy - past["fecha"]).days)
                return past["v_after"] + (past["objetivo"] - past["v_after"]) * min(1.0, f)
            fin_t = past["fecha"] if past else hoy
            base = past["v_peak"] if past else v_fin
            f = (t - reg).days / max(1, (fin_t - reg).days)
            return base * (g0 + (1 - g0) * min(1.0, max(0.0, f)))

        def estado_en(t):
            return "limpiado" if past and past["limpia"] and t >= past["fecha"] else "activo"

        fechas = {reg}
        for mm in range(reg.month, hoy.month):
            fin = _fin_de_mes(hoy.year, mm)
            if reg < fin < hoy:
                fechas.add(fin)
        filas = []
        for t in sorted(fechas):
            ruido = 1 + rnd.uniform(-0.03, 0.03) if t != reg else 1.0
            res = irh(e["distancia"], max(0.0, vol(t) * ruido), e["factor"], e["perm"], estado_en(t))
            filas.append((t, res, "alta_simulada" if t == reg else "evolucion_simulada"))

        if past:
            p = past["fecha"]
            antes = irh(e["distancia"], past["v_peak"], e["factor"], e["perm"], "activo")
            despues = irh(e["distancia"], past["v_after"], e["factor"], e["perm"], estado_en(p))
            filas.append((p, despues, "intervencion_simulada"))
            past.update(ton=round((past["v_peak"] - past["v_after"]) * densidad, 2), irh_antes=antes.valor,
                        irh_despues=despues.valor, tipo=rnd.choice(TIPOS_INT), cuadrilla=rnd.choice(CUADRILLAS))
        planes.append({"e": e, "reg": reg, "filas": sorted(filas, key=lambda x: x[0]), "past": past})
    return planes


def planificar_detecciones(infos, hoy):
    """infos: [{id, codigo, direccion, lng, lat, reg, cauce, distancia}] -> detecciones históricas."""
    rnd = random.Random("gismat-hist-detecciones")
    ini = date(hoy.year, 1, 2)
    cand = sorted((i for i in infos if i["reg"] - timedelta(days=4) >= ini and i["reg"] <= hoy - timedelta(days=10)),
                  key=lambda x: x["codigo"])
    out = []
    for i in rnd.sample(cand, min(N_CONFIRMADAS, len(cand))):
        out.append({"estado": "confirmado", "foco_id": i["id"], "lng": i["lng"], "lat": i["lat"],
                    "direccion": i["direccion"], "fecha": i["reg"] - timedelta(days=rnd.randint(1, 4)),
                    "confianza": rnd.randint(76, 98), "area": rnd.randint(120, 650), "cauce": i["cauce"],
                    "dist": i["distancia"], "pend": rnd.choice(PENDIENTES), "dens": rnd.choice(DENSIDADES),
                    "vh": rnd.randint(55, 96), "esc": rnd.randint(45, 90), "rp": rnd.randint(30, 85)})
    dias = max(1, (hoy - timedelta(days=15) - ini).days)
    for _ in range(N_DESCARTADAS):
        i = rnd.choice(sorted(infos, key=lambda x: x["codigo"]))
        out.append({"estado": "descartado", "foco_id": None, "lng": i["lng"] + rnd.choice([-1, 1]) * rnd.uniform(0.0012, 0.003),
                    "lat": i["lat"] + rnd.choice([-1, 1]) * rnd.uniform(0.0012, 0.003),
                    "direccion": f"{i['direccion']} - área lindante"[:200], "fecha": ini + timedelta(days=rnd.randint(0, dias)),
                    "confianza": rnd.randint(52, 74), "area": rnd.randint(60, 300), "cauce": "", "dist": None,
                    "pend": rnd.choice(PENDIENTES), "dens": rnd.choice(DENSIDADES),
                    "vh": rnd.randint(30, 60), "esc": rnd.randint(25, 55), "rp": rnd.randint(10, 45)})
    return sorted(out, key=lambda d: d["fecha"])
# ---------- fin lógica pura ----------


def _aware(d):
    return timezone.make_aware(datetime.combine(d, time(12, 0)))


def _manifiesto():
    return Path(settings.BASE_DIR) / "data" / "simulacion_historial.json"


class Command(BaseCommand):
    help = "Simula historia de meses anteriores (altas, IRH mensual, intervenciones, detecciones IA). Reversible."

    def add_arguments(self, p):
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Deshace la historia simulada.")

    def handle(self, *a, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        if _manifiesto().exists():
            raise CommandError("La historia simulada ya fue aplicada. Para repetirla ejecutá antes: "
                               "python manage.py simular_historial --revertir --aplicar")
        focos = list(m.Foco.objects.filter(observaciones__contains=MARCA_SIM).exclude(observaciones__contains=MARCA_HIST)
                     .select_related("tipo_residuo", "curso_cercano").order_by("codigo"))
        if not focos:
            raise CommandError("No hay focos simulados. Ejecutá antes: python manage.py simular_datos_faltantes --aplicar")
        hoy = timezone.localdate()
        dens = settings.DENSIDAD_RESIDUOS_T_M3
        ints = {}
        for fid, fecha, ton in m.Intervencion.objects.filter(foco__in=focos, estado="completada").values_list(
                "foco_id", "fecha", "volumen_removido_ton"):
            ints.setdefault(fid, []).append((fecha, ton))
        entradas = [{"id": f.id, "codigo": f.codigo, "distancia": f.distancia_curso_m, "vol": f.volumen_m3,
                     "factor": f.tipo_residuo.factor_peligrosidad if f.tipo_residuo else None, "perm": f.permeabilidad,
                     "estado": f.estado, "ints": ints.get(f.id, [])} for f in focos]
        planes = planificar(entradas, hoy, dens, calcular_irh)
        infos = [{"id": f.id, "codigo": f.codigo, "direccion": f.direccion, "lng": f.ubicacion.x, "lat": f.ubicacion.y,
                  "reg": pl["reg"], "cauce": f.curso_cercano.nombre if f.curso_cercano else "", "distancia": f.distancia_curso_m}
                 for f, pl in zip(focos, planes)]
        dets = planificar_detecciones(infos, hoy)

        por_mes = lambda fechas: " ".join(f"{k:02d}:{fechas.count(k)}" for k in range(1, hoy.month + 1))
        self.stdout.write(f"Focos simulados: {len(focos)} · filas de historial a insertar: {sum(len(p['filas']) for p in planes)}")
        self.stdout.write("Altas por mes (mes:cantidad)          " + por_mes([p["reg"].month for p in planes]))
        pasadas = [p["past"] for p in planes if p["past"]]
        self.stdout.write("Intervenciones pasadas por mes        " + por_mes([x["fecha"].month for x in pasadas])
                          + f"  (total {len(pasadas)}, {sum(x['limpia'] for x in pasadas)} dejan el foco limpiado)")
        self.stdout.write("Detecciones IA históricas por mes     " + por_mes([d["fecha"].month for d in dets])
                          + f"  (total {len(dets)})")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))

        man = {"focos": {}, "historial": [], "intervenciones": [], "detecciones": []}
        with transaction.atomic():
            filas = []
            for f, pl in zip(focos, planes):
                man["focos"][str(f.id)] = {"fecha_registro": f.fecha_registro.isoformat(), "observaciones": f.observaciones,
                                           "estado": f.estado, "volumen_m3": f.volumen_m3}
                filas += [m.HistorialIRH(foco=f, fecha_calculo=_aware(t), valor=r.valor, nivel=r.nivel, variables=r.variables,
                                         motivo=mo) for t, r, mo in pl["filas"]]
                m.Foco.objects.filter(pk=f.id).update(fecha_registro=pl["reg"], observaciones=f"{MARCA_HIST} {f.observaciones}")
                p = pl["past"]
                if p:
                    iv = m.Intervencion.objects.create(
                        foco=f, fecha=p["fecha"], tipo=p["tipo"], cuadrilla_texto=p["cuadrilla"], etiquetas=[ETIQUETA],
                        observaciones=f"{MARCA_SIM} Intervención de ejemplo en un mes anterior.", estado="completada",
                        volumen_removido_ton=p["ton"], irh_antes=p["irh_antes"], irh_despues=p["irh_despues"])
                    man["intervenciones"].append(iv.id)
                    if p["limpia"]:   # el foco queda limpiado hoy: se actualiza su estado vigente con el servicio normal
                        f.refresh_from_db()
                        f.estado, f.volumen_m3 = "limpiado", p["v_now"]
                        recalcular(f, motivo="simulacion_historial")
                        man["historial"].append(m.HistorialIRH.objects.filter(foco=f, motivo="simulacion_historial").latest("id").id)
            man["historial"] += [h.pk for h in m.HistorialIRH.objects.bulk_create(filas)]
            for d in dets:
                o = m.DeteccionIA.objects.create(
                    ubicacion=Point(d["lng"], d["lat"], srid=4326), direccion=d["direccion"], confianza=d["confianza"],
                    area_m2=d["area"], fecha=d["fecha"], estado=d["estado"], foco_id=d["foco_id"], cauce=d["cauce"],
                    distancia_curso_m=d["dist"], pendiente=d["pend"], densidad=d["dens"], vulnerabilidad_hidrica=d["vh"],
                    escurrimiento=d["esc"], residuos_peligrosos=d["rp"], origen=m.Origen.SIMULADO)
                man["detecciones"].append(o.id)
            _manifiesto().write_text(json.dumps(man), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(
            f"Historia simulada aplicada: {len(man['historial'])} filas de historial, {len(man['intervenciones'])} "
            f"intervenciones, {len(man['detecciones'])} detecciones. Para deshacer: simular_historial --revertir --aplicar"))

    def revertir(self, aplicar):
        if not _manifiesto().exists():
            raise CommandError("No hay historia simulada para revertir (no existe data/simulacion_historial.json).")
        man = json.loads(_manifiesto().read_text(encoding="utf-8"))
        self.stdout.write(f"A revertir: {len(man['historial'])} filas de historial, {len(man['intervenciones'])} "
                          f"intervenciones, {len(man['detecciones'])} detecciones y fechas de {len(man['focos'])} focos.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        with transaction.atomic():
            m.HistorialIRH.objects.filter(pk__in=man["historial"]).delete()
            m.Intervencion.objects.filter(pk__in=man["intervenciones"]).delete()
            m.DeteccionIA.objects.filter(pk__in=man["detecciones"]).delete()
            for fid, d in man["focos"].items():
                f = m.Foco.objects.filter(pk=fid).first()
                if not f:
                    continue
                m.Foco.objects.filter(pk=f.id).update(fecha_registro=d["fecha_registro"], observaciones=d["observaciones"])
                if f.estado != d["estado"] or f.volumen_m3 != d["volumen_m3"]:
                    f.refresh_from_db()
                    f.estado, f.volumen_m3 = d["estado"], d["volumen_m3"]
                    recalcular(f, motivo="reversion_historial")
        _manifiesto().unlink()
        self.stdout.write(self.style.SUCCESS("Historia simulada revertida."))
