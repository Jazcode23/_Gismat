"""Carga microbasurales y volcaderos clandestinos georreferenciados (datos de prueba) con el formato de los focos reales.

    python manage.py simular_microbasurales                                  # DRY-RUN: muestra el plan, no escribe nada
    python manage.py simular_microbasurales --aplicar                        # crea los registros
    python manage.py simular_microbasurales --microbasurales 80 --volcaderos 20 --aplicar
    python manage.py simular_microbasurales --identificar --aplicar          # además agrega "[SIMULACIÓN]" visible en cada ficha
    python manage.py simular_microbasurales --revertir --aplicar             # elimina SOLO lo que creó este comando

Requisitos: haber cargado los cursos de agua reales (ACTUALIZAR_CURSOS_AGUA.bat) y los basurales del relevamiento.

Qué hace:
  - Ubica los puntos dentro de la zona de estudio (envolvente de los focos existentes + margen), con separación mínima entre sí y
    respecto de los demás focos, sin caer sobre el cauce. Mezcla puntos dispersos, concentrados en algunos sectores y en la
    periferia. Los volcaderos se ubican en su mayoría cerca de cursos de agua REALES (OpenStreetMap) y el resto tierra adentro.
  - NO usa ninguna fórmula propia de riesgo: cada foco pasa por geoportal.services.focos.recalcular, que calcula cauce más
    cercano, distancia, microcuenca (si el punto cae dentro de una microcuenca cargada) e IRH con la fórmula y los umbrales
    existentes. También deja historial de IRH, intervenciones y, si corresponde, alertas, como cualquier foco.
  - Los focos se crean con el código que le toca a cualquier foco nuevo del sistema (MB-081, VC-012...) y con direcciones y
    observaciones normales: en pantalla se ven como los demás. Para poder encontrarlos y deshacerlos, cada uno queda marcado
    internamente con un registro de historial de IRH cuyo motivo es "simulacion_microbasurales" (no se muestra en la interfaz).
  - Repetir el comando no crea duplicados: la cantidad pedida es el TOTAL de simulados de cada tipo; solo se agregan los que falten.
  - No modifica ni elimina ningún foco existente. Con --identificar se agrega el texto "[SIMULACIÓN] DATOS DE PRUEBA" visible.

Límites (se informan al ejecutar): no existe una capa de uso del suelo ni de calles, así que "terreno baldío" o "esquina" son
descripciones de ejemplo, no verificaciones; y la microcuenca solo se asigna si el punto cae dentro de una microcuenca cargada
(las derivadas de los cursos reales son una aproximación, no cartografía oficial).
"""
import calendar
import math
import random
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.contrib.gis.geos import MultiPoint, Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from geoportal import models as m
from geoportal.management.commands.ajustar_detecciones_cursos import desplazar, elegir_curso, punto_en_linea
from geoportal.services import geo
from geoportal.services.focos import recalcular, siguiente_codigo
from geoportal.services.irh import calcular_irh

MOTIVO = "simulacion_microbasurales"   # marca interna (historial de IRH) con la que se reconocen los focos creados acá
MARCA = "[SIMULACIÓN]"                 # texto visible: solo se agrega con --identificar
MARGEN_ZONA = 0.015                    # grados (~1,6 km) alrededor de los basurales reales
M_POR_GRADO = 111320.0
SEP_MINIMA = {"microbasural": 70.0, "volcadero": 250.0}   # metros entre focos simulados del mismo tipo
SEP_REALES = 40.0                      # metros respecto de cualquier otro foco
DIST_MIN_CAUCE = 10.0                  # no se ubican sobre el propio cauce
PESOS_MES = [3, 4, 5, 6, 8, 9, 10, 12, 13, 9]
PERMEABILIDADES = ["alta", "media_alta", "media", "media_baja", "baja"]
PESOS_PERM = [2, 3, 4, 2, 1]
RESIDUOS = {"microbasural": {"mixto": 5, "organico": 3, "plasticos": 3, "escombros": 1},
            "volcadero": {"escombros": 5, "mixto": 3, "industrial": 1.5, "neumaticos": 1.5, "plasticos": 1}}
CONTEXTO_MICRO = ["Esquina con acumulación de residuos domiciliarios", "Terreno baldío sin cerco", "Calle secundaria sin pavimentar",
                  "Borde de lote en zona periférica", "Lote abandonado"]
CONTEXTO_VC_TIERRA = ["Terreno abandonado", "Margen de camino vecinal", "Playón sin uso"]
TIPOS_INT = ["Limpieza y retiro de residuos", "Retiro de escombros y desmalezado", "Operativo de saneamiento",
             "Retiro de residuos voluminosos"]
CUADRILLAS = ["Cuadrilla Alfa – Saneamiento Hidráulico", "Cuadrilla Beta – Desobstrucción Pluvial",
              "Cuadrilla Gamma – Residuos Especiales", "Cuadrilla Espacios Verdes - Brigada 01"]


# ---------- lógica pura (sin base de datos) ----------
def clave_de(tipo, n):
    """Clave de la semilla de un foco (no es su código: el código lo asigna el sistema al crearlo)."""
    return f"{tipo}-{n:03d}"


def distancia_m(lng1, lat1, lng2, lat2):
    """Distancia aproximada en metros (plano local; suficiente a escala de ciudad)."""
    k = math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lng2 - lng1) * M_POR_GRADO * k, (lat2 - lat1) * M_POR_GRADO)


def elegir_hotspots(rnd, caja, dentro, n=5):
    """Centros de sectores con vuelcos frecuentes, dentro de la zona de estudio."""
    lng0, lat0, lng1, lat1 = caja
    centros = []
    for _ in range(2000):
        p = (rnd.uniform(lng0, lng1), rnd.uniform(lat0, lat1))
        if dentro(*p):
            centros.append(p)
        if len(centros) == n:
            break
    return centros


def colocar(codigo, tipo, semilla, ctx, colocados):
    """Elige las coordenadas de un foco simulado. Devuelve dict(lng, lat, curso, dist, contexto) o None.

    ctx: caja (lng0, lat0, lng1, lat1), dentro(lng, lat), dist_borde(lng, lat) [m], hotspots, lineas [(id, coords)],
         cercano(lng, lat) -> (curso|None, metros|None)        <- en producción consulta PostGIS (ST_Distance)
    colocados: [(lng, lat, tipo)] de todos los focos ya existentes (reales y simulados)."""
    rnd = random.Random(f"gismat-microbasural-{semilla}-{codigo}")
    lng0, lat0, lng1, lat1 = ctx["caja"]
    for intento in range(300):
        r = rnd.random()
        if tipo == "volcadero" and r < 0.65 and ctx["lineas"]:           # cerca de un curso de agua real
            _, coords = elegir_curso(rnd, ctx["lineas"])
            lng, lat = punto_en_linea(coords, rnd.uniform(0.05, 0.95))
            lng, lat = desplazar(lng, lat, rnd.uniform(20, 250), rnd.uniform(0, 360))
            modo = "cauce"
        elif r < 0.45 or tipo == "volcadero":                            # disperso en toda la zona
            lng, lat = rnd.uniform(lng0, lng1), rnd.uniform(lat0, lat1)
            modo = "disperso"
        elif r < 0.80 and ctx["hotspots"]:                               # concentrado en algunos sectores
            cx, cy = rnd.choice(ctx["hotspots"])
            lng, lat = cx + rnd.gauss(0, 350) / M_POR_GRADO, cy + rnd.gauss(0, 350) / M_POR_GRADO
            modo = "sector"
        else:                                                            # periferia de la zona de estudio
            lng, lat = rnd.uniform(lng0, lng1), rnd.uniform(lat0, lat1)
            modo = "periferia"
        if not ctx["dentro"](lng, lat):
            continue
        if modo == "periferia" and ctx["dist_borde"](lng, lat) > 600:
            continue
        if any(distancia_m(lng, lat, x, y) < (SEP_MINIMA[tipo] if t == tipo else SEP_REALES if t == "real" else 80.0)
               for x, y, t in colocados):
            continue
        curso, dist = ctx["cercano"](lng, lat)                          # consulta a la base: se hace al final
        if dist is not None and dist < DIST_MIN_CAUCE:
            continue
        if tipo == "volcadero" and modo != "cauce" and dist is not None and dist < 250:
            continue                                                     # los de "tierra adentro" quedan lejos del agua
        return {"lng": lng, "lat": lat, "curso": curso, "dist": dist, "modo": modo, "contexto": _contexto(rnd, tipo, curso, dist)}
    return None


def _contexto(rnd, tipo, curso, dist):
    nombre = getattr(curso, "nombre", "") if curso else ""
    if tipo == "volcadero":
        if dist is not None and dist <= 300:
            return "Margen de curso de agua sin nombre" if (not nombre or "sin nombre" in nombre.lower()) else f"Margen de {nombre}"
        return rnd.choice(CONTEXTO_VC_TIERRA)
    return rnd.choice(CONTEXTO_MICRO)


def atributos(codigo, tipo, semilla, hoy):
    """Atributos de prueba de un foco (volumen, composición, estado, fecha de alta...). Solo depende del código."""
    rnd = random.Random(f"gismat-microbasural-attr-{semilla}-{codigo}")
    vc = tipo == "volcadero"
    volumen = round(min(420.0, max(30.0, rnd.lognormvariate(4.7, 0.6))) if vc else min(8.0, max(0.3, rnd.lognormvariate(0.5, 0.6))), 1)
    superficie = round(volumen / (rnd.uniform(0.5, 1.6) if vc else rnd.uniform(0.25, 0.8)), 1)
    pesos = RESIDUOS[tipo]
    residuo = rnd.choices(list(pesos), list(pesos.values()))[0]
    estado = rnd.choices(["activo", "pendiente", "limpiado"], [66, 26, 8] if vc else [58, 17, 25])[0]
    recurrente = vc and estado != "limpiado" and rnd.random() < 0.45
    mes = rnd.choices(range(1, 11), PESOS_MES)[0] if not recurrente else rnd.randint(1, 5)
    mes = min(mes, hoy.month)
    primero = max(date(hoy.year, mes, 1), date(hoy.year, 1, 3))
    ultimo = min(date(hoy.year, mes, calendar.monthrange(hoy.year, mes)[1]), hoy - timedelta(days=1))
    reg = ultimo if ultimo <= primero else primero + timedelta(days=rnd.randint(0, (ultimo - primero).days))
    return {"volumen": volumen, "superficie": superficie, "residuo": residuo, "estado": estado, "recurrente": recurrente,
            "permeabilidad": rnd.choices(PERMEABILIDADES, PESOS_PERM)[0], "reg": reg}


def plan_historial(codigo, tipo, semilla, a, hoy, densidad, irh_fn):
    """Historia del foco desde su alta: filas de historial de IRH [(fecha, resultado, motivo)], intervenciones pasadas y el
    volumen/estado vigentes. El IRH se calcula SIEMPRE con irh_fn (= la fórmula existente de GISMAT)."""
    rnd = random.Random(f"gismat-microbasural-hist-{semilla}-{codigo}")
    reg, vc = a["reg"], tipo == "volcadero"
    vigente = a["volumen"]
    eventos = []           # [(fecha, volumen_antes, volumen_despues, limpia)]
    if a["estado"] == "limpiado":
        c = reg + timedelta(days=rnd.randint(15, max(15, (hoy - reg).days - 2)))
        c = min(c, hoy - timedelta(days=2))
        despues = round(rnd.uniform(3, 15) if vc else rnd.uniform(0.1, 0.8), 1)
        eventos.append((c, a["volumen"], despues, True))
        vigente = despues
    elif a["recurrente"]:
        n = rnd.choice([1, 2])
        desde, hasta = reg + timedelta(days=20), hoy - timedelta(days=25)
        if desde < hasta:
            fechas = sorted(desde + timedelta(days=rnd.randint(0, (hasta - desde).days)) for _ in range(n))
            for f in fechas:
                pico = max(a["volumen"] * rnd.uniform(0.9, 1.6), 40.0)
                eventos.append((f, pico, pico * rnd.uniform(0.10, 0.40), False))

    g0 = rnd.uniform(0.30, 0.65)

    def volumen_en(t):
        ant_f, ant_v = reg, None
        for f, pre, post, _ in eventos:
            if t < f:
                base_ini = (ant_v if ant_v is not None else pre * g0)
                frac = (t - ant_f).days / max(1, (f - ant_f).days)
                return base_ini + (pre - base_ini) * min(1.0, max(0.0, frac))
            ant_f, ant_v = f, post
        if ant_v is None:                                       # sin eventos: crece hasta el valor vigente
            return vigente * (g0 + (1 - g0) * min(1.0, (t - reg).days / max(1, (hoy - reg).days)))
        return ant_v + (vigente - ant_v) * min(1.0, (t - ant_f).days / max(1, (hoy - ant_f).days))

    def estado_en(t):
        return "limpiado" if a["estado"] == "limpiado" and eventos and t >= eventos[0][0] else "activo"

    fechas = {reg}
    for mm in range(reg.month, hoy.month):
        fin = date(hoy.year, mm, calendar.monthrange(hoy.year, mm)[1])
        if reg < fin < hoy:
            fechas.add(fin)
    filas = [(t, irh_fn(max(0.0, volumen_en(t)), estado_en(t)), "alta_simulada" if t == reg else "evolucion_simulada")
             for t in sorted(fechas)]
    intervenciones = []
    for f, pre, post, limpia in eventos:
        antes, despues = irh_fn(pre, "activo"), irh_fn(post, "limpiado" if limpia else "activo")
        filas.append((f, despues, "intervencion_simulada"))
        intervenciones.append({"fecha": f, "ton": round((pre - post) * densidad, 2), "irh_antes": antes.valor,
                               "irh_despues": despues.valor, "tipo": rnd.choice(TIPOS_INT), "cuadrilla": rnd.choice(CUADRILLAS)})
    return {"filas": sorted(filas, key=lambda x: x[0]), "intervenciones": intervenciones, "volumen_vigente": vigente}
# ---------- fin lógica pura ----------


def _aware(d):
    return timezone.make_aware(datetime.combine(d, time(12, 0)))


class Command(BaseCommand):
    help = "Simula microbasurales y volcaderos clandestinos (DATOS DE PRUEBA). Dry-run por defecto; reversible; sin duplicados."

    def add_arguments(self, p):
        p.add_argument("--microbasurales", type=int, default=60, help="Cantidad total de microbasurales simulados (def. 60).")
        p.add_argument("--volcaderos", type=int, default=15, help="Cantidad total de volcaderos simulados (def. 15).")
        p.add_argument("--semilla", type=int, default=2026, help="Semilla de la distribución (def. 2026).")
        p.add_argument("--identificar", action="store_true", help="Agrega '[SIMULACIÓN] DATOS DE PRUEBA' visible en cada foco.")
        p.add_argument("--aplicar", action="store_true", help="Escribe en la base (sin esto es dry-run).")
        p.add_argument("--revertir", action="store_true", help="Elimina SOLO los focos creados por este comando.")

    @staticmethod
    def simulados():
        """Focos creados por este comando: los que tienen un registro de historial con el motivo interno."""
        return m.Foco.objects.filter(historial_irh__motivo=MOTIVO).distinct()

    def handle(self, *a, microbasurales, volcaderos, semilla, identificar, aplicar, revertir, **kw):
        if revertir:
            return self.revertir(aplicar)
        for nombre, v in (("--microbasurales", microbasurales), ("--volcaderos", volcaderos)):
            if not 0 <= v <= 500:
                raise CommandError(f"{nombre} debe estar entre 0 y 500.")
        cursos = list(m.CursoAgua.objects.filter(origen=m.Origen.OFICIAL))
        if not cursos:
            raise CommandError("No hay cursos de agua reales cargados. Ejecutá antes ACTUALIZAR_CURSOS_AGUA.bat "
                               "(la simulación necesita los cursos reales para calcular distancias y ubicar los volcaderos).")
        ids_sim = set(self.simulados().values_list("id", flat=True))
        reales = list(m.Foco.objects.exclude(id__in=ids_sim).only("ubicacion"))
        if reales:
            zona = MultiPoint([f.ubicacion for f in reales], srid=4326).convex_hull.buffer(MARGEN_ZONA)
        else:
            lng0, lat0, lng1, lat1 = settings.GISMAT_BBOX
            zona = MultiPoint([Point(lng0 + .2, lat0 + .1), Point(lng1 - .2, lat1 - .1)], srid=4326).envelope
        zona.srid = 4326
        preparada, borde = zona.prepared, zona.boundary
        rnd_h = random.Random(f"gismat-microbasural-hotspots-{semilla}")
        ctx = {"caja": zona.extent,
               "dentro": lambda x, y: preparada.contains(Point(x, y, srid=4326)),
               "dist_borde": lambda x, y: borde.distance(Point(x, y, srid=4326)) * M_POR_GRADO * math.cos(math.radians(y)),
               "cercano": lambda x, y: geo.curso_mas_cercano(Point(x, y, srid=4326)),
               "lineas": [(c.id, [tuple(p) for p in c.geom.coords]) for c in cursos if c.geom and len(c.geom.coords) >= 2]}
        ctx["hotspots"] = elegir_hotspots(rnd_h, ctx["caja"], ctx["dentro"])

        colocados = [(f.ubicacion.x, f.ubicacion.y, "real") for f in reales]
        existentes = list(self.simulados())
        for f in existentes:
            colocados.append((f.ubicacion.x, f.ubicacion.y, f.tipo))
        ya = {t: sum(1 for f in existentes if f.tipo == t) for t in ("microbasural", "volcadero")}

        hoy = timezone.localdate()
        dens = settings.DENSIDAD_RESIDUOS_T_M3
        residuos = {t.codigo: t for t in m.TipoResiduo.objects.all()}
        if not residuos:
            raise CommandError("No hay tipos de residuo cargados. Ejecutá antes: python manage.py cargar_datos_demo --solo-referencia")
        planes, fallidos = [], []
        for tipo, total in (("microbasural", microbasurales), ("volcadero", volcaderos)):
            for n in range(ya[tipo] + 1, total + 1):        # la cantidad pedida es el total: solo se crean los que faltan
                clave = clave_de(tipo, n)
                lugar = colocar(clave, tipo, semilla, ctx, colocados)
                if lugar is None:
                    fallidos.append(clave)
                    continue
                colocados.append((lugar["lng"], lugar["lat"], tipo))
                at = atributos(clave, tipo, semilla, hoy)
                if at["residuo"] not in residuos:
                    at["residuo"] = next(iter(residuos))
                tr = residuos[at["residuo"]]
                dist = lugar["dist"]

                def irh_fn(vol, est, _d=dist, _f=tr.factor_peligrosidad, _p=at["permeabilidad"]):
                    return calcular_irh(_d, vol, _f, _p, est)

                hist = plan_historial(clave, tipo, semilla, at, hoy, dens, irh_fn)
                mc = geo.microcuenca_de(Point(lugar["lng"], lugar["lat"], srid=4326))
                final = irh_fn(hist["volumen_vigente"], at["estado"])
                planes.append({"clave": clave, "tipo": tipo, "lugar": lugar, "at": at, "hist": hist, "tr": tr, "mc": mc, "irh": final})

        self.informe(planes, fallidos, existentes, microbasurales, volcaderos)
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        if not planes:
            return self.stdout.write("Nada para crear.")
        with transaction.atomic():
            for p in planes:
                self.crear(p, identificar)
        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(planes)} focos simulados creados ({sum(p['tipo'] == 'microbasural' for p in planes)} microbasurales, "
            f"{sum(p['tipo'] == 'volcadero' for p in planes)} volcaderos). Para deshacer: simular_microbasurales --revertir --aplicar"))

    def informe(self, planes, fallidos, existentes, n_mb, n_vc):
        w = self.stdout.write
        w(f"Objetivo: {n_mb} microbasurales y {n_vc} volcaderos · ya cargados por este comando: {len(existentes)} · a crear: {len(planes)}")
        for tipo, rotulo in (("microbasural", "Microbasurales"), ("volcadero", "Volcaderos")):
            ps = [p for p in planes if p["tipo"] == tipo]
            if not ps:
                continue
            niv = {"Crítico": 0, "Moderado": 0, "Bajo": 0}
            for p in ps:
                niv[p["irh"].nivel] += 1
            cerca = sum(1 for p in ps if p["lugar"]["dist"] is not None and p["lugar"]["dist"] <= 100)
            vols = sorted(p["at"]["volumen"] for p in ps)
            w(f"   {rotulo}: {len(ps)} · volumen {vols[0]}–{vols[-1]} m³ · a ≤100 m de un cauce: {cerca} · "
              f"riesgo previsto: {niv['Crítico']} críticos / {niv['Moderado']} moderados / {niv['Bajo']} bajos · "
              f"estados: " + ", ".join(f"{e} {sum(p['at']['estado'] == e for p in ps)}" for e in ("activo", "pendiente", "limpiado")) +
              (f" · recurrentes: {sum(p['at']['recurrente'] for p in ps)}" if tipo == "volcadero" else ""))
        con_mc = sum(1 for p in planes if p["mc"])
        total_mc, sim_mc = m.Microcuenca.objects.count(), m.Microcuenca.objects.filter(origen=m.Origen.SIMULADO).count()
        if total_mc == 0:
            w(self.style.WARNING("LIMITACIÓN: no hay microcuencas cargadas; los focos simulados quedarán sin microcuenca."))
        else:
            w(f"Microcuenca asignada por ubicación: {con_mc} de {len(planes)} (el resto cae fuera de toda microcuenca cargada y queda sin asignar)."
              + (" Las microcuencas disponibles son una aproximación derivada de los cursos reales, no cartografía oficial."
                 if sim_mc else ""))
        if fallidos:
            w(self.style.WARNING(f"No se pudo ubicar {len(fallidos)} focos con las restricciones de separación: {fallidos[:5]}"))

    def crear(self, p, identificar=False):
        lugar, at, tipo = p["lugar"], p["at"], p["tipo"]
        direccion = f"{lugar['contexto']} (aprox. {lugar['lat']:.5f}, {lugar['lng']:.5f})"
        observaciones = ("Reincidente: reaparecen residuos tras limpiezas previas. " if at["recurrente"] else "") + \
            ("Acumulación de residuos voluminosos y escombros." if tipo == "volcadero" else "Residuos domiciliarios dispersos.")
        if identificar:
            direccion = f"SIMULACIÓN · {direccion}"
            observaciones = f"{MARCA} DATOS DE PRUEBA: no corresponde a un relevamiento real. {observaciones}"
        foco = m.Foco(
            tipo=tipo, estado=at["estado"], direccion=direccion[:200], barrio="",
            ubicacion=Point(lugar["lng"], lugar["lat"], srid=4326), tipo_residuo=p["tr"], volumen_m3=p["hist"]["volumen_vigente"],
            superficie_m2=at["superficie"], permeabilidad=at["permeabilidad"], datos_pendientes=[], observaciones=observaciones,
            proxima_accion="" if at["estado"] == "limpiado" else "Programar limpieza y control de reincidencia.")
        foco.codigo = siguiente_codigo(tipo)                           # MB-xxx / VC-xxx, como cualquier foco nuevo
        recalcular(foco, motivo=MOTIVO)                                # cauce, distancia, microcuenca e IRH con la fórmula existente
        m.Foco.objects.filter(pk=foco.pk).update(fecha_registro=at["reg"])
        m.HistorialIRH.objects.bulk_create([
            m.HistorialIRH(foco=foco, fecha_calculo=_aware(t), valor=r.valor, nivel=r.nivel, variables=r.variables, motivo=mo)
            for t, r, mo in p["hist"]["filas"]])
        for iv in p["hist"]["intervenciones"]:
            m.Intervencion.objects.create(
                foco=foco, fecha=iv["fecha"], tipo=iv["tipo"], cuadrilla_texto=iv["cuadrilla"], etiquetas=["simulacion"],
                observaciones=f"{MARCA} Intervención de ejemplo." if identificar else "Limpieza realizada por la cuadrilla.",
                estado="completada", volumen_removido_ton=iv["ton"], irh_antes=iv["irh_antes"], irh_despues=iv["irh_despues"])

    def revertir(self, aplicar):
        qs = self.simulados()
        codigos = sorted(qs.values_list("codigo", flat=True))
        self.stdout.write(f"A eliminar: {len(codigos)} focos cargados por este comando ({', '.join(codigos[:4])}{'...' if len(codigos) > 4 else ''}) "
                          f"con su historial, intervenciones y alertas. No se toca ningún otro foco ni los cursos de agua.")
        if not aplicar:
            return self.stdout.write(self.style.WARNING("DRY-RUN: no se escribió nada. Repetí con --aplicar para ejecutar."))
        with transaction.atomic():
            m.Foco.objects.filter(pk__in=list(qs.values_list("pk", flat=True))).delete()
        self.stdout.write(self.style.SUCCESS(f"Eliminados {len(codigos)} focos cargados por este comando."))
