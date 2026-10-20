import csv
import io
import json
from datetime import date

from django.contrib.gis.geos import Point

from geoportal import models as m

from .base import BaseGismat


class DeteccionesFiltrosYExportacionTests(BaseGismat):
    """Lista y exportación comparten filtros: lo que se descarga es exactamente lo que se ve con esos mismos filtros."""

    def setUp(self):
        self.foco = self.crear_foco(latitud=-26.805, longitud=-65.23, ubicacion="Foco real")
        f = m.Foco.objects.get(codigo=self.foco["id"])
        datos = [  # clave, estado, tipo_foco, fecha, confianza, dirección, cauce, origen, foco
            ("d1", "nuevo", "microbasural", date(2026, 9, 10), 61, "Calle Uno", "CANAL TEST (Cauce)", "simulado", None),
            ("d2", "nuevo", "volcadero", date(2026, 10, 2), 90, "Calle Dos", "", "oficial", None),
            ("d3", "confirmado", "", date(2026, 3, 5), 88, "Av. Tres", "CANAL TEST (Cauce)", "simulado", f),
            ("d4", "descartado", "basural", date(2026, 3, 15), 55, "Calle Cuatro", "", "simulado", None),
            ("d5", "nuevo", "basural", date(2026, 10, 5), 75, "Av. Norte", "", "oficial", None),
        ]
        self.det = {}
        for i, (k, estado, tipo, fecha, conf, dir_, cauce, origen, foco) in enumerate(datos):
            self.det[k] = m.DeteccionIA.objects.create(
                ubicacion=Point(-65.22 - i * 0.01, -26.80 - i * 0.002, srid=4326), direccion=dir_, confianza=conf, area_m2=300, fecha=fecha,
                estado=estado, foco=foco, cauce=cauce, distancia_curso_m=40 if cauce else None, pendiente="3%", densidad="Alta",
                vulnerabilidad_hidrica=80, escurrimiento=70, residuos_peligrosos=60, tipo_foco=tipo, origen=origen)
        self.login_as("analista")

    def codigos(self, claves):
        return sorted(self.det[k].codigo for k in claves)

    def lista(self, query=""):
        r = self.client.get(f"/api/detecciones-ia/{query}")
        self.assertEqual(r.status_code, 200, r.content)
        return sorted(d["id"] for d in r.json())

    def exportado(self, query="", formato="geojson"):
        filtros = query.lstrip("?&")
        r = self.client.get(f"/api/detecciones-ia/exportar/?formato={formato}" + (f"&{filtros}" if filtros else ""))
        self.assertEqual(r.status_code, 200, r.content)
        if formato == "geojson":
            return sorted(f["properties"]["codigo"] for f in json.loads(r.content)["features"])
        filas = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
        return sorted(f[0] for f in filas[1:])

    # ------------------------------------------------------------------ filtros
    def test_la_lista_oculta_descartadas_por_defecto_y_estado_todos_las_incluye(self):
        self.assertEqual(self.lista(), self.codigos(["d1", "d2", "d3", "d5"]))
        self.assertEqual(self.lista("?estado=todos"), self.codigos(["d1", "d2", "d3", "d4", "d5"]))
        self.assertEqual(self.lista("?estado=descartado"), self.codigos(["d4"]))

    def test_cada_filtro_y_sus_combinaciones(self):
        casos = {
            "?estado=todos&estado=nuevo": ["d1", "d2", "d5"],
            "?estado=todos&q=calle": ["d1", "d2", "d4"],
            "?estado=todos&q=canal": ["d1", "d3"],                       # busca también en el cauce
            "?estado=todos&q=AI-": ["d1", "d2", "d3", "d4", "d5"],       # y en el ID
            "?estado=todos&tipo=basural": ["d3", "d4", "d5"],            # d3 hereda el tipo de su foco (basural)
            "?estado=todos&tipo=volcadero": ["d2"],
            "?estado=todos&mes=2026-10": ["d2", "d5"],
            "?estado=todos&mes=2026-03": ["d3", "d4"],
            "?estado=todos&confianza_min=80": ["d2", "d3"],
            "?estado=todos&origen=simulado": ["d1", "d3", "d4"],
            "?estado=todos&origen=real": ["d2", "d5"],
            "?estado=todos&riesgo=" + (self.foco["nivelRiesgo"]): ["d3"],
            "?estado=nuevo&tipo=basural&mes=2026-10&origen=real": ["d5"],
            "?estado=todos&tipo=volcadero&mes=2026-03": [],
        }
        for query, esperado in casos.items():
            self.assertEqual(self.lista(query), self.codigos(esperado), query)

    def test_la_exportacion_coincide_con_la_lista_para_los_mismos_filtros(self):
        for query in ("?estado=todos", "?estado=nuevo", "?estado=confirmado", "?estado=descartado", "?estado=todos&q=calle",
                      "?estado=todos&tipo=basural", "?estado=todos&mes=2026-10", "?estado=todos&confianza_min=80",
                      "?estado=todos&origen=simulado", "?estado=nuevo&tipo=basural&mes=2026-10&origen=real"):
            esperado = self.lista(query)
            self.assertEqual(self.exportado(query, "geojson"), esperado, query)
            self.assertEqual(self.exportado(query, "csv"), esperado, query)

    def test_exportar_sin_estado_incluye_todos_los_estados_y_no_pagina(self):
        for i in range(60):   # más registros que cualquier página razonable
            m.DeteccionIA.objects.create(ubicacion=Point(-65.2, -26.8, srid=4326), direccion=f"Masiva {i}", confianza=70, area_m2=100,
                                         fecha=date(2026, 5, 1), estado="nuevo", tipo_foco="basural")
        self.assertEqual(len(self.exportado()), 65)
        self.assertEqual(len(self.exportado("&q=Masiva")), 60)

    def test_validaciones(self):
        for query in ("&estado=raro", "&tipo=raro", "&mes=2026-13", "&mes=octubre", "&origen=raro", "&confianza_min=alta"):
            self.assertEqual(self.client.get(f"/api/detecciones-ia/exportar/?formato=csv{query}").status_code, 400, query)
        self.assertEqual(self.client.get("/api/detecciones-ia/exportar/?formato=xml").status_code, 400)

    # ------------------------------------------------------------------ contenido de los archivos
    def test_geojson_valido_rfc7946_con_campos_y_aviso_de_simulacion(self):
        r = self.client.get("/api/detecciones-ia/exportar/?formato=geojson")
        self.assertIn("geo+json", r["Content-Type"])
        self.assertRegex(r["Content-Disposition"], r'filename="detecciones-ia-\d{8}\.geojson"')
        fc = json.loads(r.content)
        self.assertEqual(fc["type"], "FeatureCollection")
        self.assertNotIn("crs", fc)                                       # obsoleto en RFC 7946: WGS 84 implícito
        self.assertIn("SIMULADAS", fc["aviso"])
        f = next(f for f in fc["features"] if f["properties"]["codigo"] == self.det["d3"].codigo)
        lng, lat = f["geometry"]["coordinates"]
        self.assertEqual(f["geometry"]["type"], "Point")
        self.assertTrue(-180 <= lng <= 180 and -90 <= lat <= 90)
        self.assertAlmostEqual(lng, self.det["d3"].ubicacion.x, places=5)    # [longitud, latitud]
        p = f["properties"]
        self.assertEqual((p["tipo_foco"], p["estado"], p["origen"], p["simulado"], p["foco"]), ("basural", "confirmado", "simulado", True, self.foco["id"]))
        self.assertEqual(p["riesgo"], self.foco["nivelRiesgo"])
        for campo in ("fecha", "direccion", "confianza", "cauce", "distancia_curso_m", "area_m2", "irh"):
            self.assertIn(campo, p)

    def test_geojson_sin_simuladas_no_lleva_aviso(self):
        m.DeteccionIA.objects.filter(origen="simulado").delete()
        self.assertNotIn("aviso", json.loads(self.client.get("/api/detecciones-ia/exportar/?formato=geojson").content))

    def test_csv_completo_con_bom_y_columnas(self):
        r = self.client.get("/api/detecciones-ia/exportar/?formato=csv&estado=todos")
        self.assertTrue(r.content.startswith(b"\xef\xbb\xbf"))
        self.assertRegex(r["Content-Disposition"], r'filename="detecciones-ia-\d{8}\.csv"')
        filas = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
        cab = filas[0]
        for col in ("Código", "Fecha", "Tipo de foco", "Dirección", "Lat", "Lng", "Confianza (%)", "Estado", "Riesgo (foco asociado)",
                    "Cauce", "Origen"):
            self.assertIn(col, cab)
        self.assertEqual(len(filas), 6)
        self.assertTrue(all(len(f) == len(cab) for f in filas))
        d3 = next(dict(zip(cab, f)) for f in filas[1:] if f[0] == self.det["d3"].codigo)
        self.assertEqual((d3["Tipo de foco"], d3["Estado"], d3["Origen"], d3["Foco asociado"]),
                         ("Basural", "Confirmado", "Simulado (datos de prueba)", self.foco["id"]))
        self.assertTrue(-90 <= float(d3["Lat"]) <= 90 and -180 <= float(d3["Lng"]) <= 180)
        self.assertEqual(next(dict(zip(cab, f)) for f in filas[1:] if f[0] == self.det["d2"].codigo)["Origen"], "Real")

    def test_se_omiten_las_detecciones_sin_coordenadas_validas(self):
        mala = m.DeteccionIA.objects.create(ubicacion=Point(200.0, 95.0, srid=4326), direccion="Fuera de rango", confianza=50, area_m2=50,
                                            fecha=date(2026, 5, 5), estado="nuevo", tipo_foco="basural")
        self.assertNotIn(mala.codigo, self.exportado("&estado=todos", "geojson"))
        self.assertNotIn(mala.codigo, self.exportado("&estado=todos", "csv"))
        self.assertIn(mala.codigo, self.lista("?estado=todos"))            # la lista no cambia: solo la exportación valida coordenadas

    def test_permisos_la_exportacion_pide_lo_mismo_que_la_lista(self):
        for rol in ("administrador", "analista", "supervisor", "operador"):
            self.login_as(rol)
            self.assertEqual(self.client.get("/api/detecciones-ia/exportar/?formato=csv").status_code, 200, rol)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/detecciones-ia/exportar/?formato=csv").status_code, 401)

    # ------------------------------------------------------------------ serializador y confirmación
    def test_serializador_estado_tipo_origen_y_riesgo(self):
        r = {d["id"]: d for d in self.client.get("/api/detecciones-ia/?estado=todos").json()}
        d4, d3, d2 = r[self.det["d4"].codigo], r[self.det["d3"].codigo], r[self.det["d2"].codigo]
        self.assertEqual((d4["statusType"], d4["statusText"], d4["dotColor"]), ("descartado", "Descartado", "bg-slate-400"))   # antes figuraba "confirmado"
        self.assertEqual((d3["statusType"], d3["tipoFoco"], d3["origen"], d3["riesgo"], d3["focoId"]),
                         ("confirmado", "basural", "simulado", self.foco["nivelRiesgo"], self.foco["id"]))
        self.assertEqual((d2["statusType"], d2["tipoFoco"], d2["origen"], d2["riesgo"]), ("nuevo", "volcadero", "real", None))

    def test_confirmar_usa_el_tipo_de_la_deteccion_y_aclara_si_es_simulada(self):
        self.login_as("operador")
        r = self.client.post(f"/api/detecciones-ia/{self.det['d1'].codigo}/confirmar/", {}, format="json").json()
        foco = m.Foco.objects.get(codigo=r["focoId"])
        self.assertEqual(foco.tipo, "microbasural")                           # d1: tipo_foco = microbasural
        self.assertIn("DATO DE PRUEBA", foco.observaciones)                    # d1 es simulada
        r2 = self.client.post(f"/api/detecciones-ia/{self.det['d2'].codigo}/confirmar/", {}, format="json").json()
        foco2 = m.Foco.objects.get(codigo=r2["focoId"])
        self.assertEqual(foco2.tipo, "volcadero")
        self.assertNotIn("DATO DE PRUEBA", foco2.observaciones)                # d2 es real
