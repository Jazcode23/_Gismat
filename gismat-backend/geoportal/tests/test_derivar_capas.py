import io
import sqlite3
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.gis.gdal import GDALException
from django.contrib.gis.geos import GEOSGeometry
from django.core.management import call_command
from django.db import connection

from geoportal import models as m
from geoportal.management.commands import derivar_capas_desde_cursos as derivar
from geoportal.management.commands import diagnosticar_gdal_proj as diag

from .base import BaseGismat

CUADRADO = "SRID=4326;POLYGON((-65.20 -26.80,-65.19 -26.80,-65.19 -26.791,-65.20 -26.791,-65.20 -26.80))"   # ~1 km2 en Tucumán


def ejecutar(**opciones):
    salida = io.StringIO()
    call_command("derivar_capas_desde_cursos", stdout=salida, **opciones)
    return salida.getvalue()


class DerivarCapasTests(BaseGismat):
    """El escenario base trae un 'Canal Test' real de ~5 km. Se agregan dos focos para definir la zona de estudio."""

    def setUp(self):
        self.crear_foco(latitud=-26.805, longitud=-65.23)
        self.crear_foco(latitud=-26.795, longitud=-65.21)

    def contar(self):
        return (m.Microcuenca.objects.filter(codigo__startswith="cd-").count(), m.ZonaRiesgo.objects.filter(codigo__startswith="cd-").count(),
                m.PuntoMonitoreo.objects.filter(codigo__startswith="cd-").count())

    def test_area_la_calcula_postgis_en_epsg_32720_y_coincide_con_la_geodesica(self):
        poly = GEOSGeometry(CUADRADO)
        utm = derivar.Command()._area_km2(poly) * 1e6
        with connection.cursor() as c:
            c.execute("SELECT ST_Area(ST_GeomFromEWKT(%s)::geography)", [CUADRADO])
            geodesica = c.fetchone()[0]
        self.assertGreater(utm, 900_000)
        self.assertLess(utm, 1_100_000)                                  # ~1 km2
        self.assertLess(abs(utm - geodesica) / geodesica, 0.005)         # UTM 20S vs geodésica: menos de 0,5 %

    def test_dry_run_no_escribe_y_muestra_areas(self):
        antes = self.contar()
        salida = ejecutar()
        self.assertEqual(self.contar(), antes)
        self.assertIn("DRY-RUN", salida)
        self.assertIn("km2", salida)

    def test_no_depende_de_la_transformacion_de_gdal_en_python(self):
        """Regresión del error 'proj.db ... comes from another PROJ installation': aunque GDAL falle al transformar,
        el comando completo (dry-run y --aplicar) debe terminar bien porque el área la calcula PostGIS."""
        with mock.patch.object(GEOSGeometry, "transform", side_effect=GDALException("OGR failure.")):
            self.assertIn("km2", ejecutar())
            self.assertIn("Listo", ejecutar(aplicar=True))
        self.assertGreater(self.contar()[0], 0)

    def test_aplicar_crea_capas_marcadas_como_aproximadas_y_se_puede_repetir(self):
        cursos, focos = m.CursoAgua.objects.count(), m.Foco.objects.count()
        ejecutar(aplicar=True)
        primera = self.contar()
        self.assertGreater(primera[0], 0)
        self.assertTrue(all(mc.origen == m.Origen.SIMULADO for mc in m.Microcuenca.objects.filter(codigo__startswith="cd-")))
        self.assertTrue(all("no es una cuenca hidrológica oficial" in mc.recomendaciones
                            for mc in m.Microcuenca.objects.filter(codigo__startswith="cd-")))
        self.assertTrue(all("no es un mapa oficial" in z.descripcion for z in m.ZonaRiesgo.objects.filter(codigo__startswith="cd-")))
        self.assertEqual(m.Foco.objects.filter(microcuenca__isnull=True).count(), 0)
        ejecutar(aplicar=True)
        self.assertEqual(self.contar(), primera)                         # sin duplicados al repetir
        self.assertEqual((m.CursoAgua.objects.count(), m.Foco.objects.count()), (cursos, focos))   # no toca cursos ni focos

    def test_falla_limpiamente_sin_cursos_reales(self):
        m.CursoAgua.objects.all().delete()
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            ejecutar(aplicar=True)
        self.assertEqual(self.contar(), (0, 0, 0))


class DiagnosticoProjTests(BaseGismat):
    """Funciones puras del diagnóstico: no inventan rutas, solo informan las que existen."""

    def crear_proj_db(self, carpeta, menor):
        carpeta.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(carpeta / "proj.db")
        con.execute("CREATE TABLE metadata (key TEXT, value TEXT)")
        con.executemany("INSERT INTO metadata VALUES (?, ?)", [("DATABASE.LAYOUT.VERSION.MAJOR", "1"),
                                                               ("DATABASE.LAYOUT.VERSION.MINOR", str(menor))])
        con.commit()
        con.close()

    def test_leer_layout(self):
        with tempfile.TemporaryDirectory() as t:
            self.crear_proj_db(Path(t) / "viejo", 2)
            self.assertEqual(diag.leer_layout(Path(t) / "viejo"), (1, 2))
            self.assertIsNone(diag.leer_layout(Path(t) / "no_existe"))

    def test_candidatos_solo_devuelve_carpetas_reales_sin_repetir(self):
        with tempfile.TemporaryDirectory() as t:
            raiz = Path(t)
            (raiz / "bin").mkdir()
            self.crear_proj_db(raiz / "share" / "proj", 6)            # al lado de la DLL (como OSGeo4W)
            self.crear_proj_db(raiz / "otra_instalacion" / "proj", 2)   # la que apunta una variable (como PostGIS)
            entorno = {"PROJ_LIB": str(raiz / "otra_instalacion" / "proj"), "PROJ_DATA": str(raiz / "no_existe")}
            res = diag.candidatos(str(raiz / "bin" / "gdal313.dll"), entorno)
            carpetas = [str(c) for c, _ in res]
            self.assertEqual(len(res), 2)
            self.assertIn(str((raiz / "share" / "proj").resolve()), carpetas)
            self.assertIn(str((raiz / "otra_instalacion" / "proj").resolve()), carpetas)
            self.assertNotIn(str(raiz / "no_existe"), carpetas)
            self.assertEqual(dict((str(c), o) for c, o in res)[str((raiz / "share" / "proj").resolve())], "junto a la DLL de GDAL")

    def test_el_diagnostico_corre_y_no_escribe(self):
        antes = (m.Foco.objects.count(), m.CursoAgua.objects.count(), m.Microcuenca.objects.count())
        salida = io.StringIO()
        call_command("diagnosticar_gdal_proj", stdout=salida)
        self.assertIn("PostGIS", salida.getvalue())
        self.assertIn("Conclusión", salida.getvalue())
        self.assertEqual((m.Foco.objects.count(), m.CursoAgua.objects.count(), m.Microcuenca.objects.count()), antes)
