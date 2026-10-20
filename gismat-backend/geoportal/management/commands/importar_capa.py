"""Importa capas oficiales desde GeoJSON (hidrografía, microcuencas, etc.) o focos históricos.

    python manage.py importar_capa cursos-agua  hidrografia.geojson  [--reemplazar]
    python manage.py importar_capa microcuencas cuencas.geojson
    python manage.py importar_capa focos        historico.geojson     (migración de datos históricos)

Propiedades esperadas (properties): codigo, nombre, tipo, ... según la capa. Reproyectar a EPSG:4326 antes.
Cada foco importado pasa por el mismo servicio de IRH y deja su primer registro en el historial.
"""
import json

from django.contrib.gis.geos import GEOSGeometry, LineString, MultiLineString, MultiPolygon, Point, Polygon
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from geoportal import models as m
from geoportal.services.focos import recalcular


def _geom(feature, tipo):
    g = GEOSGeometry(json.dumps(feature["geometry"]), srid=4326)
    if tipo is LineString and isinstance(g, MultiLineString):
        g = g.merged() if g.merged().geom_type == "LineString" else g[0]
    if tipo is Polygon and isinstance(g, MultiPolygon):
        g = max(g, key=lambda p: p.area)
    if not isinstance(g, tipo):
        raise CommandError(f"Geometría {g.geom_type} no válida para esta capa")
    return g if g.valid else g.buffer(0)


class Command(BaseCommand):
    help = "Importa una capa desde GeoJSON."

    def add_arguments(self, p):
        p.add_argument("capa", choices=["cursos-agua", "microcuencas", "zonas-riesgo", "barrios", "focos"])
        p.add_argument("archivo")
        p.add_argument("--reemplazar", action="store_true", help="Borra la capa antes de importar (no aplica a focos).")
        p.add_argument("--origen", choices=["oficial", "simulado"], default="oficial",
                       help="Procedencia de la capa (cursos-agua y microcuencas). 'simulado' = datos de prueba.")

    @transaction.atomic
    def handle(self, *a, capa, archivo, reemplazar=False, origen="oficial", **kw):
        with open(archivo, encoding="utf-8") as fh:
            feats = json.load(fh)["features"]
        n = 0
        if capa == "cursos-agua":
            if reemplazar:
                m.CursoAgua.objects.all().delete()
            for f in feats:
                p = f["properties"]
                m.CursoAgua.objects.update_or_create(codigo=p.get("codigo") or slugify(p["nombre"]), defaults=dict(
                    nombre=p["nombre"], tipo=p.get("tipo", "Arroyo"), estado_conservacion=p.get("estado_conservacion", "Regular"),
                    buffer_metros=p.get("buffer_metros", 50), origen=origen, geom=_geom(f, LineString)))
                n += 1
        elif capa == "microcuencas":
            if reemplazar:
                m.Microcuenca.objects.all().delete()
            for f in feats:
                p = f["properties"]
                m.Microcuenca.objects.update_or_create(codigo=p.get("codigo") or slugify(p["nombre"]), defaults=dict(
                    nombre=p["nombre"], color=p.get("color", "#0d9488"), recomendaciones=p.get("recomendaciones", ""),
                    cursos_asociados=p.get("cursos_asociados", []), origen=origen, geom=_geom(f, Polygon)))
                n += 1
        elif capa == "zonas-riesgo":
            if reemplazar:
                m.ZonaRiesgo.objects.all().delete()
            for f in feats:
                p = f["properties"]
                m.ZonaRiesgo.objects.update_or_create(codigo=p.get("codigo") or slugify(p["nombre"]), defaults=dict(
                    nombre=p["nombre"], tipo=p.get("tipo", "Inundabilidad Aluvial"), nivel=p.get("nivel", "Alto"),
                    descripcion=p.get("descripcion", ""), geom=_geom(f, Polygon)))
                n += 1
        elif capa == "barrios":
            if reemplazar:
                m.Barrio.objects.all().delete()
            for f in feats:
                p = f["properties"]
                m.Barrio.objects.update_or_create(codigo=p.get("codigo") or slugify(p["nombre"]), defaults=dict(
                    nombre=p["nombre"], habitantes_aprox=p.get("habitantes_aprox", 0), geom=_geom(f, Polygon)))
                n += 1
        else:  # focos históricos
            for f in feats:
                p = f["properties"]
                tr = m.TipoResiduo.objects.filter(codigo=p.get("tipo_residuo")).first()
                foco = m.Foco(
                    tipo=p.get("tipo", "basural"), estado=p.get("estado", "activo"), direccion=p.get("direccion", "S/D"),
                    barrio=p.get("barrio", ""), ubicacion=_geom(f, Point), volumen_m3=float(p.get("volumen_m3", 0)),
                    superficie_m2=float(p.get("superficie_m2", 0)), permeabilidad=p.get("permeabilidad", "media"),
                    observaciones=p.get("observaciones", ""), tipo_residuo=tr)
                if p.get("fecha_registro"):
                    foco.fecha_registro = p["fecha_registro"]
                foco.full_clean(exclude=["codigo", "ubicacion"])
                recalcular(foco, motivo="migracion")
                n += 1
        self.stdout.write(self.style.SUCCESS(f"{n} registros importados en '{capa}'."))
