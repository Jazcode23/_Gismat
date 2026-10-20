"""Deriva microcuencas, zonas de riesgo y puntos de monitoreo a partir de los cursos de agua REALES cargados.

    python manage.py derivar_capas_desde_cursos                 # DRY-RUN: muestra qué generaría, no escribe nada
    python manage.py derivar_capas_desde_cursos --aplicar       # escribe las capas derivadas
    python manage.py derivar_capas_desde_cursos --revertir --aplicar   # borra las derivadas y restaura las de ejemplo

Requisito: haber cargado los cursos reales (ACTUALIZAR_CURSOS_AGUA.bat).

Es un MODELO APROXIMADO, no cartografía oficial. Todo lo derivado usa códigos "cd-..." y las microcuencas quedan con
origen='simulado':
  - Microcuencas: zona de influencia (diagrama de Voronoi en PostGIS) de cada uno de los cursos reales con nombre más
    largos: cada punto de la zona de estudio se asigna al curso principal más cercano. No es una delimitación
    hidrológica por relieve (para eso hace falta un modelo digital de elevación).
  - Zonas de riesgo: franjas alrededor de ríos (180 m), canales troncales (100 m) y arroyos (100 m) reales.
  - Puntos de monitoreo: sobre el trazado real de los cursos principales; los valores medidos son ficticios.
Reemplaza las capas de ejemplo equivalentes (microcuencas simuladas, zonas zr_* y puntos mon_*) y reasigna la
microcuenca de los focos y de sus alertas. No modifica los barrios ni los cursos.
"""
import json
import random
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import GEOSGeometry, MultiPoint, Point
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils.text import slugify

from geoportal import models as m

PREFIJO = "cd-"
MAX_MICROCUENCAS = 6
MIN_LARGO_M = 1500
MARGEN_ZONA = 0.02            # grados (~2 km) alrededor de los focos
AREA_MINIMA = 1e-6            # grados^2 (~12.000 m2): descarta fragmentos
MAX_ZONAS = 12
FRANJAS = {"Río Principal": ("Inundabilidad Aluvial", "Muy Alto", 180),
           "Canal Troncal Pluvial": ("Inundabilidad Aluvial", "Alto", 100),
           "Arroyo": ("Erosión de Márgenes", "Alto", 100)}
PALETA = ["#ef4444", "#f97316", "#0d9488", "#6366f1", "#a855f7", "#0ea5e9"]


# ---------- lógica pura (sin base de datos) ----------
def componer(por_grupo):
    """{grupo: geometría GEOS} -> {grupo: Polygon}. Quita solapes y anexa fragmentos sueltos al vecino con más borde."""
    principales, sueltos = {}, []
    for g, geom in por_grupo.items():
        partes = sorted(list(geom) if geom.geom_type == "MultiPolygon" else [geom], key=lambda x: -x.area)
        principales[g] = partes[0]
        sueltos += partes[1:]
    for s in sueltos:
        cand = {g: s.intersection(p).length for g, p in principales.items() if s.intersects(p)}
        if cand and max(cand.values()) > 0:
            g = max(cand, key=cand.get)
            u = principales[g].union(s)
            principales[g] = u if u.geom_type == "Polygon" else max(list(u), key=lambda x: x.area)
    return principales


def partes_poligono(geom):
    """Polígonos individuales de una geometría, de mayor a menor área, sin fragmentos mínimos."""
    if geom is None or geom.empty:
        return []
    partes = list(geom) if geom.geom_type in ("MultiPolygon", "GeometryCollection") else [geom]
    return sorted((p for p in partes if p.geom_type == "Polygon" and p.area >= AREA_MINIMA), key=lambda p: -p.area)
# ---------- fin lógica pura ----------


def _demo():
    ruta = Path(__file__).with_name("datos_demo.json")
    return json.loads(ruta.read_text(encoding="utf-8"))


class Command(BaseCommand):
    help = "Deriva microcuencas, zonas de riesgo y puntos de monitoreo desde los cursos de agua reales (dry-run por defecto)."

    def add_arguments(self, p):
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Borra las capas derivadas y restaura las de ejemplo.")

    # --- utilidades de base de datos ---
    def _consulta(self, sql, params=()):
        with connection.cursor() as c:
            c.execute(sql, params)
            return c.fetchall()

    def _area_km2(self, poly):
        """Área en km2 calculada por PostGIS en EPSG:32720 (WGS 84 / UTM zona 20 S, la de Tucumán).
        La transformación la hace PostGIS con su propio PROJ, así no depende de que el GDAL de Python y el
        proj.db del sistema sean compatibles entre sí (en Windows suelen mezclarse OSGeo4W y PostgreSQL)."""
        poly.srid = 4326
        return float(self._consulta("SELECT ST_Area(ST_Transform(ST_GeomFromEWKT(%s), 32720)) / 1e6", [poly.ewkt])[0][0])

    def _reasignar(self):
        """Microcuenca de cada foco según el polígono que lo contiene, y la de sus alertas (sin recalcular el IRH)."""
        for f in m.Foco.objects.only("id", "ubicacion"):
            mc = m.Microcuenca.objects.filter(geom__contains=f.ubicacion).first()
            m.Foco.objects.filter(pk=f.pk).update(microcuenca=mc)
            m.Alerta.objects.filter(foco_id=f.pk).update(microcuenca=mc)

    def handle(self, *a, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        tabla = m.CursoAgua._meta.db_table
        if not m.CursoAgua.objects.filter(origen=m.Origen.OFICIAL).exists():
            raise CommandError("No hay cursos de agua reales cargados. Ejecutá antes ACTUALIZAR_CURSOS_AGUA.bat.")

        grupos = [(n, t, float(l)) for n, t, l in self._consulta(
            f"SELECT nombre, MIN(tipo), SUM(ST_Length(geom::geography)) FROM {tabla} "
            f"WHERE origen = 'oficial' AND nombre NOT ILIKE '%%sin nombre%%' GROUP BY nombre ORDER BY 3 DESC")]
        principales = [g for g in grupos if g[2] >= MIN_LARGO_M][:MAX_MICROCUENCAS]
        if not principales:
            raise CommandError(f"Ningún curso con nombre supera {MIN_LARGO_M} m: no se pueden derivar microcuencas.")

        focos = list(m.Foco.objects.only("ubicacion"))
        if focos:
            zona = MultiPoint([f.ubicacion for f in focos], srid=4326).convex_hull.buffer(MARGEN_ZONA)
        else:
            lng0, lat0, lng1, lat1 = settings.GISMAT_BBOX
            zona = GEOSGeometry(f"POLYGON(({lng0 + .2} {lat0 + .1},{lng1 - .2} {lat0 + .1},{lng1 - .2} {lat1 - .1},"
                                f"{lng0 + .2} {lat1 - .1},{lng0 + .2} {lat0 + .1}))")
        zona.srid = 4326
        nombres = [n for n, _, _ in principales]

        # --- microcuencas: zonas de influencia (Voronoi) de los cursos principales ---
        filas = self._consulta(f"""
            WITH pts AS (SELECT nombre AS grupo, (ST_DumpPoints(ST_Segmentize(geom, 0.0015))).geom AS p
                         FROM {tabla} WHERE origen = 'oficial' AND nombre = ANY(%s)),
            zona AS (SELECT ST_GeomFromEWKT(%s) AS g),
            celdas AS (SELECT (ST_Dump(ST_VoronoiPolygons((SELECT ST_Collect(p) FROM pts), 0,
                                                          (SELECT ST_Expand(g, 0.05) FROM zona)))).geom AS celda)
            SELECT pts.grupo, ST_AsGeoJSON(ST_CollectionExtract(ST_Intersection(ST_Union(celdas.celda),
                                                                                (SELECT g FROM zona)), 3))
            FROM celdas JOIN pts ON ST_Contains(celdas.celda, pts.p) GROUP BY pts.grupo""", [nombres, zona.ewkt])
        crudo, ocupado = {}, None
        for grupo in nombres:   # del más largo al más corto: los solapes se los queda el curso más importante
            g = next((GEOSGeometry(js, srid=4326) for gr, js in filas if gr == grupo and js), None)
            if g is None or g.empty:
                continue
            if ocupado is not None:
                g = g.difference(ocupado)
            if not g.empty:
                crudo[grupo] = g
                ocupado = g if ocupado is None else ocupado.union(g)
        cuencas = componer(crudo)

        # --- zonas de riesgo: franjas alrededor de cauces reales ---
        zonas = []
        for tipo_curso, (tipo_zona, nivel, ancho) in FRANJAS.items():
            for nombre, js in self._consulta(
                    f"SELECT nombre, ST_AsGeoJSON(ST_Intersection(ST_Union(ST_Buffer(geom::geography, %s)::geometry), "
                    f"ST_GeomFromEWKT(%s))) FROM {tabla} WHERE origen = 'oficial' AND tipo = %s "
                    f"AND nombre NOT ILIKE '%%sin nombre%%' GROUP BY nombre", [ancho, zona.ewkt, tipo_curso]):
                for parte in partes_poligono(GEOSGeometry(js, srid=4326) if js else None):
                    zonas.append((nombre, tipo_zona, nivel, ancho, tipo_curso, parte))
        zonas = sorted(zonas, key=lambda z: -z[5].area)[:MAX_ZONAS]

        # --- puntos de monitoreo: sobre el trazado real de los cursos principales ---
        puntos = []
        for nombre, tipo_curso in [(n, t) for n, t, _ in principales][:3]:
            fila = self._consulta(
                f"SELECT ST_AsEWKT(ST_LineInterpolatePoint(ST_GeometryN(ST_CollectionExtract(ST_Intersection(geom, "
                f"ST_GeomFromEWKT(%s)), 2), 1), 0.5)) FROM {tabla} WHERE origen = 'oficial' AND nombre = %s "
                f"AND ST_Length(ST_Intersection(geom, ST_GeomFromEWKT(%s))) > 0 "
                f"ORDER BY ST_Length(ST_Intersection(geom, ST_GeomFromEWKT(%s))) DESC LIMIT 1",
                [zona.ewkt, nombre, zona.ewkt, zona.ewkt])
            if fila and fila[0][0]:
                puntos.append((nombre, tipo_curso, GEOSGeometry(fila[0][0], srid=4326)))

        self.stdout.write(f"Cursos principales (por longitud): " + " · ".join(f"{n} {l / 1000:.1f} km" for n, _, l in principales))
        self.stdout.write(f"Microcuencas a generar: {len(cuencas)} · zonas de riesgo: {len(zonas)} · puntos de monitoreo: "
                          f"{len(puntos)} + 1 pluviométrico")
        for g, poly in cuencas.items():
            self.stdout.write(f"   Microcuenca {g}: {self._area_km2(poly):.1f} km2")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))

        demo = _demo()
        rnd = random.Random("gismat-derivadas")
        with transaction.atomic():
            m.Microcuenca.objects.filter(codigo__startswith=PREFIJO).delete()
            m.ZonaRiesgo.objects.filter(codigo__startswith=PREFIJO).delete()
            m.PuntoMonitoreo.objects.filter(codigo__startswith=PREFIJO).delete()
            # capas de ejemplo equivalentes
            m.Microcuenca.objects.filter(origen=m.Origen.SIMULADO).exclude(codigo__startswith=PREFIJO).delete()
            m.ZonaRiesgo.objects.filter(codigo__in=[z["id"] for z in demo["zonas"]]).delete()
            m.PuntoMonitoreo.objects.filter(codigo__in=[p["id"] for p in demo["puntos"]]).delete()

            for i, (grupo, poly) in enumerate(cuencas.items()):
                poly.srid = 4326
                asociados = sorted({n for n in m.CursoAgua.objects.filter(origen=m.Origen.OFICIAL, geom__intersects=poly)
                                    .values_list("nombre", flat=True) if "sin nombre" not in n.lower()})[:12]
                m.Microcuenca.objects.create(
                    codigo=f"{PREFIJO}mc-{slugify(grupo)}"[:50], nombre=f"Microcuenca {grupo}"[:120], color=PALETA[i % len(PALETA)],
                    recomendaciones=(f"Zona de influencia aproximada de {grupo}: cada punto se asigna al curso principal más "
                                     f"cercano. Priorizar la limpieza y el control de residuos en sus márgenes y el "
                                     f"monitoreo de niveles en lluvias intensas. Delimitación simulada, no es una cuenca "
                                     f"hidrológica oficial."),
                    cursos_asociados=asociados, origen=m.Origen.SIMULADO, geom=poly)
            for i, (nombre, tipo_zona, nivel, ancho, tipo_curso, parte) in enumerate(zonas, 1):
                parte.srid = 4326
                m.ZonaRiesgo.objects.create(
                    codigo=f"{PREFIJO}zr-{i:02d}", nombre=f"Franja de {ancho} m - {nombre}"[:150], tipo=tipo_zona, nivel=nivel,
                    descripcion=(f"Franja de {ancho} m a cada lado de {nombre} ({tipo_curso}). Delimitación aproximada "
                                 f"derivada del trazado real del curso; no es un mapa oficial de {tipo_zona.lower()}."),
                    geom=parte)
            for i, (nombre, tipo_curso, pto) in enumerate(puntos, 1):
                es_rio = tipo_curso == "Río Principal"
                valor = f"{rnd.uniform(0.8, 2.6):.2f} m" if es_rio else f"{rnd.uniform(0.4, 5.5):.1f} m3/s"
                m.PuntoMonitoreo.objects.create(
                    codigo=f"{PREFIJO}mon-{i:02d}", nombre=f"{'Estación Hidrométrica' if es_rio else 'Aforo de Caudal'} {nombre}"[:150],
                    tipo=m.PuntoMonitoreo.Tipo.HIDRO if es_rio else m.PuntoMonitoreo.Tipo.AFORO,
                    ultimo_dato=("Cota de nivel simulada" if es_rio else "Caudal simulado") + f": {valor}", valor_medido=valor,
                    operativo=rnd.random() > 0.2, geom=Point(pto.x, pto.y, srid=4326))
            c = zona.centroid
            m.PuntoMonitoreo.objects.create(
                codigo=f"{PREFIJO}mon-pluv", nombre="Sensor Pluviométrico Zona Centro", tipo=m.PuntoMonitoreo.Tipo.PLUVIO,
                ultimo_dato="Precipitación simulada: 0.0 mm/h", valor_medido="0.0 mm/h", operativo=True,
                geom=Point(c.x, c.y, srid=4326))
            self._reasignar()
        sin = m.Foco.objects.filter(microcuenca__isnull=True).count()
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(cuencas)} microcuencas, {len(zonas)} zonas de riesgo y {len(puntos) + 1} puntos de monitoreo "
            f"derivados de los cursos reales. Focos sin microcuenca: {sin}."))

    def revertir(self, aplicar):
        n = (m.Microcuenca.objects.filter(codigo__startswith=PREFIJO).count(), m.ZonaRiesgo.objects.filter(codigo__startswith=PREFIJO).count(),
             m.PuntoMonitoreo.objects.filter(codigo__startswith=PREFIJO).count())
        self.stdout.write(f"A borrar: {n[0]} microcuencas, {n[1]} zonas y {n[2]} puntos derivados; luego se restauran las capas de ejemplo.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        with transaction.atomic():
            m.Microcuenca.objects.filter(codigo__startswith=PREFIJO).delete()
            m.ZonaRiesgo.objects.filter(codigo__startswith=PREFIJO).delete()
            m.PuntoMonitoreo.objects.filter(codigo__startswith=PREFIJO).delete()
        call_command("cargar_capas_ia", "--aplicar", stdout=self.stdout)
        self._reasignar()
        self.stdout.write(self.style.SUCCESS("Capas derivadas eliminadas y capas de ejemplo restauradas."))
