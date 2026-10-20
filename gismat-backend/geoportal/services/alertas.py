"""Generación de alertas cuando un foco supera el umbral crítico de IRH.

Los textos hablan de RIESGO y POSIBILIDAD de afectación; no afirman contaminación química
real del agua (directiva técnica del proyecto).
"""
from django.conf import settings

from ..models import Alerta, Foco


def recomendacion_para(foco):
    acciones = []
    d = foco.distancia_curso_m
    if foco.volumen_m3 >= 300:
        acciones.append("Limpieza prioritaria con maquinaria pesada (retroexcavadora y camiones volcadores)")
    else:
        acciones.append("Limpieza prioritaria con cuadrilla de saneamiento")
    if d is not None and d <= 30:
        acciones.append("refuerzo de cercos y barreras de contención entre el foco y el cauce")
    if foco.tipo_residuo and foco.tipo_residuo.factor_peligrosidad >= 0.7:
        acciones.append("notificación al organismo ambiental correspondiente por residuos de peligrosidad elevada")
    if foco.tipo == Foco.Tipo.VOLCADERO:
        acciones.append("operativo de control nocturno para evitar nuevos vuelcos")
    return "; ".join(acciones) + "."


def _crear_critica(foco):
    d = foco.distancia_curso_m
    curso = foco.curso_cercano.nombre if foco.curso_cercano else "curso de agua"
    tipo = Alerta.Tipo.PROXIMIDAD if (d is not None and d <= 30) else Alerta.Tipo.IRH
    dist_txt = f" a {round(d)} m de {curso}" if d is not None else ""
    return Alerta.objects.create(
        foco=foco, microcuenca=foco.microcuenca, tipo=tipo, nivel=Alerta.Nivel.CRITICA,
        titulo=f"Alerta hidrológica crítica: foco {foco.codigo}{dist_txt} (IRH {foco.irh:g})",
        mensaje=(f"El foco {foco.codigo} ({foco.direccion}) alcanzó un IRH de {foco.irh:g}, por encima del umbral "
                 f"crítico de {settings.IRH_UMBRAL_CRITICO:g}. Existe riesgo de arrastre de residuos hacia {curso} "
                 f"y posibilidad de afectación del cauce ante lluvias."),
        recomendacion=recomendacion_para(foco))


def _crear_provisoria(foco):
    curso = foco.curso_cercano.nombre if foco.curso_cercano else "curso de agua"
    faltan = ", ".join({"volumen": "volumen", "permeabilidad": "permeabilidad del suelo",
                        "tipo_residuo": "tipo de residuo"}.get(d, d) for d in foco.datos_pendientes)
    return Alerta.objects.create(
        foco=foco, microcuenca=foco.microcuenca, tipo=Alerta.Tipo.IRH, nivel=Alerta.Nivel.ADVERTENCIA,
        titulo=f"IRH provisorio elevado: foco {foco.codigo} (IRH {foco.irh:g}, datos incompletos)",
        mensaje=(f"El foco {foco.codigo} ({foco.direccion}) supera el umbral crítico ({settings.IRH_UMBRAL_CRITICO:g}) "
                 f"con las variables disponibles (cercanía a {curso} y estado), pero faltan: {faltan}. "
                 f"No se declara alerta crítica hasta completar el relevamiento."),
        recomendacion=f"Relevar en campo {faltan} para confirmar el nivel de riesgo y priorizar la intervención.")


def evaluar(foco, nivel_anterior=None):
    """Sincroniza las alertas del foco con su IRH actual. Devuelve la alerta creada (o None).

    - IRH completo >= umbral  -> alerta CRÍTICA con recomendación de intervención.
    - IRH provisorio >= umbral -> alerta de ADVERTENCIA que pide completar el relevamiento (no afirma criticidad).
    """
    propias = foco.alertas.filter(estado=Alerta.Estado.ACTIVA, tipo__in=[Alerta.Tipo.PROXIMIDAD, Alerta.Tipo.IRH])
    if foco.estado == Foco.Estado.INACTIVO:
        foco.alertas.filter(estado=Alerta.Estado.ACTIVA).update(estado=Alerta.Estado.ATENDIDA)
        return None

    es_alto = foco.irh >= settings.IRH_UMBRAL_CRITICO and foco.estado in (Foco.Estado.ACTIVO, Foco.Estado.PENDIENTE)
    if es_alto:
        nivel = Alerta.Nivel.ADVERTENCIA if foco.irh_provisorio else Alerta.Nivel.CRITICA
        propias.exclude(nivel=nivel).update(estado=Alerta.Estado.ATENDIDA)  # p. ej. la provisoria al completar datos
        if propias.filter(nivel=nivel).exists():
            return None
        return _crear_provisoria(foco) if foco.irh_provisorio else _crear_critica(foco)

    # Dejó de ser alto: se cierran las alertas propias abiertas
    criticas = propias.filter(nivel=Alerta.Nivel.CRITICA).count()
    propias.update(estado=Alerta.Estado.ATENDIDA)
    if criticas and foco.estado == Foco.Estado.LIMPIADO:
        return Alerta.objects.create(
            foco=foco, microcuenca=foco.microcuenca, tipo=Alerta.Tipo.LIXIVIADOS, nivel=Alerta.Nivel.INFO,
            estado=Alerta.Estado.ATENDIDA,
            titulo=f"Notificación de intervención: foco {foco.codigo} saneado (IRH {foco.irh:g})",
            mensaje=f"El IRH del foco {foco.codigo} bajó por debajo del umbral crítico tras la intervención.",
            recomendacion="Inspección periódica de mantenimiento preventivo para evitar reincidencia.")
    return None
