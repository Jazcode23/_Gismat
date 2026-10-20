"""Completa el sistema con las capas base y las detecciones de IA que faltan (solo AGREGA; no borra nada).

    python manage.py cargar_capas_ia             # DRY-RUN (por defecto): informa qué haría, no escribe
    python manage.py cargar_capas_ia --aplicar   # escribe

Qué hace:
  1. Carga microcuencas, zonas de riesgo, puntos de monitoreo y barrios (datos de EJEMPLO del proyecto; si ya existen
     las capas derivadas de los cursos reales se omiten microcuencas, zonas y puntos:
     datos_demo.json; las microcuencas quedan con origen='simulado'). Se insertan/actualizan por código.
     Los CURSOS DE AGUA ya no se cargan acá: los reales vienen de descargar_cursos_agua_osm + importar_capa.
  2. Carga las detecciones de IA de ejemplo del proyecto + 8 detecciones SIMULADAS sobre esos cauces
     (módulo "Detecciones IA"). Solo se cargan si la tabla de detecciones está vacía.
  3. Si hay cursos de agua cargados, recalcula los basurales BR-xxx que aún no tienen cauce asignado:
     completa distancia al curso de agua, microcuenca e IRH. Agrega una fila al historial; no borra el existente.
NO importa los 12 focos de ejemplo del demo (MB-/VC-): no se mezclan datos inventados con los basurales reales.
"""
import json
import random
from datetime import timedelta

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.management.commands.cargar_datos_demo import DATOS, DETECCIONES, poligono
from geoportal.services.focos import recalcular

PENDIENTES = ["4.8% con dirección de escorrentía", "3.6% hacia colector", "2.9% moderada", "1.5% planicie aluvial",
              "5.2% fuerte hacia el cauce"]
DENSIDADES = ["Alta (~310 hab/ha)", "Media (~220 hab/ha)", "Media (~170 hab/ha)", "Baja (~90 hab/ha)"]


# ---------- lógica pura (sin base de datos) ----------
def detecciones_simuladas(cursos, n=8):
    """n detecciones deterministas sobre los cauces: misma tupla que DETECCIONES del cargador demo."""
    rnd = random.Random("gismat-sim-detecciones")
    out = []
    for i in range(n):
        c = cursos[i % len(cursos)]
        pts = c["coordenadas"]                       # [[lat, lng], ...]
        k = rnd.randrange(len(pts) - 1)
        t = rnd.random()
        lat = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t
        lng = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t
        off = rnd.uniform(0.0001, 0.0009)            # ~11 a ~100 m del cauce
        lat, lng = lat + rnd.choice([-1, 1]) * off, lng + rnd.choice([-1, 1]) * off
        dist = round(off * 111000)
        corto = c["nombre"].split(" (")[0]
        cercania = max(0.0, 1 - dist / 140)
        vh = min(98, round(55 + 40 * cercania + rnd.uniform(-5, 5)))
        out.append((f"{corto} - Tramo {i + 1}", round(lat, 6), round(lng, 6), rnd.randint(62, 97), rnd.randint(120, 700),
                    -rnd.randint(1, 20), f"{corto.upper()} (Cauce)", dist, rnd.choice(PENDIENTES), rnd.choice(DENSIDADES),
                    vh, max(40, vh - rnd.randint(2, 15)), rnd.randint(40, 85)))
    return out
# ---------- fin lógica pura ----------


class Command(BaseCommand):
    help = "Carga capas base + detecciones IA de ejemplo y completa cauce/microcuenca de los basurales (dry-run por defecto)."

    def add_arguments(self, p):
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")

    def handle(self, *a, aplicar, **kw):
        d = json.loads(DATOS.read_text(encoding="utf-8"))
        hoy = timezone.localdate()
        dets = list(DETECCIONES) + detecciones_simuladas(d["cursos"])
        # Las detecciones de ejemplo se cargan SOLO si la tabla está vacía: otros comandos (ajustar_detecciones_cursos,
        # simular_historial) modifican sus direcciones o agregan más, y si no se duplicarían.
        nuevas = [] if m.DeteccionIA.objects.exists() else dets
        hay_cursos = m.CursoAgua.objects.exists()
        sin_capa = (m.Foco.objects.filter(codigo__startswith="BR-", curso_cercano__isnull=True).count()
                    if hay_cursos else 0)
        # Si ya existen las capas derivadas de los cursos reales (derivar_capas_desde_cursos) no se recargan las de ejemplo.
        derivadas = m.Microcuenca.objects.filter(codigo__startswith="cd-").exists()
        capas = {"barrios": m.Barrio} if derivadas else {"microcuencas": m.Microcuenca, "zonas": m.ZonaRiesgo,
                                                          "puntos": m.PuntoMonitoreo, "barrios": m.Barrio}
        self.stdout.write("Capas base (en la base ahora -> en el archivo): " +
                          " · ".join(f"{k} {mod.objects.count()}->{len(d[k])}" for k, mod in capas.items()))
        self.stdout.write(f"Detecciones IA a crear: {len(nuevas)} (ya existentes: {len(dets) - len(nuevas)})")
        self.stdout.write(f"Basurales BR-xxx a recalcular (sin cauce asignado): {sin_capa}")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))

        with transaction.atomic():
            for c in ([] if derivadas else d["microcuencas"]):
                m.Microcuenca.objects.update_or_create(codigo=c["id"], defaults=dict(
                    nombre=c["nombre"], color=c["color"], recomendaciones=c["recomendaciones"],
                    cursos_asociados=c["cursosAsociados"], origen=m.Origen.SIMULADO, geom=poligono(c["coordenadas"])))
            for c in ([] if derivadas else d["zonas"]):
                m.ZonaRiesgo.objects.update_or_create(codigo=c["id"], defaults=dict(
                    nombre=c["nombre"], tipo=c["tipo"], nivel=c["nivel"], descripcion=c["descripcion"],
                    geom=poligono(c["coordenadas"])))
            for c in ([] if derivadas else d["puntos"]):
                lat, lng = c["coordenadas"]
                m.PuntoMonitoreo.objects.update_or_create(codigo=c["id"], defaults=dict(
                    nombre=c["nombre"], tipo=c["tipo"], ultimo_dato=c["ultimoDato"], valor_medido=c["valorMedido"],
                    operativo=c["estado"] == "Operativo", geom=Point(lng, lat, srid=4326)))
            for c in d["barrios"]:
                m.Barrio.objects.update_or_create(codigo=c["id"], defaults=dict(
                    nombre=c["nombre"], habitantes_aprox=c["habitantesAprox"], geom=poligono(c["coordenadas"])))

            for dir_, lat, lng, conf, area, off, cauce, dist, pend, dens, vh, esc, rp in nuevas:
                m.DeteccionIA.objects.create(
                    direccion=dir_, ubicacion=Point(lng, lat, srid=4326), confianza=conf, area_m2=area,
                    fecha=hoy + timedelta(days=off), cauce=cauce, distancia_curso_m=dist, pendiente=pend, densidad=dens,
                    vulnerabilidad_hidrica=vh, escurrimiento=esc, residuos_peligrosos=rp, origen=m.Origen.SIMULADO)

            if hay_cursos:
                for f in m.Foco.objects.filter(codigo__startswith="BR-", curso_cercano__isnull=True):
                    recalcular(f, motivo="capas_base")
        self.stdout.write(self.style.SUCCESS(
            f"Listo: capas cargadas · {len(nuevas)} detecciones IA nuevas · {sin_capa} basurales recalculados."))
