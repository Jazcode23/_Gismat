"""Importa basurales desde el CSV de relevamiento municipal (separador ; o , · coma decimal · UTF-8 con/sin BOM).

    python manage.py importar_basurales_csv datasetbasurales.csv            # DRY-RUN (por defecto): valida y informa, no escribe
    python manage.py importar_basurales_csv datasetbasurales.csv --aplicar  # inserta los focos que falten

Columnas: ID_basural | Direccion | Estado | Latitud | Longitud. Mismas reglas de validación que importar_basurales_xlsx.
Seguro: NO borra nada, es idempotente (código BR-<ID>; los existentes no se tocan) y corre en una sola transacción.
La planilla no trae volumen, permeabilidad ni tipo de residuo: quedan "pendientes de relevar" (IRH provisorio).
"""
import csv
import unicodedata

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from geoportal import models as m
from geoportal.services.focos import recalcular

ALIAS = {"id": "id", "id_basural": "id", "direccion": "direccion", "estado": "estado",
         "latitud": "lat", "lat": "lat", "longitud": "lng", "lng": "lng", "lon": "lng"}
ESTADOS = {"activo": "activo", "pendiente": "pendiente", "limpiado": "limpiado", "inactivo": "inactivo"}


def norm(t):
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().strip().lower()
    return t.replace(" ", "_")


def numero(v):
    try:
        return float(str(v).strip().replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None


def leer_csv(archivo, bbox):
    """Devuelve (validas, excluidas). Función pura: no toca la base."""
    with open(archivo, newline="", encoding="utf-8-sig") as fh:
        muestra = fh.readline()
        fh.seek(0)
        sep = ";" if muestra.count(";") >= muestra.count(",") else ","
        lector = csv.reader(fh, delimiter=sep)
        enc = {ALIAS[norm(h)]: i for i, h in enumerate(next(lector)) if norm(h) in ALIAS}
        faltan = {"id", "direccion", "estado", "lat", "lng"} - set(enc)
        if faltan:
            raise CommandError(f"Faltan columnas: {sorted(faltan)}")
        lng_min, lat_min, lng_max, lat_max = bbox
        validas, excluidas, vistas = [], [], {}
        for fila in lector:
            if not any(c.strip() for c in fila):
                continue
            g = lambda k: fila[enc[k]].strip() if enc[k] < len(fila) else ""
            rid, direccion = g("id"), g("direccion")
            estado = ESTADOS.get(norm(g("estado")))
            lat, lng = numero(g("lat")), numero(g("lng"))
            motivo = None
            if not rid.isdigit():
                motivo = "sin ID válido"
            elif not direccion:
                motivo = "sin dirección"
            elif estado is None:
                motivo = f"estado no reconocido: {g('estado')!r}"
            elif lat is None or lng is None:
                motivo = "sin coordenadas"
            elif not (lat_min <= lat <= lat_max and lng_min <= lng <= lng_max):
                motivo = "coordenadas fuera de San Miguel de Tucumán"
            if motivo:
                excluidas.append((rid, direccion, motivo))
                continue
            clave = (round(lat, 6), round(lng, 6))
            repetido = vistas.get(clave)
            vistas.setdefault(clave, int(rid))
            validas.append((int(rid), direccion[:200], estado, lat, lng, repetido))
    return validas, excluidas


class Command(BaseCommand):
    help = "Importa basurales desde un CSV (dry-run por defecto; no borra nada; idempotente)."

    def add_arguments(self, p):
        p.add_argument("archivo")
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")

    def handle(self, *a, archivo, aplicar, **kw):
        validas, excluidas = leer_csv(archivo, settings.GISMAT_BBOX)
        existentes_bd = set(m.Foco.objects.filter(codigo__startswith="BR-").values_list("codigo", flat=True))
        faltan = [v for v in validas if f"BR-{v[0]:03d}" not in existentes_bd]
        self.stdout.write(f"Filas completas: {len(validas)} · excluidas: {len(excluidas)} · "
                          f"ya en la base: {len(validas) - len(faltan)} · a insertar: {len(faltan)}")
        for rid, d, mt in excluidas:
            self.stdout.write(f"   - excluida ID {rid}: {mt}")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        with transaction.atomic():
            for rid, direccion, estado, lat, lng, repetido in faltan:
                obs = (f"Importado de la planilla de relevamiento (ID {rid}). Volumen, permeabilidad y tipo de residuo "
                       f"sin relevar: IRH provisorio.")
                if repetido:
                    obs += (f" ATENCIÓN: coordenadas idénticas al ID {repetido} con otra dirección; "
                            f"verificar la ubicación en campo.")
                foco = m.Foco(tipo=m.Foco.Tipo.BASURAL, estado=estado, direccion=direccion,
                              ubicacion=Point(lng, lat, srid=4326), observaciones=obs,
                              datos_pendientes=["volumen", "permeabilidad", "tipo_residuo"])
                foco.codigo = f"BR-{rid:03d}"
                recalcular(foco, motivo="migracion")
        self.stdout.write(self.style.SUCCESS(f"Importados {len(faltan)} focos nuevos."))
