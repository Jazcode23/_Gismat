from django.utils import timezone

from geoportal import models as m
from geoportal.services import geo

from .base import BaseGismat


class FocoTests(BaseGismat):
    def test_alta_calcula_geo_irh_e_historial(self):
        f = self.crear_foco()
        self.assertEqual(f["microcuencaId"], "mc-test")
        self.assertEqual(f["cursoAguaCercano"], "Canal Test")
        self.assertTrue(90 <= f["distanciaCursoAgua"] <= 110, f["distanciaCursoAgua"])  # ~0.0009° ≈ 100 m
        self.assertTrue(0 <= f["irh"] <= 100)
        self.assertEqual(f["id"], "BR-001")
        self.assertEqual(m.HistorialIRH.objects.filter(foco__codigo="BR-001").count(), 1)
        # forma FocoAmbiente que espera el frontend
        for k in ("coordenadas", "nivelRiesgo", "microcuencaId", "volumenEstimado", "permeabilidadSuelo",
                  "proximaAccionRecomendada", "superficieM2", "fechaRegistro", "distanciaCursoAgua"):
            self.assertIn(k, f)
        self.assertEqual(len(f["coordenadas"]), 2)

    def test_validaciones(self):
        self.login_as("analista")
        casos = [self.payload(latitud=95), self.payload(latitud=-10, longitud=-65.2), self.payload(volumenM3=-5),
                 self.payload(tipo="otro"), self.payload(permeabilidad="x"), self.payload(tipoResiduo="nada"),
                 {k: v for k, v in self.payload().items() if k != "latitud"}, self.payload(estado="inactivo")]
        for c in casos:
            self.assertEqual(self.client.post("/api/focos/", c, format="json").status_code, 400, c)
        self.assertEqual(m.Foco.objects.count(), 0)

    def test_irh_no_se_acepta_del_cliente(self):
        f = self.crear_foco(irh=1, nivelRiesgo="Bajo")
        self.assertGreater(f["irh"], 1)

    def test_modificar_recalcula_y_conserva_historial(self):
        f = self.crear_foco(volumenM3=500)
        irh0 = f["irh"]
        r = self.client.patch(f"/api/focos/{f['id']}/", {"volumenM3": 10}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertLess(r.json()["irh"], irh0)
        self.assertEqual(m.HistorialIRH.objects.filter(foco__codigo=f["id"]).count(), 2)
        h = self.client.get(f"/api/focos/{f['id']}/historial/").json()
        self.assertEqual([x["motivo"] for x in h["irh"]], ["modificacion", "alta"])
        # editar un dato que no afecta el IRH no agrega historial
        self.client.patch(f"/api/focos/{f['id']}/", {"observaciones": "nota"}, format="json")
        self.assertEqual(m.HistorialIRH.objects.filter(foco__codigo=f["id"]).count(), 2)

    def test_mover_foco_cambia_distancia(self):
        f = self.crear_foco()
        r = self.client.patch(f"/api/focos/{f['id']}/", {"latitud": -26.8001, "longitud": -65.22}, format="json")
        self.assertLess(r.json()["distanciaCursoAgua"], 20)

    def test_baja_logica(self):
        f = self.crear_foco()
        self.login_as("administrador")
        r = self.client.delete(f"/api/focos/{f['id']}/", {"motivo": "duplicado"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["estado"], "inactivo")
        self.assertTrue(m.Foco.objects.filter(codigo=f["id"]).exists())
        self.assertGreaterEqual(m.HistorialIRH.objects.filter(foco__codigo=f["id"]).count(), 2)
        self.assertEqual(self.client.patch(f"/api/focos/{f['id']}/", {"volumenM3": 5}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/focos/{f['id']}/").status_code, 400)

    def test_filtros(self):
        self.crear_foco(ubicacion="Cerca", latitud=-26.8002, volumenM3=600)
        self.crear_foco(ubicacion="Lejos", latitud=-26.8180, volumenM3=5, permeabilidad="baja", tipo="microbasural",
                        tipoResiduo="organico")
        g = lambda q: [x["ubicacion"] for x in self.client.get(f"/api/focos/?{q}").json()]
        self.assertEqual(len(g("")), 2)
        self.assertEqual(g("tipoFoco=microbasural"), ["Lejos"])
        self.assertEqual(g("tipo=microbasural"), ["Lejos"])
        self.assertEqual(g("microcuenca=mc-test").__len__(), 2)
        self.assertEqual(g("microcuenca=otra"), [])
        self.assertEqual(g("nivelRiesgo=Crítico"), ["Cerca"])
        self.assertEqual(g("irhMin=60"), ["Cerca"])
        self.assertEqual(g("proximidadMax=50"), ["Cerca"])
        self.assertEqual(g("searchQuery=lejos"), ["Lejos"])
        self.assertEqual(g("zona=-26.805,-65.3,-26.795,-65.1"), ["Cerca"])          # bbox PostGIS
        self.assertEqual(g("cerca=-26.8002,-65.22,200"), ["Cerca"])                # ST_DWithin
        self.assertEqual(g("desde=2999-01-01"), [])
        self.assertEqual(self.client.get("/api/focos/?irhMin=abc").status_code, 400)
        self.assertEqual(self.client.get("/api/focos/?zona=1,2").status_code, 400)

    def test_calcular_irh_endpoint(self):
        f = self.crear_foco()
        r = self.client.post(f"/api/focos/{f['id']}/calcular-irh/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["valor"], f["irh"])
        d = self.client.get(f"/api/focos/{f['id']}/irh/").json()
        self.assertIn("componentes", d["variables"])
        self.assertEqual(m.HistorialIRH.objects.count(), 2)


class PermisosTests(BaseGismat):
    def test_matriz_de_roles(self):
        f = self.crear_foco()
        esperado = {  # rol: (ver, crear, editar, baja, intervenir, reportes)
            "administrador": (200, 201, 200, 200, 201, 200),
            "operador": (200, 201, 200, 403, 201, 403),
            "analista": (200, 201, 200, 403, 403, 200),
            "supervisor": (200, 403, 403, 403, 403, 200),
        }
        for rol, (ver, crear, editar, baja, interv, rep) in esperado.items():
            self.login_as(rol)
            c = self.client
            self.assertEqual(c.get("/api/focos/").status_code, ver, rol)
            self.assertEqual(c.post("/api/focos/", self.payload(), format="json").status_code, crear, rol)
            self.assertEqual(c.patch(f"/api/focos/{f['id']}/", {"observaciones": "x"}, format="json").status_code, editar, rol)
            self.assertEqual(c.post(f"/api/focos/{f['id']}/intervenciones/", {"tipo": "Limpieza"}, format="json").status_code, interv, rol)
            self.assertEqual(c.get("/api/reportes/focos/?formato=csv").status_code, rep, rol)
            self.assertEqual(c.delete(f"/api/focos/{f['id']}/").status_code, baja, rol)
            if baja == 200:  # reponer para el siguiente rol
                m.Foco.objects.filter(codigo=f["id"]).update(estado="activo")


class IntervencionTests(BaseGismat):
    def test_registro_historial_y_efecto_en_irh(self):
        f = self.crear_foco(volumenM3=300)
        self.login_as("operador")
        r = self.client.post(f"/api/focos/{f['id']}/intervenciones/", {
            "title": "Retiro de residuos", "desc": "Con retroexcavadora", "tags": ["14 Toneladas"],
            "cuadrilla": "alfa", "date": "15/03/2026", "volumen_removido_ton": 150}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual(d["fecha"], "2026-03-15")
        self.assertEqual(d["cuadrillaNombre"], "Cuadrilla Alfa")
        self.assertEqual(d["responsableNombre"], "operador")
        self.assertLess(d["irh_despues"], d["irh_antes"])
        foco = self.client.get(f"/api/focos/{f['id']}/").json()
        self.assertEqual(foco["volumenM3"], 50.0)  # 300 - 150/0.6
        self.assertEqual(foco["ultimaIntervencion"]["volumenRemovidoTon"], 150)
        h = self.client.get(f"/api/focos/{f['id']}/historial/").json()
        self.assertEqual(len(h["intervenciones"]), 1)
        self.assertEqual([x["motivo"] for x in h["irh"]], ["intervencion", "alta"])
        self.assertEqual(len(self.client.get("/api/intervenciones/?foco=BR-001").json()), 1)

    def test_recuperacion_total(self):
        f = self.crear_foco(volumenM3=100)
        self.login_as("operador")
        self.client.post(f"/api/focos/{f['id']}/intervenciones/", {"tipo": "Saneamiento", "volumen_removido_ton": 60}, format="json")
        foco = self.client.get(f"/api/focos/{f['id']}/").json()
        self.assertEqual(foco["estado"], "limpiado")
        self.assertLess(foco["irh"], f["irh"] - 15)  # el riesgo residual (cercanía, suelo) no desaparece

    def test_validaciones(self):
        f = self.crear_foco()
        self.login_as("operador")
        url = f"/api/focos/{f['id']}/intervenciones/"
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"tipo": "x", "volumen_removido_ton": -3}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"tipo": "x", "date": "ayer"}, format="json").status_code, 400)

    def test_no_se_interviene_foco_dado_de_baja(self):
        f = self.crear_foco()
        self.login_as("administrador")
        self.client.delete(f"/api/focos/{f['id']}/")
        self.assertEqual(self.client.post(f"/api/focos/{f['id']}/intervenciones/", {"tipo": "x"}, format="json").status_code, 400)

    def test_asignar_cuadrilla(self):
        f = self.crear_foco()
        self.login_as("supervisor")
        r = self.client.post(f"/api/focos/{f['id']}/asignar-cuadrilla/", {"cuadrilla": "alfa"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["estado"], "programada")
        self.assertEqual(self.client.post(f"/api/focos/{f['id']}/asignar-cuadrilla/", {"cuadrilla": "zzz"}, format="json").status_code, 400)


class AlertaTests(BaseGismat):
    def test_critico_genera_alerta_una_sola_vez(self):
        f = self.crear_foco(latitud=-26.8001, volumenM3=600)
        self.assertEqual(f["nivelRiesgo"], "Crítico")
        al = m.Alerta.objects.filter(foco__codigo=f["id"])
        self.assertEqual(al.count(), 1)
        a = al.first()
        self.assertEqual((a.nivel, a.estado), ("critica", "activa"))
        self.assertTrue(a.recomendacion and a.mensaje and a.microcuenca_id)
        self.client.post(f"/api/focos/{f['id']}/calcular-irh/")
        self.assertEqual(al.count(), 1)  # no duplica

    def test_no_critico_no_genera(self):
        self.crear_foco(latitud=-26.815, volumenM3=10, permeabilidad="baja", tipoResiduo="organico")
        self.assertEqual(m.Alerta.objects.count(), 0)

    def test_se_cierra_al_bajar_el_riesgo(self):
        f = self.crear_foco(latitud=-26.8001, volumenM3=600)
        self.login_as("operador")
        self.client.post(f"/api/focos/{f['id']}/intervenciones/", {"tipo": "Saneamiento", "volumen_removido_ton": 400}, format="json")
        self.assertFalse(m.Alerta.objects.filter(foco__codigo=f["id"], estado="activa", nivel="critica").exists())
        self.assertTrue(m.Alerta.objects.filter(foco__codigo=f["id"], nivel="informativa").exists())

    def test_api_alertas_forma_frontend(self):
        self.crear_foco(latitud=-26.8001, volumenM3=600)
        a = self.client.get("/api/alertas/").json()[0]
        for k in ("id", "titulo", "descripcion", "tipo", "nivel", "fecha", "focoId", "microcuencaId", "coordenadas", "recomendacion"):
            self.assertIn(k, a)
        self.assertEqual(self.client.get("/api/alertas/?nivel=critica").json().__len__(), 1)
        self.assertEqual(self.client.get("/api/alertas/?nivel=informativa").json(), [])


class GeoYReportesTests(BaseGismat):
    def test_distancia_y_contencion_postgis(self):
        punto = geo.punto(-26.8009, -65.22)
        curso, d = geo.curso_mas_cercano(punto)
        self.assertEqual(curso.codigo, "canal-test")
        self.assertTrue(95 < d < 105)
        self.assertEqual(geo.microcuenca_de(punto).codigo, "mc-test")
        self.assertIsNone(geo.microcuenca_de(geo.punto(-26.9, -65.0)))

    def test_carga_por_microcuenca(self):
        self.crear_foco(latitud=-26.8001, volumenM3=600)
        self.crear_foco(latitud=-26.815, volumenM3=50)
        r = self.client.get("/api/microcuencas/riesgo/").json()
        self.assertEqual(len(r), 1)
        mc = r[0]
        self.assertEqual((mc["id"], mc["focosActivos"], mc["focosCriticos"]), ("mc-test", 2, 1))
        self.assertGreater(mc["cargaAcumulada"], mc["irhPromedio"])
        for k in ("superficieKm2", "irhPromedio", "nivelRiesgo", "focosTotales", "cursosAsociados", "recomendaciones", "coordenadas", "color"):
            self.assertIn(k, mc)
        d = self.client.get("/api/microcuencas/mc-test/").json()
        self.assertEqual(len(d["focos"]), 2)

    def test_geojson(self):
        self.crear_foco()
        for capa, tipo in (("focos", "Point"), ("cursos-agua", "LineString"), ("microcuencas", "Polygon")):
            fc = self.client.get(f"/api/geojson/{capa}/").json()
            self.assertEqual(fc["type"], "FeatureCollection")
            self.assertEqual(fc["features"][0]["geometry"]["type"], tipo)
        self.assertEqual(self.client.get("/api/geojson/nada/").status_code, 404)

    def test_capas_formato_frontend(self):
        self.crear_foco()
        c = self.client.get("/api/geoportal/cursos-agua").json()[0]
        self.assertEqual(c["coordenadas"][0], [-26.8, -65.25])  # [lat, lng]
        self.assertGreater(c["longitudKm"], 4)
        mc = self.client.get("/api/geoportal/microcuencas").json()[0]
        self.assertEqual(mc["coordenadas"][0], [-26.79, -65.26])
        self.assertEqual(len(mc["coordenadas"]), 4)  # anillo abierto, como en el mock
        self.assertEqual(len(self.client.get("/api/geoportal/capas").json()), 7)
        st = self.client.get("/api/geoportal/estadisticas").json()
        self.assertEqual(st["totalFocos"], 1)
        self.assertEqual(len(self.client.get("/api/geoportal/focos?tipoFoco=todos&estado=todos&irhMin=0&irhMax=100&microcuenca=todas&proximidadMax=0&searchQuery=&soloAlertas=false").json()), 1)
        self.assertEqual(self.client.get("/api/geoportal/focos/BR-001").json()["id"], "BR-001")
        b = self.client.get("/api/geoportal/buscar?q=test").json()
        self.assertEqual({x["categoria"] for x in b}, {"foco", "microcuenca", "curso"})

    def test_dashboard(self):
        self.crear_foco(latitud=-26.8001, volumenM3=600)
        self.crear_foco(latitud=-26.815, volumenM3=50)
        self.login_as("supervisor")
        d = self.client.get("/api/dashboard/").json()
        self.assertEqual(d["totalFocos"], 2)
        self.assertEqual(d["focosPorNivelRiesgo"]["Crítico"], 1)
        self.assertEqual(d["focosActivos"], 2)
        self.assertEqual(d["alertas"]["criticas"], 1)
        self.assertEqual(len(d["riesgoPorMicrocuenca"]), 1)
        self.assertTrue(d["evolucionIRH"])
        self.assertEqual(self.client.get("/api/dashboard/?meses=x").status_code, 400)
        # campos que consume la pantalla del dashboard
        self.assertEqual(sum(r["cantidad"] for r in d["distribucionIRH"]), 2)
        self.assertEqual(len(d["distribucionIRH"]), 4)
        self.assertIn("tasaIntervencion", d)
        ult = d["evolucionNiveles"][-1]
        self.assertEqual((ult["critico"], ult["moderado"] + ult["bajo"]), (1, 1))
        self.assertEqual(d["riesgoPorMicrocuenca"][0]["focosTotales"], 2)
        self.assertEqual(len(d["evolucionMensual"]), timezone.localdate().month)
        f = self.client.get("/api/focos/BR-001/").json()
        self.assertEqual((f["totalIntervenciones"], f["alertasActivas"]), (0, 1))

    def test_reportes(self):
        self.crear_foco()
        self.login_as("analista")
        pdf = self.client.get("/api/reportes/focos/?formato=pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        csv = self.client.get("/api/reportes/focos/?formato=csv&nivelRiesgo=Crítico")
        self.assertIn("Código", csv.content.decode("utf-8-sig"))
        self.assertEqual(self.client.get("/api/reportes/focos/?formato=xls").status_code, 400)


class FlujoFrontendTests(BaseGismat):
    def test_trazabilidad_e_ia(self):
        f = self.crear_foco(latitud=-26.8001, volumenM3=600)
        self.login_as("operador")
        r = self.client.post(f"/api/trazabilidad/focos/{f['id']}/intervenciones/", {
            "title": "Relleno y plantación", "desc": "x", "tags": ["a"], "cuadrilla": "Cuadrilla X", "date": "01/02/2026"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        t = r.json()
        for k in ("id", "cuenca", "location", "statusBadge", "statusBadgeClass", "irhActual", "irhInitial", "irhBarClass",
                  "irhWidth", "dotClass", "lastDate", "lastAction", "tipoFoco", "superficie", "cuadrilla", "prioridad",
                  "coords", "distCuenca", "intervencionesList"):
            self.assertIn(k, t)
        self.assertEqual(t["intervencionesList"][0]["title"], "Relleno y plantación")
        self.assertEqual(t["lastDate"], "01/02/2026")
        self.assertEqual(self.client.get("/api/trazabilidad/focos/resumen/").json()["totalInterventions"], 1)

        # detecciones IA: alta (módulo IA) -> confirmar crea el foco con IRH
        r = self.client.post("/api/detecciones-ia/", {"latitud": -26.805, "longitud": -65.23, "ubicacion": "Detectado",
                                                      "confianza": 91, "area_m2": 300}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        det = r.json()
        self.assertEqual(det["statusType"], "nuevo")
        ok = self.client.post(f"/api/detecciones-ia/{det['id']}/confirmar/", {}, format="json").json()
        self.assertEqual(ok["statusType"], "confirmado")
        self.assertTrue(ok["focoId"])
        self.assertEqual(self.client.post(f"/api/detecciones-ia/{det['id']}/confirmar/", {}, format="json").json()["focoId"], ok["focoId"])
        self.assertEqual(m.Foco.objects.count(), 2)  # idempotente
        self.assertEqual(self.client.post("/api/detecciones-ia/", {"latitud": 0, "longitud": 0}, format="json").status_code, 400)


class DatosPendientesTests(BaseGismat):
    def test_alta_sin_datos_relevados_es_provisoria(self):
        self.login_as("analista")
        p = {"tipo": "basural", "ubicacion": "Solo coordenadas", "latitud": -26.8009, "longitud": -65.22}
        f = self.client.post("/api/focos/", p, format="json").json()
        self.assertTrue(f["irhProvisorio"])
        self.assertEqual(sorted(f["datosPendientes"]), ["permeabilidad", "tipo_residuo", "volumen"])
        self.assertEqual((f["volumenEstimado"], f["permeabilidadSuelo"]), ("Sin relevar", "Sin relevar"))
        h = self.client.get(f"/api/focos/{f['id']}/historial/").json()
        self.assertEqual(sorted(h["irh"][0]["variables"]["pendientes"]), ["composicion", "permeabilidad", "volumen"])

    def test_relevar_el_dato_lo_quita_de_pendientes(self):
        self.login_as("analista")
        f = self.client.post("/api/focos/", {"tipo": "basural", "ubicacion": "X", "latitud": -26.8009, "longitud": -65.22},
                             format="json").json()
        r = self.client.patch(f"/api/focos/{f['id']}/", {"volumenM3": 300}, format="json").json()
        self.assertEqual(sorted(r["datosPendientes"]), ["permeabilidad", "tipo_residuo"])
        r = self.client.patch(f"/api/focos/{f['id']}/", {"permeabilidad": "alta", "tipoResiduo": "industrial"}, format="json").json()
        self.assertEqual((r["datosPendientes"], r["irhProvisorio"]), ([], False))
        self.assertEqual(r["volumenEstimado"], "~300 m³ (~180 Toneladas)")

    def test_intervencion_sin_volumen_no_marca_limpio(self):
        self.login_as("analista")
        f = self.client.post("/api/focos/", {"tipo": "basural", "ubicacion": "X", "latitud": -26.8009, "longitud": -65.22},
                             format="json").json()
        self.login_as("operador")
        self.client.post(f"/api/focos/{f['id']}/intervenciones/", {"tipo": "Limpieza"}, format="json")
        self.assertEqual(self.client.get(f"/api/focos/{f['id']}/").json()["estado"], "activo")
        self.assertEqual(self.client.get("/api/dashboard/").json()["focosIrhProvisorio"], 1)


class ImportadorXlsxTests(BaseGismat):
    def _xlsx(self, filas):
        import tempfile
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ID_basural", "Direccion", "Estado", "Latitud", "Longitud"])
        for f in filas:
            ws.append(f)
        ruta = tempfile.mktemp(suffix=".xlsx")
        wb.save(ruta)
        return ruta

    def test_importa_solo_filas_completas_y_es_idempotente(self):
        from io import StringIO
        from django.core.management import call_command
        ruta = self._xlsx([
            (1, "Calle A", "Activo", -26.8009, -65.22),
            (2, "Calle B", "Activo", -26.8100, -65.21),
            (3, "Sin coords", "Activo", None, None),
            (4, "Fuera", "Activo", -30.0, -65.2),
            (5, "", "Activo", -26.80, -65.2),
            (6, "Estado raro", "Quién sabe", -26.80, -65.2),
            (7, "Repite coords de B", "Activo", -26.8100, -65.21),
        ])
        out = StringIO()
        call_command("importar_basurales_xlsx", ruta, stdout=out)
        self.assertEqual(m.Foco.objects.count(), 3)  # 1, 2 y 7
        f = m.Foco.objects.get(codigo="BR-001")
        self.assertEqual(f.estado, "activo")
        self.assertTrue(f.irh_provisorio and f.microcuenca_id)
        self.assertEqual(m.HistorialIRH.objects.filter(foco=f, motivo="migracion").count(), 1)
        self.assertIn("coordenadas idénticas al ID 2", m.Foco.objects.get(codigo="BR-007").observaciones)
        call_command("importar_basurales_xlsx", ruta, stdout=StringIO())
        self.assertEqual(m.Foco.objects.count(), 3)  # idempotente

    def test_dry_run_no_escribe(self):
        from io import StringIO
        from django.core.management import call_command
        call_command("importar_basurales_xlsx", self._xlsx([(1, "A", "Activo", -26.8, -65.2)]), "--dry-run", stdout=StringIO())
        self.assertEqual(m.Foco.objects.count(), 0)


class AlertaProvisoriaTests(BaseGismat):
    def test_irh_provisorio_alto_no_declara_critica(self):
        self.login_as("analista")
        f = self.client.post("/api/focos/", {"tipo": "basural", "ubicacion": "Sobre el canal", "latitud": -26.8001,
                                              "longitud": -65.22}, format="json").json()
        self.assertGreaterEqual(f["irh"], 70)
        a = m.Alerta.objects.get(foco__codigo=f["id"])
        self.assertEqual((a.nivel, a.estado), ("advertencia", "activa"))
        self.assertIn("Relevar en campo", a.recomendacion)
        # al completar los datos pasa a crítica y la advertencia se cierra
        self.client.patch(f"/api/focos/{f['id']}/", {"volumenM3": 600, "permeabilidad": "alta", "tipoResiduo": "industrial"},
                          format="json")
        estados = {(x.nivel, x.estado) for x in m.Alerta.objects.filter(foco__codigo=f["id"])}
        self.assertEqual(estados, {("advertencia", "atendida"), ("critica", "activa")})


class HidrografiaSimuladaTests(BaseGismat):
    def _correr(self, tmp):
        from io import StringIO
        from django.core.management import call_command
        call_command("simular_hidrografia", "--salida", tmp, stdout=StringIO())

    def test_capas_simuladas_cubren_los_focos_y_estan_marcadas(self):
        import tempfile
        for i, (lat, lng) in enumerate([(-26.80, -65.20), (-26.84, -65.17), (-26.86, -65.24), (-26.82, -65.26)]):
            self.crear_foco(ubicacion=f"F{i}", latitud=lat, longitud=lng)
        tmp = tempfile.mkdtemp()
        self._correr(tmp)
        self.assertEqual(m.CursoAgua.objects.count(), 8)
        self.assertEqual(set(m.CursoAgua.objects.values_list("origen", flat=True)), {"simulado"})
        self.assertEqual(set(m.Microcuenca.objects.values_list("origen", flat=True)), {"simulado"})
        self.assertEqual(m.Microcuenca.objects.count(), 4)
        self.assertEqual(m.Foco.objects.filter(microcuenca__isnull=True).count(), 0)
        mcs = list(m.Microcuenca.objects.all())
        for i, a in enumerate(mcs):
            for b in mcs[i + 1:]:
                self.assertLess(a.geom.intersection(b.geom).area, 1e-8)  # sin solapes
        # la API expone el origen para que no se confunda con cartografía oficial
        self.assertEqual(self.client.get("/api/geoportal/cursos-agua").json()[0]["origen"], "simulado")
        self.assertEqual(self.client.get("/api/geoportal/microcuencas").json()[0]["origen"], "simulado")

    def test_es_determinista(self):
        import tempfile
        a, b = tempfile.mkdtemp(), tempfile.mkdtemp()
        from io import StringIO
        from django.core.management import call_command
        call_command("simular_hidrografia", "--solo-archivos", "--salida", a, stdout=StringIO())
        call_command("simular_hidrografia", "--solo-archivos", "--salida", b, stdout=StringIO())
        self.assertEqual(open(f"{a}/cursos_agua.geojson").read(), open(f"{b}/cursos_agua.geojson").read())
