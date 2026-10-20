"""Casos de uso sobre focos: alta, recálculo de IRH, intervención, baja lógica."""
import re

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import Foco, HistorialIRH, Intervencion
from . import alertas, geo
from .irh import calcular_irh


def siguiente_codigo(tipo):
    prefijo = Foco.PREFIJO.get(tipo, "BR")
    mayor = settings.FOCO_CODIGO_RESERVADO  # IDs reservados del relevamiento original
    for c in Foco.objects.values_list("codigo", flat=True):
        m = re.search(r"(\d+)$", c)
        if m:
            mayor = max(mayor, int(m.group(1)))
    return f"{prefijo}-{mayor + 1:03d}"


def recalcular(foco, motivo="recalculo", guardar_historial=True):
    """Recalcula ubicación derivada (microcuenca, curso, distancia) + IRH, guarda historial y alertas.
    Nunca borra historial previo."""
    with transaction.atomic():
        nivel_ant = foco.nivel_riesgo
        foco.microcuenca = geo.microcuenca_de(foco.ubicacion)
        foco.curso_cercano, foco.distancia_curso_m = geo.curso_mas_cercano(foco.ubicacion)
        pend = set(foco.datos_pendientes or [])
        if foco.tipo_residuo is None:
            pend.add("tipo_residuo")
        foco.datos_pendientes = sorted(pend)
        factor = None if "tipo_residuo" in pend else foco.tipo_residuo.factor_peligrosidad
        volumen = None if "volumen" in pend else foco.volumen_m3
        perm = None if "permeabilidad" in pend else foco.permeabilidad
        r = calcular_irh(foco.distancia_curso_m, volumen, factor, perm, foco.estado)
        foco.irh, foco.nivel_riesgo = r.valor, r.nivel
        foco.save()
        if guardar_historial:
            HistorialIRH.objects.create(foco=foco, valor=r.valor, nivel=r.nivel, variables=r.variables, motivo=motivo)
        alertas.evaluar(foco, nivel_ant)
    return r


def registrar_intervencion(foco, usuario, tipo, observaciones="", cuadrilla=None, cuadrilla_texto="",
                           fecha=None, etiquetas=None, volumen_removido_ton=0, estado=None, resultado=None):
    """Registra la intervención y actualiza el foco (volumen, estado) y su IRH.

    - Se reduce el volumen en toneladas/densidad. Si queda <= 20 m³ el foco pasa a 'limpiado'.
    - `resultado` ('activo'|'pendiente'|'limpiado') fuerza el estado resultante.
    """
    if foco.estado == Foco.Estado.INACTIVO:
        raise ValueError("No se pueden registrar intervenciones sobre un foco dado de baja.")
    estado = estado or Intervencion.Estado.COMPLETADA
    with transaction.atomic():
        irh_antes = foco.irh
        volumen_desconocido = "volumen" in (foco.datos_pendientes or [])
        if estado == Intervencion.Estado.COMPLETADA and volumen_desconocido:
            # Sin volumen relevado no se puede inferir si el foco quedó limpio: solo si el operador lo indica.
            foco.estado = resultado or Foco.Estado.ACTIVO
        elif estado == Intervencion.Estado.COMPLETADA:
            if volumen_removido_ton:
                foco.volumen_m3 = max(0.0, foco.volumen_m3 - volumen_removido_ton / settings.DENSIDAD_RESIDUOS_T_M3)
            if resultado:
                foco.estado = resultado
            elif foco.volumen_m3 <= 20:
                foco.estado = Foco.Estado.LIMPIADO
            else:
                foco.estado = Foco.Estado.ACTIVO
        else:  # programada / en proceso: el foco queda activo con intervención en curso
            if foco.estado == Foco.Estado.PENDIENTE:
                foco.estado = Foco.Estado.ACTIVO
        recalcular(foco, motivo="intervencion")
        return Intervencion.objects.create(
            foco=foco, fecha=fecha or timezone.localdate(), tipo=tipo, observaciones=observaciones,
            cuadrilla=cuadrilla, cuadrilla_texto=cuadrilla_texto or (cuadrilla.nombre if cuadrilla else ""),
            responsable=usuario, etiquetas=etiquetas or [], volumen_removido_ton=volumen_removido_ton,
            estado=estado, irh_antes=irh_antes, irh_despues=foco.irh)


def dar_de_baja(foco, motivo=""):
    """Baja lógica: no se elimina nada; el historial y las intervenciones se conservan."""
    foco.estado = Foco.Estado.INACTIVO
    foco.baja_fecha = timezone.now()
    foco.baja_motivo = motivo[:200]
    recalcular(foco, motivo="baja")
    return foco
