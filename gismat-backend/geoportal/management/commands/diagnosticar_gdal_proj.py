"""Diagnostica la compatibilidad entre GDAL, PROJ y PostGIS (SOLO LECTURA: no escribe en la base ni cambia archivos).

    python manage.py diagnosticar_gdal_proj

Qué informa:
  1. Qué DLL de GDAL usa GeoDjango (GDAL_LIBRARY_PATH) y qué variables PROJ_*/GDAL_DATA hay definidas.
  2. Qué carpetas con proj.db existen realmente (variables de entorno y carpetas hermanas de la DLL de GDAL) y qué versión de
     esquema tiene cada una.
  3. Si una transformación real a EPSG:32720 funciona con el entorno actual y con cada carpeta candidata (cada prueba corre en
     un proceso aparte, con esa carpeta fijada).
  4. Si PostGIS transforma bien a EPSG:32720 y si su área coincide con la geodésica.
  5. El estado de las capas en la base (para saber si algún proceso quedó a medias).
Si el entorno actual falla y alguna carpeta funciona, indica las líneas exactas para agregar al .env.
"""
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection

from geoportal import models as m

POLIGONO = "POLYGON((-65.20 -26.80,-65.19 -26.80,-65.19 -26.791,-65.20 -26.791,-65.20 -26.80))"   # ~1 km x 1 km en Tucumán
CODIGO_PRUEBA = f'''
import os
from django.conf import settings
settings.configure(**{{k: os.environ[k] for k in ("GDAL_LIBRARY_PATH", "GEOS_LIBRARY_PATH") if os.environ.get(k)}})
from django.contrib.gis.geos import GEOSGeometry
p = GEOSGeometry("SRID=4326;{POLIGONO}")
print("AREA_M2=%.1f" % p.transform(32720, clone=True).area)
'''


# ---------- lógica pura (sin base de datos ni GDAL) ----------
def leer_layout(carpeta):
    """(mayor, menor) del esquema de un proj.db, o None si no se puede leer. Abre el archivo solo para lectura."""
    ruta = Path(carpeta) / "proj.db"
    try:
        con = sqlite3.connect(f"file:{ruta.as_posix()}?mode=ro", uri=True)
        try:
            datos = dict(con.execute("SELECT key, value FROM metadata WHERE key LIKE 'DATABASE.LAYOUT.VERSION.%'"))
        finally:
            con.close()
        return int(datos["DATABASE.LAYOUT.VERSION.MAJOR"]), int(datos["DATABASE.LAYOUT.VERSION.MINOR"])
    except Exception:
        return None


def candidatos(dll, entorno):
    """Carpetas que contienen proj.db y que existen de verdad: las de las variables PROJ_DATA / PROJ_LIB y las vecinas de la DLL
    de GDAL. Devuelve [(carpeta, origen)] sin repetidos. No se inventa ninguna ruta: solo se listan las que existen."""
    posibles = []
    for var in ("PROJ_DATA", "PROJ_LIB"):
        for parte in (entorno.get(var) or "").split(os.pathsep):
            if parte.strip():
                posibles.append((Path(parte.strip()), f"variable {var}"))
    if dll:
        base = Path(dll).parent
        for rel in ("../share/proj", "share/proj", "proj", "../proj", "../../share/proj", "../apps/proj/share"):
            posibles.append((base / rel, "junto a la DLL de GDAL"))
    vistos, salida = set(), []
    for carpeta, origen in posibles:
        if (carpeta / "proj.db").is_file():
            clave = str(carpeta.resolve()).lower()
            if clave not in vistos:
                vistos.add(clave)
                salida.append((carpeta.resolve(), origen))
    return salida


def probar_transformacion(extra_env, cwd):
    """Transforma un polígono a EPSG:32720 con GDAL en un proceso aparte. Devuelve (ok, area_m2, mensaje)."""
    env = {**os.environ, **extra_env}
    env.pop("DJANGO_SETTINGS_MODULE", None)   # la prueba configura Django por su cuenta
    try:
        r = subprocess.run([sys.executable, "-c", CODIGO_PRUEBA], capture_output=True, text=True, cwd=cwd, env=env, timeout=120)
    except Exception as ex:   # noqa: BLE001
        return False, None, str(ex)[:200]
    hallado = re.search(r"AREA_M2=([0-9.]+)", r.stdout)
    if hallado:
        return True, float(hallado.group(1)), ""
    lineas = r.stderr.splitlines()
    msg = next((l for l in lineas if "PROJ:" in l or "GDAL_ERROR" in l), lineas[-1] if lineas else "sin detalle")
    return False, None, msg.strip()[:230]
# ---------- fin lógica pura ----------


class Command(BaseCommand):
    help = "Diagnóstico de solo lectura de GDAL / PROJ / PostGIS."

    def handle(self, *a, **kw):
        w = self.stdout.write
        dll = os.environ.get("GDAL_LIBRARY_PATH", "")
        w("=== 1) Configuración ===")
        w(f"GDAL_LIBRARY_PATH (.env): {dll or '(no definida: GeoDjango la busca sola)'}")
        w(f"   existe el archivo: {'sí' if dll and Path(dll).is_file() else 'no / no aplica'}")
        try:
            from django.contrib.gis import gdal
            w(f"Versión de GDAL cargada por GeoDjango: {gdal.gdal_version().decode()}")
        except Exception as ex:   # noqa: BLE001
            w(self.style.ERROR(f"GeoDjango no pudo cargar GDAL: {ex}"))
        for var in ("PROJ_DATA", "PROJ_LIB", "GDAL_DATA"):
            w(f"{var} = {os.environ.get(var) or '(no definida)'}")
        mezcla = [p for p in os.environ.get("PATH", "").split(os.pathsep) if re.search(r"postgresql|osgeo4w|postgis", p, re.I)]
        if mezcla:
            w("Carpetas relacionadas en PATH (en orden de prioridad):")
            for p in mezcla:
                w(f"   {p}")

        w("\n=== 2) Carpetas con proj.db encontradas ===")
        cands = candidatos(dll, os.environ)
        if not cands:
            w("No se encontró ningún proj.db en las variables ni junto a la DLL de GDAL.")
        for carpeta, origen in cands:
            lay = leer_layout(carpeta)
            w(f"   {carpeta}  [{origen}]  esquema {'.'.join(map(str, lay)) if lay else 'ilegible'}")

        w("\n=== 3) Transformación de un polígono de ~1 km2 a EPSG:32720 con GDAL (Python) ===")
        ok_actual, area, msg = probar_transformacion({}, settings.BASE_DIR)
        w(("   entorno actual: OK, área = %.1f m2" % area) if ok_actual else self.style.ERROR(f"   entorno actual: FALLA -> {msg}"))
        buenos = []
        for carpeta, origen in cands:
            ok, area_c, msg_c = probar_transformacion({"PROJ_DATA": str(carpeta), "PROJ_LIB": str(carpeta)}, settings.BASE_DIR)
            w(f"   con {carpeta}: " + (f"OK, área = {area_c:.1f} m2" if ok else f"falla -> {msg_c}"))
            if ok:
                buenos.append(carpeta)

        w("\n=== 4) PostGIS: ST_Transform a EPSG:32720 ===")
        try:
            with connection.cursor() as c:
                c.execute("SELECT ST_Area(ST_Transform(ST_GeomFromText(%s, 4326), 32720)), "
                          "ST_Area(ST_GeomFromText(%s, 4326)::geography), postgis_version()", [POLIGONO, POLIGONO])
                utm, geo, ver = c.fetchone()
            dif = abs(utm - geo) / geo * 100
            w(f"   PostGIS {ver}: área UTM 20S = {utm:.1f} m2 | área geodésica = {geo:.1f} m2 | diferencia {dif:.3f} %")
            w("   " + ("Coinciden (diferencia menor al 0,5 %): el cálculo es válido." if dif < 0.5 else self.style.WARNING("DIFERENCIA INUSUAL: revisar.")))
        except Exception as ex:   # noqa: BLE001
            w(self.style.ERROR(f"   PostGIS no pudo transformar: {ex}"))

        w("\n=== 5) Estado de las capas en la base (solo lectura) ===")
        w(f"   Cursos de agua: {m.CursoAgua.objects.count()} ({m.CursoAgua.objects.filter(origen='oficial').count()} reales, "
          f"{m.CursoAgua.objects.filter(origen='simulado').count()} simulados)")
        w(f"   Microcuencas: {m.Microcuenca.objects.count()} (derivadas de cursos reales: "
          f"{m.Microcuenca.objects.filter(codigo__startswith='cd-').count()})")
        w(f"   Zonas de riesgo derivadas: {m.ZonaRiesgo.objects.filter(codigo__startswith='cd-').count()} de {m.ZonaRiesgo.objects.count()} | "
          f"Puntos de monitoreo derivados: {m.PuntoMonitoreo.objects.filter(codigo__startswith='cd-').count()} de {m.PuntoMonitoreo.objects.count()}")
        w(f"   Focos: {m.Foco.objects.count()} (sin curso de agua asignado: {m.Foco.objects.filter(curso_cercano__isnull=True).count()}, "
          f"sin microcuenca: {m.Foco.objects.filter(microcuenca__isnull=True).count()}) | Detecciones IA: {m.DeteccionIA.objects.count()}")

        w("\n=== Conclusión ===")
        if ok_actual:
            w(self.style.SUCCESS("GDAL y PROJ funcionan juntos en el entorno actual. No hace falta cambiar nada."))
        elif buenos:
            w(self.style.WARNING("El entorno actual falla, pero hay una carpeta de PROJ compatible con tu GDAL. Agregá estas líneas al "
                                 "archivo gismat-backend\\.env:"))
            w(f"   PROJ_DATA={buenos[0]}")
            w(f"   PROJ_LIB={buenos[0]}")
            w("(El .env tiene prioridad sobre las variables del sistema. No hace falta tocar las variables de Windows.)")
        else:
            w(self.style.ERROR("Ninguna carpeta probada funcionó con tu GDAL. Revisá que la instalación de OSGeo4W incluya el paquete "
                               "'proj' completo, o pasame esta salida."))
        w("Nota: derivar_capas_desde_cursos calcula las áreas con PostGIS y no depende de este punto.")
