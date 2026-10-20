"""Reportes ambientales en PDF (reportlab) y CSV."""
import csv
import json
import io

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import geo

COLUMNAS = ["Código", "Ubicación", "Tipo", "Estado", "Lat", "Lng", "IRH", "Nivel", "Microcuenca",
            "Dist. curso (m)", "Volumen m³", "Intervenciones"]


def _fila(f):
    return [f.codigo, f.direccion, f.get_tipo_display(), f.get_estado_display(), round(f.ubicacion.y, 5),
            round(f.ubicacion.x, 5), f.irh, f.nivel_riesgo, f.microcuenca.nombre if f.microcuenca else "-",
            round(f.distancia_curso_m) if f.distancia_curso_m is not None else "-", round(f.volumen_m3),
            len(f.intervenciones.all())]


def generar_csv(focos):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNAS)
    for f in focos:
        w.writerow(_fila(f))
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def generar_pdf(focos, usuario=None):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=28, bottomMargin=28,
                            title="Reporte ambiental GISMAT")
    st = getSampleStyleSheet()
    focos = list(focos)
    el = [Paragraph("GISMAT - Reporte ambiental de focos de residuos", st["Title"]),
          Paragraph(f"San Miguel de Tucumán · generado {timezone.localtime():%d/%m/%Y %H:%M}"
                    + (f" · por {usuario.nombre_completo}" if usuario else ""), st["Normal"]), Spacer(1, 10)]

    crit = sum(1 for f in focos if f.nivel_riesgo == "Crítico")
    prom = round(sum(f.irh for f in focos) / len(focos), 1) if focos else 0
    el += [Paragraph(f"Focos incluidos: <b>{len(focos)}</b> · Críticos: <b>{crit}</b> · IRH promedio: <b>{prom}</b>",
                     st["Normal"]), Spacer(1, 8), Paragraph("Detalle de focos", st["Heading2"])]
    celda = ParagraphStyle("celda", parent=st["Normal"], fontSize=6.5, leading=7.6)
    ENVOLVER = (1, 3, 8)   # Ubicación, Estado y Microcuenca pueden ser largos: se parten en renglones
    datos = [COLUMNAS] + [[Paragraph(str(v), celda) if i in ENVOLVER else v for i, v in enumerate(_fila(f))] for f in focos]
    t = Table(datos, repeatRows=1, colWidths=[40, 170, 38, 80, 44, 44, 28, 44, 140, 54, 44, 52])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f4c75")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 6.5), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    el += [t, Spacer(1, 12), Paragraph("Análisis por microcuenca", st["Heading2"])]
    filas = [["Microcuenca", "Focos activos", "Críticos", "IRH promedio", "Carga acumulada", "Nivel"]]
    for r in geo.carga_por_microcuenca():
        filas.append([Paragraph(r["microcuenca"].nombre, celda), r["focos_activos"], r["focos_criticos"], r["irh_promedio"],
                      r["carga_acumulada"], r["nivel_riesgo"]])
    t2 = Table(filas, repeatRows=1, colWidths=[300, 70, 60, 70, 90, 70])
    t2.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f4c75")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTSIZE", (0, 0), (-1, -1), 7), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey)]))
    el.append(t2)
    doc.build(el)
    return buf.getvalue()


# ------------------------------------------------------------------ Detecciones de IA
COLUMNAS_DETECCION = ["Código", "Fecha", "Tipo de foco", "Dirección", "Lat", "Lng", "Confianza (%)", "Estado", "Riesgo (foco asociado)",
                      "IRH (foco asociado)", "Cauce", "Distancia al curso (m)", "Área (m²)", "Pendiente", "Densidad urbana",
                      "Vulnerabilidad hídrica (%)", "Escurrimiento (%)", "Residuos peligrosos (%)", "Foco asociado", "Origen"]
TIPOS_ROTULO = {"basural": "Basural", "microbasural": "Microbasural", "volcadero": "Volcadero clandestino"}


def _coordenadas_validas(d):
    """True si la detección tiene un punto con longitud/latitud dentro de los rangos geográficos (WGS 84)."""
    u = d.ubicacion
    return u is not None and -180 <= u.x <= 180 and -90 <= u.y <= 90


def _tipo_efectivo(d):
    return d.tipo_foco or (d.foco.tipo if d.foco_id else "")


def _origen_rotulo(d):
    return "Simulado (datos de prueba)" if d.origen == "simulado" else "Real"


def _fila_deteccion(d):
    return [d.codigo, d.fecha.isoformat(), TIPOS_ROTULO.get(_tipo_efectivo(d), ""), d.direccion, round(d.ubicacion.y, 6),
            round(d.ubicacion.x, 6), d.confianza, d.get_estado_display(), d.foco.nivel_riesgo if d.foco_id else "",
            d.foco.irh if d.foco_id else "", d.cauce, "" if d.distancia_curso_m is None else d.distancia_curso_m, d.area_m2,
            d.pendiente, d.densidad, d.vulnerabilidad_hidrica, d.escurrimiento, d.residuos_peligrosos,
            d.foco.codigo if d.foco_id else "", _origen_rotulo(d)]


def generar_csv_detecciones(dets):
    """CSV (UTF-8 con BOM para que Excel respete las tildes, separador coma, fin de línea CRLF). Omite las que no tengan
    coordenadas válidas."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNAS_DETECCION)
    for d in dets:
        if _coordenadas_validas(d):
            w.writerow(_fila_deteccion(d))
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def generar_geojson_detecciones(dets):
    """FeatureCollection RFC 7946: puntos [longitud, latitud] en WGS 84. Omite las que no tengan coordenadas válidas."""
    feats, simuladas = [], 0
    for d in dets:
        if not _coordenadas_validas(d):
            continue
        simuladas += d.origen == "simulado"
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(d.ubicacion.x, 7), round(d.ubicacion.y, 7)]},
            "properties": {"codigo": d.codigo, "fecha": d.fecha.isoformat(), "tipo_foco": _tipo_efectivo(d), "direccion": d.direccion,
                           "confianza": d.confianza, "estado": d.estado, "riesgo": d.foco.nivel_riesgo if d.foco_id else None,
                           "irh": d.foco.irh if d.foco_id else None, "cauce": d.cauce, "distancia_curso_m": d.distancia_curso_m,
                           "area_m2": d.area_m2, "pendiente": d.pendiente, "densidad": d.densidad,
                           "vulnerabilidad_hidrica": d.vulnerabilidad_hidrica, "escurrimiento": d.escurrimiento,
                           "residuos_peligrosos": d.residuos_peligrosos, "foco": d.foco.codigo if d.foco_id else None,
                           "origen": "simulado" if d.origen == "simulado" else "real", "simulado": d.origen == "simulado"},
        })
    fc = {"type": "FeatureCollection", "features": feats}
    if simuladas:   # miembro extra permitido por RFC 7946: deja constancia de que hay datos de prueba en el archivo
        fc["aviso"] = (f"{simuladas} de {len(feats)} detecciones son SIMULADAS (datos de prueba, origen = simulado): "
                       f"no son detecciones reales ni observaciones verificadas en campo.")
    return json.dumps(fc, ensure_ascii=False).encode("utf-8")
