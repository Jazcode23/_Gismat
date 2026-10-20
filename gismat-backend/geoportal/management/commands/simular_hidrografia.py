"""Genera y carga una hidrografía y unas microcuencas SIMULADAS para San Miguel de Tucumán.

    python manage.py simular_hidrografia [--solo-archivos] [--semilla 2026]

Sirve para probar el sistema completo (IRH, microcuencas, alertas) mientras no se tengan las capas oficiales.
NO es cartografía real: los trazados son aproximados y sinuosos, y las microcuencas se obtienen como zonas de
influencia (diagrama de Voronoi sobre PostGIS) de cada curso. Todo queda marcado con origen='simulado'
(visible en la API como `origen`). Para pasar a datos oficiales:
    python manage.py importar_capa cursos-agua hidrografia.geojson --reemplazar
    python manage.py importar_capa microcuencas cuencas.geojson   --reemplazar
    python manage.py recalcular_irh
Es determinista: la misma semilla produce siempre los mismos trazados.
"""
import json
import math
import random
from pathlib import Path

from django.conf import settings
from django.contrib.gis.geos import GEOSGeometry, MultiPoint, Point, Polygon
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection

from geoportal import models as m

SALIDA = Path(settings.BASE_DIR) / "data" / "simulado"

# (lat, lng) de paso aproximados. Mismos códigos/nombres que usa el frontend.
CURSOS = [
    {"codigo": "curso_rio_sali", "nombre": "Río Salí (Cauce Principal Troncal)", "tipo": "Río Principal",
     "estado_conservacion": "Crítico", "buffer_metros": 120, "amp": 0.0022,
     "ruta": [(-26.765, -65.158), (-26.800, -65.150), (-26.835, -65.152), (-26.870, -65.143), (-26.905, -65.148)]},
    {"codigo": "curso_canal_norte", "nombre": "Canal Norte (Desagüe Pluvial Maestro)", "tipo": "Canal Troncal Pluvial",
     "estado_conservacion": "Crítico", "buffer_metros": 50, "amp": 0.0008,
     "ruta": [(-26.800, -65.285), (-26.805, -65.245), (-26.806, -65.205), (-26.809, -65.175), (-26.806, -65.153)]},
    {"codigo": "curso_canal_sur", "nombre": "Canal Sur (Desagüe Colector Sur)", "tipo": "Canal Troncal Pluvial",
     "estado_conservacion": "Regular", "buffer_metros": 50, "amp": 0.0008,
     "ruta": [(-26.880, -65.285), (-26.876, -65.245), (-26.874, -65.205), (-26.872, -65.175), (-26.871, -65.145)]},
    {"codigo": "curso_arroyo_medina", "nombre": "Arroyo Medina (Aliviador Noroeste)", "tipo": "Arroyo",
     "estado_conservacion": "Crítico", "buffer_metros": 35, "amp": 0.0012,
     "ruta": [(-26.770, -65.282), (-26.800, -65.262), (-26.828, -65.236), (-26.850, -65.214), (-26.872, -65.200)]},
]
# Colectores secundarios: desaguan en un curso principal (`padre`) y pertenecen a su microcuenca.
# Los tres primeros figuran como "cursos asociados" en los datos del frontend; el cuarto es genérico.
SECUNDARIOS = [
    {"codigo": "curso_aliviador_siria", "nombre": "Aliviador Av. Siria", "padre": "curso_canal_norte",
     "ruta": [(-26.772, -65.218), (-26.790, -65.214), (-26.806, -65.207)]},
    {"codigo": "curso_desague_9_julio", "nombre": "Desagüe Pluvial Parque 9 de Julio", "padre": "curso_rio_sali",
     "ruta": [(-26.840, -65.222), (-26.836, -65.190), (-26.833, -65.154)]},
    {"codigo": "curso_colector_jujuy", "nombre": "Colector Jujuy", "padre": "curso_canal_sur",
     "ruta": [(-26.832, -65.236), (-26.852, -65.232), (-26.874, -65.227)]},
    {"codigo": "curso_colector_central_este", "nombre": "Colector Central Este", "padre": "curso_canal_sur",
     "ruta": [(-26.815, -65.190), (-26.842, -65.184), (-26.872, -65.179)]},
]
for _s in SECUNDARIOS:
    _s.update(tipo="Zanja Colectora", estado_conservacion="Regular", buffer_metros=25, amp=0.0006)
CUENCA_DE = {"curso_rio_sali": "mc_rio_sali_oeste", "curso_canal_norte": "mc_canal_norte",
             "curso_canal_sur": "mc_canal_sur", "curso_arroyo_medina": "mc_arroyo_medina"}


def trazado(ruta, amp, rng, paso=0.0035):
    """Densifica la ruta y le suma sinuosidad (caminata aleatoria suavizada, perpendicular al sentido del curso)."""
    pts = []
    for (la1, lo1), (la2, lo2) in zip(ruta, ruta[1:]):
        n = max(2, int(math.hypot(la2 - la1, lo2 - lo1) / paso))
        for i in range(n):
            t = i / n
            pts.append((la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t))
    pts.append(ruta[-1])
    off, sal = 0.0, []
    for i, (la, lo) in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[1] - a[1], b[0] - a[0]
        norma = math.hypot(dx, dy) or 1
        off = 0.7 * off + rng.uniform(-amp, amp)  # suavizado: meandros, no ruido
        extremos = 0 if i in (0, len(pts) - 1) else 1
        sal.append((la + (dx / norma) * off * extremos, lo - (dy / norma) * off * extremos))
    return sal


class Command(BaseCommand):
    help = "Carga hidrografía y microcuencas simuladas (origen='simulado')."

    def add_arguments(self, p):
        p.add_argument("--solo-archivos", action="store_true", help="Solo escribe los GeoJSON en data/simulado/.")
        p.add_argument("--semilla", type=int, default=2026)
        p.add_argument("--salida", default=str(SALIDA), help="Carpeta donde se escriben los GeoJSON generados.")

    def handle(self, *a, solo_archivos=False, semilla=2026, salida=str(SALIDA), **kw):
        rng = random.Random(semilla)
        carpeta = Path(salida)
        carpeta.mkdir(parents=True, exist_ok=True)

        feats, trazas = [], {}
        for c in CURSOS + SECUNDARIOS:
            pts = trazado(c["ruta"], c["amp"], rng)
            if "padre" in c:  # el colector desemboca a ~30 m de un vértice del curso principal (sin superponerse)
                fin = pts[-1]
                v = min(trazas[c["padre"]], key=lambda q: (q[0] - fin[0]) ** 2 + (q[1] - fin[1]) ** 2)
                pts[-1] = (v[0] + 0.0003, v[1])
            trazas[c["codigo"]] = pts
            props = {k: c[k] for k in ("codigo", "nombre", "tipo", "estado_conservacion", "buffer_metros")}
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "LineString", "coordinates": [[round(lo, 6), round(la, 6)] for la, lo in pts]}})
        ruta_cursos = carpeta / "cursos_agua.geojson"
        ruta_cursos.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
        self.stdout.write(f"Cursos simulados: {len(feats)} ({len(SECUNDARIOS)} colectores secundarios) → {ruta_cursos}")
        if solo_archivos:
            return

        call_command("importar_capa", "cursos-agua", str(ruta_cursos), "--reemplazar", "--origen", "simulado",
                     stdout=self.stdout)

        # Zona de estudio: envolvente de los focos cargados y de toda la red simulada, con un margen de ~400 m
        # (así cada curso queda dentro de su propia microcuenca).
        puntos = [f.ubicacion for f in m.Foco.objects.only("ubicacion")]
        for pts in trazas.values():
            puntos += [Point(lo, la, srid=4326) for la, lo in pts]
        if m.Foco.objects.exists():
            zona = MultiPoint(puntos, srid=4326).convex_hull.buffer(0.004)
        else:
            lng_min, lat_min, lng_max, lat_max = settings.GISMAT_BBOX
            zona = Polygon.from_bbox((lng_min + 0.2, lat_min + 0.1, lng_max - 0.2, lat_max - 0.1))
        zona.srid = 4326

        tabla = m.CursoAgua._meta.db_table
        sql = f"""
        WITH pts AS (
            SELECT codigo, (ST_DumpPoints(ST_Segmentize(geom, 0.0015))).geom AS p FROM {tabla} WHERE origen = 'simulado'),
        zona AS (SELECT ST_GeomFromEWKT(%s) AS g),
        celdas AS (SELECT (ST_Dump(ST_VoronoiPolygons((SELECT ST_Collect(p) FROM pts), 0, (SELECT g FROM zona)))).geom AS celda)
        SELECT pts.codigo,
               ST_AsGeoJSON(ST_CollectionExtract(ST_Intersection(ST_Union(celdas.celda), (SELECT g FROM zona)), 3))
        FROM celdas JOIN pts ON ST_Contains(celdas.celda, pts.p)
        GROUP BY pts.codigo ORDER BY pts.codigo"""
        with connection.cursor() as cur:
            cur.execute(sql, [zona.ewkt])
            filas = cur.fetchall()

        ref = {c["id"]: c for c in json.loads((Path(__file__).with_name("datos_demo.json")).read_text(encoding="utf-8"))["microcuencas"]}
        padre = {sec["codigo"]: sec["padre"] for sec in SECUNDARIOS}
        por_cuenca = {}
        for codigo_curso, geojson in filas:
            mc_cod = CUENCA_DE[padre.get(codigo_curso, codigo_curso)]
            g = GEOSGeometry(geojson, srid=4326)
            por_cuenca[mc_cod] = por_cuenca[mc_cod].union(g) if mc_cod in por_cuenca else g
        # Las celdas de un colector pueden quedar separadas de su cuenca: el modelo guarda un único polígono por
        # cuenca, así que cada trozo suelto se anexa a la cuenca vecina con la que comparte más borde (sin dejar huecos).
        principales, sueltos = {}, []
        for mc_cod, g in por_cuenca.items():
            partes = sorted(g, key=lambda x: -x.area) if g.geom_type == "MultiPolygon" else [g]
            principales[mc_cod] = partes[0]
            sueltos += partes[1:]
        for _ in range(4):
            pendientes = []
            for parte in sueltos:
                borde = {k: v.buffer(1e-7).intersection(parte.boundary).length for k, v in principales.items()}
                mejor = max(borde, key=borde.get)
                if borde[mejor] > 0:
                    principales[mejor] = principales[mejor].union(parte)
                else:
                    pendientes.append(parte)
            sueltos = pendientes
            if not sueltos:
                break
        feats = []
        for mc_cod, g in principales.items():
            if g.geom_type != "Polygon":
                self.stdout.write(self.style.WARNING(f"{mc_cod}: la cuenca resultó {g.geom_type}; se conserva la parte mayor."))
            ref_mc = ref[mc_cod]
            feats.append({"type": "Feature", "geometry": json.loads(g.geojson), "properties": {
                "codigo": ref_mc["id"], "nombre": ref_mc["nombre"], "color": ref_mc["color"],
                "recomendaciones": ref_mc["recomendaciones"], "cursos_asociados": ref_mc["cursosAsociados"]}})
        ruta_mc = carpeta / "microcuencas.geojson"
        ruta_mc.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
        self.stdout.write(f"Microcuencas simuladas: {len(feats)} → {ruta_mc}")
        call_command("importar_capa", "microcuencas", str(ruta_mc), "--reemplazar", "--origen", "simulado", stdout=self.stdout)

        # Con las capas nuevas se recalcula microcuenca, distancia al curso e IRH de cada foco
        call_command("recalcular_irh", stdout=self.stdout)
        self.stdout.write(self.style.WARNING("RECORDATORIO: capas SIMULADAS (origen='simulado'); no usar como cartografía oficial."))
