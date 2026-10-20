"""Lógica geoespacial (PostGIS). Las distancias se calculan sobre geography => metros reales."""
from django.contrib.gis.geos import Point, Polygon
from django.db import connection
from django.db.models import Avg, Count, Q, Sum

from ..models import CursoAgua, Foco, Microcuenca

VIGENTES = ~Q(estado=Foco.Estado.INACTIVO)
ACTIVOS = Q(estado__in=[Foco.Estado.ACTIVO, Foco.Estado.PENDIENTE])


def microcuenca_de(punto):
    """Microcuenca que contiene al punto (ST_Contains)."""
    return Microcuenca.objects.filter(geom__contains=punto).first()


def curso_mas_cercano(punto):
    """(CursoAgua, metros) del curso más próximo, usando ST_Distance sobre geography."""
    tabla = CursoAgua._meta.db_table
    with connection.cursor() as c:
        c.execute(
            f"SELECT id, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography) AS d "
            f"FROM {tabla} ORDER BY d LIMIT 1", [punto.x, punto.y])
        fila = c.fetchone()
    if not fila:
        return None, None
    return CursoAgua.objects.get(pk=fila[0]), round(fila[1], 1)


def focos_en_radio(punto, metros):
    """Focos a menos de `metros` del punto (ST_DWithin geography). Devuelve queryset."""
    tabla = Foco._meta.db_table
    with connection.cursor() as c:
        c.execute(
            f"SELECT id FROM {tabla} WHERE ST_DWithin(ubicacion::geography, "
            f"ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography, %s)", [punto.x, punto.y, metros])
        ids = [r[0] for r in c.fetchall()]
    return Foco.objects.filter(pk__in=ids)


def focos_en_bbox(lat_min, lng_min, lat_max, lng_max):
    """Filtro por zona rectangular (ST_Intersects con envolvente)."""
    caja = Polygon.from_bbox((lng_min, lat_min, lng_max, lat_max))
    caja.srid = 4326
    return Foco.objects.filter(ubicacion__intersects=caja)


def focos_en_microcuenca(microcuenca):
    return Foco.objects.filter(ubicacion__within=microcuenca.geom)


def superficie_km2(microcuenca):
    """Área real en km² (geography) salvo que esté declarada."""
    if microcuenca.superficie_km2_declarada:
        return microcuenca.superficie_km2_declarada
    tabla = Microcuenca._meta.db_table
    with connection.cursor() as c:
        c.execute(f"SELECT ST_Area(geom::geography)/1e6 FROM {tabla} WHERE id=%s", [microcuenca.pk])
        return round(c.fetchone()[0], 2)


def longitud_km(curso):
    tabla = CursoAgua._meta.db_table
    with connection.cursor() as c:
        c.execute(f"SELECT ST_Length(geom::geography)/1000 FROM {tabla} WHERE id=%s", [curso.pk])
        return round(c.fetchone()[0], 1)


def nivel_de(irh):
    from .irh import clasificar
    return clasificar(irh)


def carga_por_microcuenca():
    """Carga acumulada de riesgo por microcuenca. Una consulta agregada.

    carga_acumulada = Σ IRH de los focos activos/pendientes (cuánto riesgo suma la cuenca);
    irh_promedio    = promedio de esos mismos focos (o de los vigentes si ya no hay activos).
    """
    out = []
    qs = (Microcuenca.objects.order_by("id").annotate(
        total=Count("focos", filter=Q(focos__estado__in=["activo", "pendiente", "limpiado"])),
        activos=Count("focos", filter=Q(focos__estado__in=["activo", "pendiente"])),
        criticos=Count("focos", filter=Q(focos__estado__in=["activo", "pendiente"], focos__nivel_riesgo="Crítico")),
        carga=Sum("focos__irh", filter=Q(focos__estado__in=["activo", "pendiente"])),
        prom_act=Avg("focos__irh", filter=Q(focos__estado__in=["activo", "pendiente"])),
        prom_vig=Avg("focos__irh", filter=Q(focos__estado__in=["activo", "pendiente", "limpiado"])),
        volumen=Sum("focos__volumen_m3", filter=Q(focos__estado__in=["activo", "pendiente"])),
    ))
    for m in qs:
        prom = m.prom_act if m.prom_act is not None else (m.prom_vig or 0)
        out.append({"microcuenca": m, "focos_totales": m.total, "focos_activos": m.activos,
                    "focos_criticos": m.criticos, "carga_acumulada": round(m.carga or 0, 1),
                    "irh_promedio": round(prom, 1), "nivel_riesgo": nivel_de(prom),
                    "volumen_m3": round(m.volumen or 0, 1)})
    return out


def punto(lat, lng):
    return Point(float(lng), float(lat), srid=4326)
