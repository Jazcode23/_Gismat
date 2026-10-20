"""Hace que las detecciones de IA simuladas coincidan con los cursos de agua REALES cargados en la base.

    python manage.py ajustar_detecciones_cursos                 # DRY-RUN: muestra qué cambiaría, no escribe nada
    python manage.py ajustar_detecciones_cursos --aplicar       # aplica los cambios
    python manage.py ajustar_detecciones_cursos --revertir --aplicar

Requisito: haber cargado los cursos reales (ACTUALIZAR_CURSOS_AGUA.bat / descargar_cursos_agua_osm + importar_capa).

Qué toca (nada más):
  - Detecciones simuladas en estado "nuevo" (las de ejemplo del proyecto y las "- Tramo N" que creó cargar_capas_ia):
    se las REUBICA sobre un curso de agua real con nombre, a 12-90 m del trazado, y se recalculan dirección,
    cauce, distancia y vulnerabilidad hídrica con la geometría verdadera.
  - Detecciones históricas creadas por simular_historial (confirmadas/descartadas): se mantiene su ubicación y se
    recalculan el cauce y la distancia al curso real más cercano.
No toca detecciones ya confirmadas o descartadas por una persona. Los valores originales se guardan en
data/ajuste_detecciones.json para poder revertir.
"""
import json
import math
import random
import re
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError

from geoportal import models as m
from geoportal.management.commands.cargar_datos_demo import DETECCIONES
from geoportal.services import geo

PATRON_TRAMO = re.compile(r" - Tramo \d+$")
M_POR_GRADO = 111320.0


# ---------- lógica pura (sin base de datos) ----------
def _largo_m(coords):
    return sum(math.hypot((x2 - x1) * M_POR_GRADO * math.cos(math.radians((y1 + y2) / 2)), (y2 - y1) * M_POR_GRADO)
               for (x1, y1), (x2, y2) in zip(coords, coords[1:]))


def punto_en_linea(coords, t):
    """Punto [lng, lat] a la fracción t (0-1) de la longitud de una línea [(lng, lat), ...]."""
    total = _largo_m(coords)
    objetivo = total * t
    acc = 0.0
    for a, b in zip(coords, coords[1:]):
        seg = _largo_m([a, b])
        if seg > 0 and acc + seg >= objetivo:
            f = (objetivo - acc) / seg
            return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        acc += seg
    return coords[-1][0], coords[-1][1]


def desplazar(lng, lat, metros, grados):
    """Mueve un punto `metros` en la dirección `grados` (0 = norte, 90 = este)."""
    ang = math.radians(grados)
    return (lng + metros * math.sin(ang) / (M_POR_GRADO * math.cos(math.radians(lat))),
            lat + metros * math.cos(ang) / M_POR_GRADO)


def elegir_curso(rnd, cursos):
    """cursos: [(id, coords)]; elige uno ponderado por longitud (descarta tramos de menos de 60 m)."""
    util = [(cid, c, _largo_m(c)) for cid, c in cursos]
    util = [u for u in util if u[2] >= 60] or util
    return rnd.choices(util, [u[2] for u in util])[0][:2]


def vulnerabilidad(distancia_m, ruido):
    return int(min(98, round(55 + 40 * max(0.0, 1 - distancia_m / 140) + ruido)))
# ---------- fin lógica pura ----------


def _archivo():
    return Path(settings.BASE_DIR) / "data" / "ajuste_detecciones.json"


def _manifiesto_historial():
    return Path(settings.BASE_DIR) / "data" / "simulacion_historial.json"


class Command(BaseCommand):
    help = "Ubica las detecciones IA simuladas sobre los cursos de agua reales (dry-run por defecto; reversible)."

    def add_arguments(self, p):
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Restaura ubicación, dirección, cauce y distancia originales.")

    def handle(self, *a, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        reales = list(m.CursoAgua.objects.filter(origen=m.Origen.OFICIAL))
        if not reales:
            raise CommandError("No hay cursos de agua reales cargados. Ejecutá antes ACTUALIZAR_CURSOS_AGUA.bat.")
        con_nombre = [c for c in reales if "sin nombre" not in c.nombre.lower()] or reales
        lineas = [(c.id, [tuple(p) for p in c.geom.coords]) for c in con_nombre if c.geom and len(c.geom.coords) >= 2]
        demo = {d[0] for d in DETECCIONES}

        nuevas = [d for d in m.DeteccionIA.objects.filter(estado="nuevo").order_by("id")
                  if d.direccion in demo or PATRON_TRAMO.search(d.direccion)]
        ids_hist = []
        if _manifiesto_historial().exists():
            ids_hist = json.loads(_manifiesto_historial().read_text(encoding="utf-8")).get("detecciones", [])
        historicas = list(m.DeteccionIA.objects.filter(pk__in=ids_hist).order_by("id"))

        cambios = []   # (detección, dict de campos nuevos)
        for d in nuevas:
            rnd = random.Random(f"gismat-ajuste-{d.codigo}")
            for _ in range(8):   # reintenta hasta que el curso más cercano real tenga nombre
                cid, coords = elegir_curso(rnd, lineas)
                lng, lat = punto_en_linea(coords, rnd.uniform(0.1, 0.9))
                lng, lat = desplazar(lng, lat, rnd.uniform(12, 90), rnd.uniform(0, 360))
                curso, dist = geo.curso_mas_cercano(Point(lng, lat, srid=4326))
                if curso and "sin nombre" not in curso.nombre.lower():
                    break
            if not curso:
                continue
            n = int(re.sub(r"\D", "", d.codigo) or 0)
            cambios.append((d, {"ubicacion": Point(lng, lat, srid=4326), "direccion": f"{curso.nombre} - Tramo {n}"[:200],
                                "cauce": f"{curso.nombre.upper()} (Cauce)"[:120], "distancia_curso_m": dist,
                                "vulnerabilidad_hidrica": vulnerabilidad(dist, rnd.uniform(-5, 5))}))
        for d in historicas:
            curso, dist = geo.curso_mas_cercano(d.ubicacion)
            if curso:
                cambios.append((d, {"cauce": f"{curso.nombre.upper()} (Cauce)"[:120], "distancia_curso_m": dist}))

        self.stdout.write(f"Cursos reales disponibles: {len(reales)} ({len(con_nombre)} con nombre) · "
                          f"detecciones a reubicar: {len(nuevas)} · históricas a recalcular: {len(historicas)}")
        for d, c in cambios[:16]:
            self.stdout.write(f"   {d.codigo}: {d.direccion!r} -> {c.get('direccion', d.direccion)!r} | cauce {c['cauce']} "
                              f"a {c['distancia_curso_m']} m")
        if len(cambios) > 16:
            self.stdout.write(f"   ... y {len(cambios) - 16} más")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))

        previo = json.loads(_archivo().read_text(encoding="utf-8")) if _archivo().exists() else {}
        for d, c in cambios:
            previo.setdefault(str(d.id), {"x": d.ubicacion.x, "y": d.ubicacion.y, "direccion": d.direccion, "cauce": d.cauce,
                                          "distancia_curso_m": d.distancia_curso_m,
                                          "vulnerabilidad_hidrica": d.vulnerabilidad_hidrica})
            m.DeteccionIA.objects.filter(pk=d.id).update(**c)
        _archivo().parent.mkdir(exist_ok=True)
        _archivo().write_text(json.dumps(previo), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Listo: {len(cambios)} detecciones alineadas con los cursos de agua reales."))

    def revertir(self, aplicar):
        if not _archivo().exists():
            raise CommandError("No hay ajuste para revertir (no existe data/ajuste_detecciones.json).")
        previo = json.loads(_archivo().read_text(encoding="utf-8"))
        self.stdout.write(f"A restaurar: {len(previo)} detecciones.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        for pk, v in previo.items():
            m.DeteccionIA.objects.filter(pk=pk).update(
                ubicacion=Point(v["x"], v["y"], srid=4326), direccion=v["direccion"], cauce=v["cauce"],
                distancia_curso_m=v["distancia_curso_m"], vulnerabilidad_hidrica=v["vulnerabilidad_hidrica"])
        _archivo().unlink()
        self.stdout.write(self.style.SUCCESS("Detecciones restauradas."))
