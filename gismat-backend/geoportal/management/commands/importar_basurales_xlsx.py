"""Importa focos desde una planilla (xlsx) de relevamiento municipal.

    python manage.py importar_basurales_xlsx data/dataset_basurales.xlsx [--dry-run] [--vaciar]
                                             [--reporte-excluidos excluidos.csv]

Columnas reconocidas (sin distinguir mayúsculas ni tildes): ID_basural | Direccion | Estado | Latitud | Longitud.
Solo se importan las filas COMPLETAS (dirección, estado válido y coordenadas numéricas dentro del área de Tucumán).
El resto se informa con el motivo. La planilla no trae volumen, permeabilidad ni tipo de residuo: esos datos quedan
"pendientes de relevar" y el IRH se calcula solo con las variables conocidas (provisorio).
Es idempotente: el código del foco es BR-<ID> y los ya existentes no se tocan.
"""
import csv
import unicodedata

import openpyxl
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
        return float(str(v).replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None


class Command(BaseCommand):
    help = "Importa basurales desde una planilla xlsx (solo filas completas)."

    def add_arguments(self, p):
        p.add_argument("archivo")
        p.add_argument("--hoja", default=None)
        p.add_argument("--dry-run", action="store_true", help="Valida y informa sin escribir en la base.")
        p.add_argument("--vaciar", action="store_true", help="Antes de importar, BORRA todos los focos (y su historial).")
        p.add_argument("--reporte-excluidos", help="Ruta de un CSV con las filas descartadas y el motivo.")

    def handle(self, *a, archivo, hoja, dry_run, vaciar, reporte_excluidos, **kw):
        wb = openpyxl.load_workbook(archivo, data_only=True, read_only=True)
        ws = wb[hoja] if hoja else wb.worksheets[0]
        filas = ws.iter_rows(values_only=True)
        enc = {ALIAS[norm(h)]: i for i, h in enumerate(next(filas)) if norm(h) in ALIAS}
        faltan = {"id", "direccion", "estado", "lat", "lng"} - set(enc)
        if faltan:
            raise CommandError(f"Faltan columnas: {sorted(faltan)}")

        lng_min, lat_min, lng_max, lat_max = settings.GISMAT_BBOX
        validas, excluidas, vistas = [], [], {}
        for fila in filas:
            if all(c is None for c in fila):
                continue
            rid = fila[enc["id"]]
            direccion = (str(fila[enc["direccion"]] or "")).strip()
            estado = ESTADOS.get(norm(fila[enc["estado"]]))
            lat, lng = numero(fila[enc["lat"]]), numero(fila[enc["lng"]])
            motivo = None
            if rid in (None, ""):
                motivo = "sin ID"
            elif not direccion:
                motivo = "sin dirección"
            elif estado is None:
                motivo = f"estado no reconocido: {fila[enc['estado']]!r}"
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

        self.stdout.write(f"Filas completas: {len(validas)} · excluidas: {len(excluidas)}")
        motivos = {}
        for _, _, mt in excluidas:
            motivos[mt] = motivos.get(mt, 0) + 1
        for mt, n in motivos.items():
            self.stdout.write(f"   - {n} {mt}")
        if reporte_excluidos:
            with open(reporte_excluidos, "w", newline="", encoding="utf-8-sig") as fh:
                w = csv.writer(fh)
                w.writerow(["ID_basural", "Direccion", "Motivo"])
                w.writerows(excluidas)
            self.stdout.write(f"   reporte de excluidas: {reporte_excluidos}")
        if dry_run:
            return self.stdout.write("Dry-run: no se escribió nada.")

        with transaction.atomic():
            if vaciar:
                n = m.Foco.objects.count()
                m.Foco.objects.all().delete()
                self.stdout.write(self.style.WARNING(f"Se borraron {n} focos previos."))
            nuevos = existentes = 0
            for rid, direccion, estado, lat, lng, repetido in validas:
                codigo = f"BR-{rid:03d}"
                if m.Foco.objects.filter(codigo=codigo).exists():
                    existentes += 1
                    continue
                obs = (f"Importado de la planilla de relevamiento (ID {rid}). Volumen, permeabilidad y tipo de residuo "
                       f"sin relevar: IRH provisorio.")
                if repetido:
                    obs += (f" ATENCIÓN: coordenadas idénticas al ID {repetido} con otra dirección; "
                            f"verificar la ubicación en campo.")
                foco = m.Foco(tipo=m.Foco.Tipo.BASURAL, estado=estado, direccion=direccion,
                              ubicacion=Point(lng, lat, srid=4326), observaciones=obs,
                              datos_pendientes=["volumen", "permeabilidad", "tipo_residuo"])
                foco.codigo = codigo
                recalcular(foco, motivo="migracion")
                nuevos += 1
        self.stdout.write(self.style.SUCCESS(f"Importados {nuevos} focos nuevos ({existentes} ya existían)."))
