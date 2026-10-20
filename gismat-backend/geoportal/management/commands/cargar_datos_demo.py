"""Carga datos de referencia + los datos de ejemplo del geoportal (tomados de src/data/mockGeoportalData.ts).

    python manage.py cargar_datos_demo [--reset] [--solo-referencia]

Los focos se insertan por el mismo servicio que usa la API, por lo que microcuenca, distancia al curso
de agua, IRH, historial y alertas se calculan en PostGIS/backend (no se copian del mock).
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path

from django.contrib.gis.geos import LineString, Point, Polygon
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.services.focos import recalcular

DATOS = Path(__file__).with_name("datos_demo.json")

TIPOS_RESIDUO = [
    ("mixto", "Residuos sólidos urbanos mixtos", 0.55), ("escombros", "Escombros de construcción y demolición", 0.45),
    ("organico", "Residuos orgánicos y poda", 0.35), ("plasticos", "Plásticos y envases", 0.6),
    ("industrial", "Residuos industriales", 0.9), ("neumaticos", "Neumáticos y residuos especiales", 0.8),
]
CUADRILLAS = [
    ("alfa", "Cuadrilla Alfa – Saneamiento Hidráulico", "Saneamiento hidráulico"),
    ("beta", "Cuadrilla Beta – Desobstrucción Pluvial", "Desobstrucción pluvial"),
    ("gamma", "Cuadrilla Gamma – Residuos Especiales", "Residuos especiales"),
    ("delta", "Cuadrilla Delta (Especial Ribera)", "Riberas"),
    ("verdes1", "Cuadrilla Espacios Verdes - Brigada 01", "Espacios verdes"),
    ("verdes2", "Cuadrilla Espacios Verdes - Brigada 02", "Espacios verdes"),
]
RESIDUO_POR_FOCO = {"BR-001": "escombros", "BR-002": "industrial", "BR-003": "mixto", "MB-004": "plasticos",
                    "VC-005": "neumaticos", "MB-006": "plasticos", "BR-007": "escombros", "MB-008": "mixto",
                    "VC-009": "escombros", "BR-010": "mixto", "MB-011": "organico", "MB-012": "mixto"}
DETECCIONES = [  # AIDetectionItem de src/services/gismatStore.ts
    ("Av. Mate de Luna - Canal Norte", -26.8151, -65.2096, 96, 450, 0, "CANAL NORTE (Cauce)", 45, "4.2% con dirección de escorrentía", "Alta (~320 hab/ha)", 92, 88, 75),
    ("B° Villa Luján - Zona Industrial", -26.8281, -65.2146, 92, 320, -1, "Canal Secundario Oeste", 60, "3.1% hacia colector", "Media (~240 hab/ha)", 85, 80, 68),
    ("Río Salí - Margen Este", -26.8340, -65.1890, 89, 680, -2, "RÍO SALÍ (Lecho Activo)", 20, "1.8% planicie aluvial", "Baja (~95 hab/ha)", 96, 91, 82),
    ("Acceso San Cayetano - Puente", -26.8520, -65.1950, 85, 210, -3, "Canal de Drenaje San Cayetano", 85, "2.5% moderada", "Media (~180 hab/ha)", 78, 74, 55),
]


def permeabilidad(texto):
    t = texto.lower()
    detalle = (re.search(r"\((.*)\)", texto) or [None, ""])[1]
    for prefijo, v in (("media-alta", "media_alta"), ("media-baja", "media_baja"), ("baja a media", "media_baja"),
                       ("alta", "alta"), ("media", "media"), ("baja", "baja")):
        if t.startswith(prefijo):
            return v, detalle
    return "media", detalle


def cerrar(coords):  # [[lat,lng],...] -> anillo cerrado (x=lng, y=lat)
    pts = [(lng, lat) for lat, lng in coords]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def poligono(coords):
    p = Polygon(cerrar(coords), srid=4326)
    return p if p.valid else p.buffer(0)  # corrige auto-intersecciones del dato de ejemplo


class Command(BaseCommand):
    help = "Carga datos de referencia y de ejemplo."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Borra focos, capas y alertas antes de cargar.")
        parser.add_argument("--solo-referencia", action="store_true", help="Solo tipos de residuo y cuadrillas.")

    @transaction.atomic
    def handle(self, *a, reset=False, solo_referencia=False, **kw):
        if reset:
            for mod in (m.Alerta, m.Intervencion, m.HistorialIRH, m.DeteccionIA, m.Foco, m.CursoAgua, m.Microcuenca,
                        m.ZonaRiesgo, m.PuntoMonitoreo, m.Barrio):
                mod.objects.all().delete()
        for cod, nom, f in TIPOS_RESIDUO:
            m.TipoResiduo.objects.update_or_create(codigo=cod, defaults={"nombre": nom, "factor_peligrosidad": f})
        for cod, nom, esp in CUADRILLAS:
            m.Cuadrilla.objects.update_or_create(codigo=cod, defaults={"nombre": nom, "especialidad": esp})
        if solo_referencia:
            return self.stdout.write("Datos de referencia cargados.")

        d = json.loads(DATOS.read_text(encoding="utf-8"))
        for c in d["cursos"]:
            m.CursoAgua.objects.update_or_create(codigo=c["id"], defaults=dict(
                nombre=c["nombre"], tipo=c["tipo"], estado_conservacion=c["estadoConservacion"],
                buffer_metros=c["bufferMetros"], geom=LineString([(lng, lat) for lat, lng in c["coordenadas"]], srid=4326)))
        for c in d["microcuencas"]:
            m.Microcuenca.objects.update_or_create(codigo=c["id"], defaults=dict(
                nombre=c["nombre"], color=c["color"], recomendaciones=c["recomendaciones"],
                cursos_asociados=c["cursosAsociados"], geom=poligono(c["coordenadas"])))
        for c in d["zonas"]:
            m.ZonaRiesgo.objects.update_or_create(codigo=c["id"], defaults=dict(
                nombre=c["nombre"], tipo=c["tipo"], nivel=c["nivel"], descripcion=c["descripcion"], geom=poligono(c["coordenadas"])))
        for c in d["puntos"]:
            lat, lng = c["coordenadas"]
            m.PuntoMonitoreo.objects.update_or_create(codigo=c["id"], defaults=dict(
                nombre=c["nombre"], tipo=c["tipo"], ultimo_dato=c["ultimoDato"], valor_medido=c["valorMedido"],
                operativo=c["estado"] == "Operativo", geom=Point(lng, lat, srid=4326)))
        for c in d["barrios"]:
            m.Barrio.objects.update_or_create(codigo=c["id"], defaults=dict(
                nombre=c["nombre"], habitantes_aprox=c["habitantesAprox"], geom=poligono(c["coordenadas"])))

        hoy = timezone.localdate()
        for f in sorted(d["focos"], key=lambda x: x["id"][3:]):
            if m.Foco.objects.filter(codigo=f["id"]).exists():
                continue
            perm, detalle = permeabilidad(f["permeabilidadSuelo"])
            lat, lng = f["coordenadas"]
            foco = m.Foco(
                tipo=f["tipo"], estado=f["estado"], direccion=f["ubicacion"], barrio=f["barrio"],
                ubicacion=Point(lng, lat, srid=4326), volumen_m3=f["volumenM3"], superficie_m2=f["superficieM2"],
                permeabilidad=perm, permeabilidad_detalle=detalle, observaciones=f["observaciones"],
                proxima_accion=f["proximaAccionRecomendada"],
                tipo_residuo=m.TipoResiduo.objects.get(codigo=RESIDUO_POR_FOCO[f["id"]]),
                fecha_registro=date.fromisoformat(f["fechaRegistro"]))
            foco.codigo = f["id"]
            recalcular(foco, motivo="alta")
            ui = f.get("ultimaIntervencion")
            if ui:
                m.Intervencion.objects.create(
                    foco=foco, fecha=ui["fecha"], tipo="Intervención de saneamiento", observaciones=ui["descripcion"],
                    cuadrilla_texto=ui["cuadrilla"], volumen_removido_ton=ui.get("volumenRemovidoTon", 0),
                    estado="completada", irh_despues=foco.irh)
        for dd, (dir_, lat, lng, conf, area, off, cauce, dist, pend, dens, vh, esc, rp) in enumerate(DETECCIONES):
            if not m.DeteccionIA.objects.filter(direccion=dir_).exists():
                m.DeteccionIA.objects.create(
                    direccion=dir_, ubicacion=Point(lng, lat, srid=4326), confianza=conf, area_m2=area,
                    fecha=hoy + timedelta(days=off), cauce=cauce, distancia_curso_m=dist, pendiente=pend, densidad=dens,
                    vulnerabilidad_hidrica=vh, escurrimiento=esc, residuos_peligrosos=rp)
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {m.Foco.objects.count()} focos, {m.Alerta.objects.count()} alertas, "
            f"{m.HistorialIRH.objects.count()} cálculos de IRH."))
