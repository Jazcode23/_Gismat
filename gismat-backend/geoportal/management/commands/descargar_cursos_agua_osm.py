"""Descarga los cursos de agua REALES de San Miguel de Tucumán desde OpenStreetMap y genera un GeoJSON.

    python manage.py descargar_cursos_agua_osm                      # descarga y escribe data/hidrografia_smt_osm.geojson
    python manage.py descargar_cursos_agua_osm --margen 0.05        # amplía la zona (grados; 0.01 ~ 1 km)
    python manage.py descargar_cursos_agua_osm --bbox -26.93,-65.30,-26.74,-65.12     # sur,oeste,norte,este
    python manage.py descargar_cursos_agua_osm --archivo overpass.json                # usa un JSON ya descargado

NO escribe en la base de datos: solo lee la extensión de los focos y escribe archivos en la carpeta data/.
Para cargarlo (reemplaza los cursos existentes; los focos se recalculan después):
    python manage.py importar_capa cursos-agua data/hidrografia_smt_osm.geojson --reemplazar --origen oficial

Trae todos los waterway=river|stream|canal|drain|ditch de la zona (ríos, arroyos, canales, desagües y zanjas),
con su trazado verdadero y su nombre si OpenStreetMap lo tiene. No inventa ni modifica geometrías.
Datos (c) colaboradores de OpenStreetMap, licencia ODbL. El tipo y el buffer se asignan según la clase de curso
(río 120 m, canal/arroyo 50 m, zanja/desagüe 25 m: los mismos valores de referencia que usa el proyecto);
el estado de conservación queda en "Regular" porque OpenStreetMap no lo informa.
"""
import json
import math
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from django.conf import settings
from django.contrib.gis.db.models import Extent
from django.core.management.base import BaseCommand, CommandError

from geoportal import models as m

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
             "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
# waterway -> (tipo del sistema, buffer en metros, etiqueta para los tramos sin nombre)
TIPOS = {"river": ("Río Principal", 120, "Río"), "canal": ("Canal Troncal Pluvial", 50, "Canal"),
         "stream": ("Arroyo", 50, "Arroyo"), "drain": ("Zanja Colectora", 25, "Desagüe"),
         "ditch": ("Zanja Colectora", 25, "Zanja")}


# ---------- lógica pura (sin red ni base de datos) ----------
def consulta(sur, oeste, norte, este):
    filtro = '"waterway"~"^(river|stream|canal|drain|ditch)$"'
    return f"[out:json][timeout:120];(way[{filtro}]({sur},{oeste},{norte},{este}););out tags geom;"


def largo_km(coords):
    """Longitud (km) de una línea [[lng, lat], ...] por haversine."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        p1, p2 = math.radians(y1), math.radians(y2)
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(x2 - x1) / 2) ** 2
        total += 6371.0088 * 2 * math.asin(math.sqrt(a))
    return total


def a_geojson(elementos):
    """Elementos 'way' de Overpass (con geometry) -> FeatureCollection compatible con importar_capa."""
    feats = []
    for e in elementos:
        tags = e.get("tags", {})
        if e.get("type") != "way" or tags.get("waterway") not in TIPOS:
            continue
        coords = [[round(p["lon"], 7), round(p["lat"], 7)] for p in e.get("geometry", [])]
        if len(coords) < 2:
            continue
        tipo, buffer_m, etiqueta = TIPOS[tags["waterway"]]
        nombre = (tags.get("name") or tags.get("name:es") or f"{etiqueta} sin nombre")[:120]
        osm_id = e["id"]
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "codigo": f"osm-{osm_id}", "nombre": nombre, "tipo": tipo, "estado_conservacion": "Regular",
                "buffer_metros": buffer_m, "fuente": "OpenStreetMap (ODbL)", "osm_id": osm_id,
                "waterway": tags["waterway"],
                "subterraneo": tags.get("tunnel") in ("culvert", "yes", "building_passage"),
            },
        })
    return {"type": "FeatureCollection", "features": feats}


def resumen(fc):
    """[(nombre, tipo, tramos, km)] ordenado por longitud descendente."""
    acc = {}
    for f in fc["features"]:
        p = f["properties"]
        clave = (p["nombre"], p["tipo"])
        tramos, km = acc.get(clave, (0, 0.0))
        acc[clave] = (tramos + 1, km + largo_km(f["geometry"]["coordinates"]))
    return sorted(((n, t, tr, km) for (n, t), (tr, km) in acc.items()), key=lambda r: -r[3])
# ---------- fin lógica pura ----------


class Command(BaseCommand):
    help = "Descarga cursos de agua reales de OpenStreetMap y genera data/hidrografia_smt_osm.geojson (no escribe en la base)."

    def add_arguments(self, p):
        p.add_argument("--margen", type=float, default=0.03, help="Margen en grados alrededor de los focos (def. 0.03 ~ 3 km).")
        p.add_argument("--bbox", help="sur,oeste,norte,este (anula el cálculo automático).")
        p.add_argument("--archivo", help="Usa un JSON de Overpass ya descargado en lugar de consultar la red.")
        p.add_argument("--salida", help="Ruta del GeoJSON de salida.")

    def handle(self, *a, margen, bbox, archivo, salida, **kw):
        datos = Path(settings.BASE_DIR) / "data"
        datos.mkdir(exist_ok=True)
        if archivo:
            raw = json.loads(Path(archivo).read_text(encoding="utf-8"))
        else:
            if bbox:
                sur, oeste, norte, este = [float(x) for x in bbox.split(",")]
            else:
                ext = m.Foco.objects.aggregate(e=Extent("ubicacion"))["e"]
                if ext:
                    oeste, sur, este, norte = ext[0] - margen, ext[1] - margen, ext[2] + margen, ext[3] + margen
                else:
                    oeste, sur, este, norte = settings.GISMAT_BBOX
            sur, oeste, norte, este = (round(v, 5) for v in (sur, oeste, norte, este))
            self.stdout.write(f"Zona: sur={sur} oeste={oeste} norte={norte} este={este}")
            raw = self.descargar(consulta(sur, oeste, norte, este))
            (datos / "osm_cursos_agua_raw.json").write_text(json.dumps(raw), encoding="utf-8")
        fc = a_geojson(raw.get("elements", []))
        if not fc["features"]:
            raise CommandError("OpenStreetMap no devolvió cursos de agua para esa zona. Probá con --margen mayor.")
        out = Path(salida) if salida else datos / "hidrografia_smt_osm.geojson"
        out.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
        filas = resumen(fc)
        total = sum(r[3] for r in filas)
        self.stdout.write(self.style.SUCCESS(f"{len(fc['features'])} tramos reales, {total:.1f} km, guardados en {out}"))
        self.stdout.write("Cursos con nombre (mayor longitud primero):")
        for n, t, tr, km in [r for r in filas if "sin nombre" not in r[0]][:25]:
            self.stdout.write(f"   {n} [{t}]: {tr} tramos, {km:.1f} km")
        sn = [r for r in filas if "sin nombre" in r[0]]
        if sn:
            self.stdout.write(f"   Sin nombre en OpenStreetMap: {sum(r[2] for r in sn)} tramos, {sum(r[3] for r in sn):.1f} km")

    def descargar(self, q):
        cuerpo = urllib.parse.urlencode({"data": q}).encode()
        errores = []
        for url in ENDPOINTS:
            self.stdout.write(f"Consultando {url} ...")
            try:
                req = urllib.request.Request(url, data=cuerpo, headers={"User-Agent": "GISMAT/1.0 (geoportal municipal)"})
                with urllib.request.urlopen(req, timeout=150) as r:
                    return json.loads(r.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as ex:
                errores.append(f"{url}: {ex}")
                self.stdout.write(self.style.WARNING(f"   falló: {ex}"))
        raise CommandError(
            "No se pudo descargar de OpenStreetMap (revisá la conexión a internet o el firewall).\n  "
            + "\n  ".join(errores)
            + "\nAlternativa manual: abrí https://overpass-turbo.eu , pegá esta consulta, ejecutá, exportá "
              "'datos sin procesar' como JSON y usá --archivo:\n" + q)
