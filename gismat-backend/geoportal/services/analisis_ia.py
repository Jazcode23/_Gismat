"""Análisis satelital SIMULADO: genera detecciones preliminares nuevas (pendientes de validación) para la demostración.

No hay un modelo de IA real detrás: cada detección se ubica cerca de los focos conocidos de la zona de estudio, con atributos
plausibles, y se guarda con origen = "simulado" (la pantalla la muestra como SIMULADO). El punto de integración del módulo real
es POST /api/detecciones-ia/, que inserta detecciones con estado "nuevo" exactamente igual.
"""
import math
import random

from django.contrib.gis.geos import Point
from django.utils import timezone

from .. import models as m
from ..management.commands.ajustar_detecciones_cursos import vulnerabilidad
from ..management.commands.simular_detecciones_ia import detalle_relleno, elegir_tipo
from . import geo

MAX_POR_ANALISIS = 8
SEPARACION_MIN_M = 60.0   # no se ubica sobre un foco o detección que ya existe
DIST_CAUCE_RELACIONADO = 400.0


def _metros(lat1, lng1, lat2, lng2):
    k = 111_320.0
    return math.hypot((lat1 - lat2) * k, (lng1 - lng2) * k * math.cos(math.radians(lat1)))


def ejecutar_analisis_simulado(cantidad=None, semilla=None):
    """Crea entre 3 y 6 detecciones nuevas (o `cantidad`, hasta MAX_POR_ANALISIS). Devuelve las detecciones creadas."""
    rnd = random.Random(semilla if semilla is not None else timezone.now().timestamp())
    n = max(1, min(int(cantidad), MAX_POR_ANALISIS)) if cantidad else rnd.randint(3, 6)
    focos = list(m.Foco.objects.exclude(estado="inactivo").only("ubicacion"))
    if not focos:
        return []
    ocupados = [(f.ubicacion.y, f.ubicacion.x) for f in focos] + [
        (d.ubicacion.y, d.ubicacion.x) for d in m.DeteccionIA.objects.only("ubicacion")]
    hoy = timezone.localdate()
    creadas = []
    for _ in range(n * 30):  # intentos: se descartan puntos demasiado cerca de algo existente
        if len(creadas) == n:
            break
        base = rnd.choice(focos).ubicacion
        ang, dist = rnd.uniform(0, 2 * math.pi), rnd.uniform(150, 1400)
        lat = base.y + (dist * math.sin(ang)) / 111_320.0
        lng = base.x + (dist * math.cos(ang)) / (111_320.0 * math.cos(math.radians(base.y)))
        if any(_metros(lat, lng, a, b) < SEPARACION_MIN_M for a, b in ocupados):
            continue
        tipo = elegir_tipo(rnd)
        at = detalle_relleno(f"analisis-{timezone.now().timestamp()}-{len(creadas)}-{rnd.random()}", tipo, "nuevo", 0)
        punto = Point(lng, lat, srid=4326)
        curso, d_curso = geo.curso_mas_cercano(punto)
        cerca = curso is not None and d_curso is not None and d_curso <= DIST_CAUCE_RELACIONADO
        vh = vulnerabilidad(d_curso, at["ruido_vh"]) if cerca else rnd.randint(20, 45)
        creadas.append(m.DeteccionIA.objects.create(
            ubicacion=punto, direccion=f"Zona analizada (aprox. {lat:.5f}, {lng:.5f})", confianza=at["confianza"], area_m2=at["area"],
            fecha=hoy, estado="nuevo", cauce=f"{curso.nombre.upper()} (Cauce)"[:120] if cerca else "",
            distancia_curso_m=round(d_curso) if cerca else None, pendiente=at["pendiente"], densidad=at["densidad"],
            vulnerabilidad_hidrica=vh, escurrimiento=at["esc"], residuos_peligrosos=at["rp"], tipo_foco=tipo, origen="simulado"))
        ocupados.append((lat, lng))
    return creadas
