"""Genera la historia de DETECCIONES DE IA de enero al mes actual (DATOS SIMULADOS, identificados con origen = simulado).

    python manage.py simular_detecciones_ia                         # DRY-RUN: muestra el plan por mes, no escribe nada
    python manage.py simular_detecciones_ia --aplicar               # crea las que falten
    python manage.py simular_detecciones_ia --total 200 --aplicar   # total deseado de detecciones simuladas en el período
    python manage.py simular_detecciones_ia --revertir --aplicar    # elimina SOLO lo creado por este comando y restaura lo marcado

Son datos de PRUEBA: no son detecciones reales ni observaciones verificadas en campo. Cada registro queda con origen = simulado, que la
pantalla de Detecciones IA muestra como "SIMULADO" y que las exportaciones incluyen (columna "Origen" / propiedad "origen").

Qué hace:
  1. Marca como simuladas (solo el campo origen y, si falta, tipo_foco) las detecciones de ejemplo que ya crearon cargar_capas_ia y
     simular_historial. No toca ninguna otra: toda detección que no sea de esas es tratada como real y NO se modifica ni se elimina.
  2. Vincula detecciones CONFIRMADAS a focos existentes (de los tres tipos) que todavía no tienen detección: la detección es de 1 a 4
     días anterior al alta del foco y queda en su misma ubicación. Es una asociación simulada; no modifica el foco.
  3. Completa cada mes con detecciones nuevas (pendientes de revisión) y descartadas en ubicaciones plausibles de la zona de estudio,
     con tipo de foco, confianza, área y cauce relacionado calculado con los cursos de agua REALES cargados.
  4. Es reproducible (semilla) y no duplica: --total es el total deseado; solo se agregan las que faltan.
Requisitos: cursos de agua reales cargados y haber ejecutado SIMULAR_HISTORIAL.bat (para que los focos tengan fechas de alta repartidas).
"""
import json
import math
import random
import re
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import MultiPoint, Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.management.commands.ajustar_detecciones_cursos import desplazar, vulnerabilidad
from geoportal.management.commands.cargar_datos_demo import DETECCIONES
from geoportal.management.commands.simular_historial import DENSIDADES, PENDIENTES
from geoportal.services import geo
from geoportal.management.commands.simular_microbasurales import (CONTEXTO_MICRO, CONTEXTO_VC_TIERRA, MARGEN_ZONA, M_POR_GRADO, PESOS_MES,
                                                                  colocar, elegir_hotspots)

PATRON_TRAMO = re.compile(r" - Tramo \d+$")
PESOS_TIPO = {"basural": 40, "microbasural": 38, "volcadero": 22}
AREA = {"microbasural": (20, 120), "basural": (120, 600), "volcadero": (400, 2000)}      # m2 estimados por la IA, según el tipo
RESIDUOS_PELIGROSOS = {"microbasural": (10, 50), "basural": (30, 70), "volcadero": (40, 85)}
P_CONFIRMADA = 0.30                       # fracción de los focos existentes que originaron una detección confirmada
DIST_CAUCE_RELACIONADO = 400.0            # m: más lejos no se informa cauce relacionado


# ---------- lógica pura (sin base de datos) ----------
def objetivo_por_mes(total, hoy):
    """Reparte `total` entre enero y el mes actual según PESOS_MES (método del mayor resto): la suma es exactamente total."""
    pesos = PESOS_MES[:hoy.month]
    cuota = [total * p / sum(pesos) for p in pesos]
    base = [int(c) for c in cuota]
    for i in sorted(range(len(pesos)), key=lambda i: cuota[i] - base[i], reverse=True)[:total - sum(base)]:
        base[i] += 1
    return {i + 1: n for i, n in enumerate(base)}


def prob_pendiente(mes, hoy):
    """Probabilidad de que una detección de ese mes siga sin revisar: alta en el mes actual, baja en los meses viejos."""
    atraso = hoy.month - mes
    return 0.08 if atraso >= 4 else (0.80, 0.35, 0.20, 0.15)[atraso]


def elegir_tipo(rnd):
    return rnd.choices(list(PESOS_TIPO), list(PESOS_TIPO.values()))[0]


def tipo_estable(codigo):
    """Tipo de foco determinista para detecciones simuladas que todavía no lo tienen."""
    return elegir_tipo(random.Random(f"gismat-det-tipo-{codigo}"))


def fecha_en_mes(rnd, mes, hoy):
    ultimo = hoy.day if mes == hoy.month else [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
    return date(hoy.year, mes, rnd.randint(1, max(1, ultimo)))


def confirmadas_desde_focos(focos, hoy, semilla, probabilidad=P_CONFIRMADA):
    """focos: [{id, codigo, reg, ...}] sin detección. Devuelve [(foco, fecha_deteccion)] de las elegidas (determinista por código)."""
    inicio = date(hoy.year, 1, 1)
    out = []
    for f in focos:
        rnd = random.Random(f"gismat-det-conf-{semilla}-{f['codigo']}")
        if rnd.random() >= probabilidad:
            continue
        fecha = f["reg"] - timedelta(days=rnd.randint(1, 4))
        if inicio <= fecha <= hoy:
            out.append((f, fecha))
    return out


def detalle_relleno(clave, tipo, estado, semilla):
    """Atributos de una detección nueva/descartada (confianza, área, etc.). Solo dependen de la clave."""
    rnd = random.Random(f"gismat-det-attr-{semilla}-{clave}")
    lo, hi = AREA[tipo]
    rp = RESIDUOS_PELIGROSOS[tipo]
    return {"confianza": rnd.randint(52, 76) if estado == "descartado" else rnd.randint(55, 97), "area": rnd.randint(lo, hi),
            "pendiente": rnd.choice(PENDIENTES), "densidad": rnd.choice(DENSIDADES), "esc": rnd.randint(30, 90),
            "rp": rnd.randint(*rp), "ruido_vh": rnd.uniform(-5, 5)}
# ---------- fin lógica pura ----------


def _manifiesto():
    return Path(settings.BASE_DIR) / "data" / "simulacion_detecciones.json"


def _cauce(curso, dist):
    if curso is None or dist is None or dist > DIST_CAUCE_RELACIONADO:
        return "", None
    return f"{curso.nombre.upper()} (Cauce)"[:120], round(dist)


class Command(BaseCommand):
    help = "Genera detecciones de IA simuladas de enero al mes actual (origen = simulado). Dry-run por defecto; reversible."

    def add_arguments(self, p):
        p.add_argument("--total", type=int, default=120, help="Total deseado de detecciones simuladas en el período (def. 120).")
        p.add_argument("--semilla", type=int, default=2026, help="Semilla de la distribución (def. 2026).")
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Elimina lo creado por este comando y restaura lo que marcó.")

    # ---------------------------------------------------------------- planificación
    def existentes_simuladas(self):
        """Detecciones SIMULADAS creadas antes por otros comandos del proyecto (ejemplos y historia).

        Un ID guardado en data/simulacion_historial.json pertenece a UNA base de datos: si la base se recrea, ese ID puede coincidir con
        una detección real. Por eso el ID solo se acepta si la fila además tiene la firma de lo que genera simular_historial (los textos
        de pendiente y densidad salen de listas fijas). Las de ejemplo se reconocen por sus direcciones. Todo lo demás es real."""
        ids = set()
        historial = Path(settings.BASE_DIR) / "data" / "simulacion_historial.json"
        if historial.exists():
            candidatos = set(json.loads(historial.read_text(encoding="utf-8")).get("detecciones", []))
            for d in m.DeteccionIA.objects.filter(pk__in=candidatos).only("id", "pendiente", "densidad"):
                if d.pendiente in PENDIENTES and d.densidad in DENSIDADES:
                    ids.add(d.id)
        demo = {d[0] for d in DETECCIONES}
        for d in m.DeteccionIA.objects.only("id", "direccion"):
            if d.direccion in demo or PATRON_TRAMO.search(d.direccion):
                ids.add(d.id)
        return ids

    def handle(self, *a, total, semilla, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        if not 0 <= total <= 2000:
            raise CommandError("--total debe estar entre 0 y 2000.")
        cursos = list(m.CursoAgua.objects.filter(origen=m.Origen.OFICIAL))
        if not cursos:
            raise CommandError("No hay cursos de agua reales cargados. Ejecutá antes ACTUALIZAR_CURSOS_AGUA.bat.")
        focos_todos = list(m.Foco.objects.select_related("curso_cercano").order_by("codigo"))
        if not focos_todos:
            raise CommandError("No hay focos cargados para ubicar las detecciones en la zona de estudio.")
        hoy = timezone.localdate()

        # 1) detecciones ya existentes: simuladas (de otros comandos), propias de este comando y reales
        ids_sim = self.existentes_simuladas()
        todas = list(m.DeteccionIA.objects.select_related("foco").order_by("id"))
        simuladas = [d for d in todas if d.origen == "simulado" or d.id in ids_sim]
        por_marcar = [d for d in simuladas if d.origen != "simulado" or not d.tipo_foco]
        ids_simuladas = {d.id for d in simuladas}
        reales = [d for d in todas if d.id not in ids_simuladas]
        en_mes = {mes: 0 for mes in range(1, hoy.month + 1)}
        for d in simuladas:
            if d.fecha.year == hoy.year:
                en_mes[d.fecha.month] += 1

        # 2) zona de estudio y contexto de ubicación (igual que simular_microbasurales)
        zona = MultiPoint([f.ubicacion for f in focos_todos], srid=4326).convex_hull.buffer(MARGEN_ZONA)
        zona.srid = 4326
        prep, borde = zona.prepared, zona.boundary
        ctx = {"caja": zona.extent, "dentro": lambda x, y: prep.contains(Point(x, y, srid=4326)),
               "dist_borde": lambda x, y: borde.distance(Point(x, y, srid=4326)) * M_POR_GRADO * math.cos(math.radians(y)),
               "cercano": lambda x, y: geo.curso_mas_cercano(Point(x, y, srid=4326)),
               "lineas": [(c.id, [tuple(p) for p in c.geom.coords]) for c in cursos if c.geom and len(c.geom.coords) >= 2]}
        ctx["hotspots"] = elegir_hotspots(random.Random(f"gismat-det-hotspots-{semilla}"), ctx["caja"], ctx["dentro"])
        colocados = [(f.ubicacion.x, f.ubicacion.y, "real") for f in focos_todos] + \
                    [(d.ubicacion.x, d.ubicacion.y, "det") for d in todas]

        # 3) confirmadas: focos existentes sin detección
        con_deteccion = {d.foco_id for d in todas if d.foco_id}
        candidatos = [{"id": f.id, "codigo": f.codigo, "reg": f.fecha_registro, "obj": f} for f in focos_todos
                      if f.id not in con_deteccion and f.fecha_registro.year == hoy.year]
        confirmadas = confirmadas_desde_focos(candidatos, hoy, semilla)
        planes = []
        for f, fecha in confirmadas:
            rnd = random.Random(f"gismat-det-foco-{semilla}-{f['codigo']}")
            foco = f["obj"]
            lng, lat = desplazar(foco.ubicacion.x, foco.ubicacion.y, rnd.uniform(0, 12), rnd.uniform(0, 360))
            cauce, dist = _cauce(foco.curso_cercano, foco.distancia_curso_m)
            lo, hi = RESIDUOS_PELIGROSOS[foco.tipo]
            planes.append({"estado": "confirmado", "foco": foco, "tipo": foco.tipo, "fecha": fecha, "lng": lng, "lat": lat,
                           "direccion": foco.direccion, "confianza": rnd.randint(78, 98),
                           "area": max(5, round(foco.superficie_m2)) if foco.superficie_m2 else rnd.randint(*AREA[foco.tipo]),
                           "cauce": cauce, "dist": dist, "pendiente": rnd.choice(PENDIENTES), "densidad": rnd.choice(DENSIDADES),
                           "vh": vulnerabilidad(dist, rnd.uniform(-5, 5)) if dist is not None else rnd.randint(25, 45),
                           "esc": rnd.randint(30, 90), "rp": rnd.randint(lo, hi)})
            en_mes[fecha.month] += 1

        # 4) relleno: nuevas (pendientes) y descartadas hasta alcanzar el objetivo de cada mes
        objetivo = objetivo_por_mes(total, hoy)
        fallidos = 0
        for mes in range(1, hoy.month + 1):
            for k in range(1, max(0, objetivo[mes] - en_mes[mes]) + 1):
                idx = en_mes[mes] + k                      # posición dentro del mes: misma clave => mismo resultado
                clave = f"{hoy.year}-{mes:02d}-{idx:03d}"
                rnd = random.Random(f"gismat-det-sel-{semilla}-{clave}")
                tipo = elegir_tipo(rnd)
                estado = "nuevo" if rnd.random() < prob_pendiente(mes, hoy) else "descartado"
                lugar = colocar(clave, "volcadero" if tipo == "volcadero" else "microbasural", semilla, ctx, colocados)
                if lugar is None:
                    fallidos += 1
                    continue
                colocados.append((lugar["lng"], lugar["lat"], "det"))
                at = detalle_relleno(clave, tipo, estado, semilla)
                cauce, dist = _cauce(lugar["curso"], lugar["dist"])
                planes.append({"estado": estado, "foco": None, "tipo": tipo, "fecha": fecha_en_mes(rnd, mes, hoy), "lng": lugar["lng"],
                               "lat": lugar["lat"], "direccion": f"{lugar['contexto']} (aprox. {lugar['lat']:.5f}, {lugar['lng']:.5f})"[:200],
                               "confianza": at["confianza"], "area": at["area"], "cauce": cauce, "dist": dist, "pendiente": at["pendiente"],
                               "densidad": at["densidad"], "vh": vulnerabilidad(dist, at["ruido_vh"]) if dist is not None else rnd.randint(20, 45),
                               "esc": at["esc"], "rp": at["rp"]})
        self.informe(planes, por_marcar, simuladas, reales, objetivo, hoy, fallidos, focos_todos)
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        if not planes and not por_marcar:
            return self.stdout.write("Nada para crear.")
        previo = json.loads(_manifiesto().read_text(encoding="utf-8")) if _manifiesto().exists() else {"creadas": [], "marcadas": {}}
        previo.setdefault("codigos", {})
        with transaction.atomic():
            for d in por_marcar:
                previo["marcadas"].setdefault(str(d.id), {"origen": d.origen, "tipo_foco": d.tipo_foco})
                tipo = d.tipo_foco or (d.foco.tipo if d.foco_id else tipo_estable(d.codigo))
                m.DeteccionIA.objects.filter(pk=d.pk).update(origen="simulado", tipo_foco=tipo)
            for p in sorted(planes, key=lambda x: x["fecha"]):
                o = m.DeteccionIA.objects.create(
                    ubicacion=Point(p["lng"], p["lat"], srid=4326), direccion=p["direccion"], confianza=p["confianza"], area_m2=p["area"],
                    fecha=p["fecha"], estado=p["estado"], foco=p["foco"], cauce=p["cauce"], distancia_curso_m=p["dist"],
                    pendiente=p["pendiente"], densidad=p["densidad"], vulnerabilidad_hidrica=p["vh"], escurrimiento=p["esc"],
                    residuos_peligrosos=p["rp"], tipo_foco=p["tipo"], origen="simulado")
                previo["creadas"].append(o.id)
                previo["codigos"][str(o.id)] = o.codigo
            _manifiesto().parent.mkdir(exist_ok=True)
            _manifiesto().write_text(json.dumps(previo), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(planes)} detecciones simuladas creadas y {len(por_marcar)} existentes marcadas como simuladas. "
            f"Para deshacer: simular_detecciones_ia --revertir --aplicar"))

    def informe(self, planes, por_marcar, simuladas, reales, objetivo, hoy, fallidos, focos):
        w = self.stdout.write
        w(f"Detecciones reales (no se tocan): {len(reales)} · simuladas ya existentes: {len(simuladas)} "
          f"(a marcar con origen = simulado: {len(por_marcar)}) · a crear: {len(planes)}")
        w("Mes   objetivo | ya hay | nuevas: confirmadas / pendientes / descartadas")
        for mes in range(1, hoy.month + 1):
            hay = sum(1 for d in simuladas if d.fecha.year == hoy.year and d.fecha.month == mes)
            ps = [p for p in planes if p["fecha"].month == mes]
            w(f"  {mes:02d}     {objetivo[mes]:>4}   | {hay:>5}  | {sum(p['estado'] == 'confirmado' for p in ps):>4} / "
              f"{sum(p['estado'] == 'nuevo' for p in ps):>4} / {sum(p['estado'] == 'descartado' for p in ps):>4}")
        tipos = {t: sum(1 for p in planes if p["tipo"] == t) for t in PESOS_TIPO}
        w(f"Tipos de foco a crear: {tipos} · confianza media a crear: "
          f"{round(sum(p['confianza'] for p in planes) / len(planes)) if planes else '-'} %")
        antes = sum(1 for f in focos if f.fecha_registro < date(hoy.year, hoy.month, 1))
        if antes < len(focos) * 0.3:
            w(self.style.WARNING("AVISO: casi todos los focos figuran con alta en el mes actual, así que habrá pocas detecciones confirmadas "
                                 "en los meses anteriores. Ejecutá antes SIMULAR_HISTORIAL.bat para repartir las fechas de alta."))
        if fallidos:
            w(self.style.WARNING(f"No se pudo ubicar {fallidos} detecciones con las restricciones de separación."))

    def revertir(self, aplicar):
        if not _manifiesto().exists():
            raise CommandError("No hay nada para revertir (no existe data/simulacion_detecciones.json).")
        previo = json.loads(_manifiesto().read_text(encoding="utf-8"))
        self.stdout.write(f"A eliminar: {len(previo['creadas'])} detecciones creadas por este comando · a restaurar: "
                          f"{len(previo['marcadas'])} marcadas. No se toca ninguna detección real.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        codigos = previo.get("codigos", {})
        with transaction.atomic():
            propias = [d.pk for d in m.DeteccionIA.objects.filter(pk__in=previo["creadas"], origen="simulado")
                       if codigos.get(str(d.pk), d.codigo) == d.codigo]        # el ID debe seguir apuntando a la misma detección
            m.DeteccionIA.objects.filter(pk__in=propias).delete()
            for pk, v in previo["marcadas"].items():
                m.DeteccionIA.objects.filter(pk=pk, origen="simulado").update(origen=v["origen"], tipo_foco=v["tipo_foco"])
        _manifiesto().unlink()
        self.stdout.write(self.style.SUCCESS("Detecciones simuladas revertidas."))
