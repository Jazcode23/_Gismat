"""Índice de Riesgo Hídrico (IRH). Función pura, sin acceso a base de datos ni al frontend.

IRH = 100 · Σ (peso_i · componente_i),   cada componente ∈ [0, 1]

  proximidad   0.35   1 - d/300 m     (d = distancia al curso de agua más cercano)
  volumen      0.25   √(V/600 m³)     (tope 1)
  composición  0.10   factor de peligrosidad del tipo de residuo (0-1)
  permeabilidad 0.15  alta 1.0 · media-alta .85 · media .6 · media-baja .4 · baja .2
  estado       0.15   activo/pendiente 1.0 · limpiado .15 · inactivo 0

Clasificación: Bajo < 40 · Moderado 40-69,9 · Crítico ≥ 70 (umbrales configurables en settings).

Variables NO relevadas (volumen, permeabilidad o composición = None): se excluyen y los pesos restantes se
renormalizan; el resultado se marca `provisorio` (no inventa datos). Proximidad y estado siempre intervienen.

IMPORTANTE: los pesos y curvas son una PROPUESTA TÉCNICA calibrada contra los datos de
referencia del frontend; el Plan de Dirección define las variables pero no la fórmula.
Deben validarse con el equipo/tutores. Están concentrados acá para ajustarlos en un solo lugar.
"""
from dataclasses import asdict, dataclass
from math import sqrt

from django.conf import settings

PESOS = {"proximidad": 0.35, "volumen": 0.25, "composicion": 0.10, "permeabilidad": 0.15, "estado": 0.15}
DISTANCIA_MAX_M = 300.0
VOLUMEN_REF_M3 = 600.0
PERMEABILIDAD = {"alta": 1.0, "media_alta": 0.85, "media": 0.6, "media_baja": 0.4, "baja": 0.2}
ESTADO = {"activo": 1.0, "pendiente": 1.0, "limpiado": 0.15, "inactivo": 0.0}


@dataclass
class ResultadoIRH:
    valor: float
    nivel: str
    variables: dict

    @property
    def provisorio(self):
        return bool(self.variables.get("pendientes"))

    def as_dict(self):
        return asdict(self)


def clasificar(valor):
    if valor >= settings.IRH_UMBRAL_CRITICO:
        return "Crítico"
    if valor >= settings.IRH_UMBRAL_MODERADO:
        return "Moderado"
    return "Bajo"


def calcular_irh(distancia_m, volumen_m3, factor_residuo, permeabilidad, estado):
    """Devuelve ResultadoIRH con valor en [0, 100] (1 decimal), nivel y variables usadas.

    `volumen_m3`, `factor_residuo` y `permeabilidad` pueden ser None = dato no relevado (IRH provisorio)."""
    if volumen_m3 is not None and volumen_m3 < 0:
        raise ValueError("El volumen debe ser un número >= 0")
    if permeabilidad is not None and permeabilidad not in PERMEABILIDAD:
        raise ValueError(f"Permeabilidad inválida: {permeabilidad}")
    if estado not in ESTADO:
        raise ValueError(f"Estado inválido: {estado}")

    comp = {
        "proximidad": 0.0 if distancia_m is None else max(0.0, 1 - float(distancia_m) / DISTANCIA_MAX_M),
        "estado": ESTADO[estado],
    }
    pendientes = []
    if volumen_m3 is None:
        pendientes.append("volumen")
    else:
        comp["volumen"] = min(1.0, sqrt(float(volumen_m3) / VOLUMEN_REF_M3))
    if factor_residuo is None:
        pendientes.append("composicion")
    else:
        comp["composicion"] = min(1.0, max(0.0, float(factor_residuo)))
    if permeabilidad is None:
        pendientes.append("permeabilidad")
    else:
        comp["permeabilidad"] = PERMEABILIDAD[permeabilidad]

    peso_total = sum(PESOS[k] for k in comp)
    valor = round(min(100.0, max(0.0, 100 * sum(PESOS[k] * v for k, v in comp.items()) / peso_total)), 1)
    return ResultadoIRH(
        valor=valor,
        nivel=clasificar(valor),
        variables={
            "entradas": {"distancia_curso_m": distancia_m, "volumen_m3": volumen_m3,
                         "factor_residuo": factor_residuo, "permeabilidad": permeabilidad, "estado": estado},
            "componentes": {k: round(v, 3) for k, v in comp.items()},
            "pesos": PESOS,
            "pendientes": pendientes,
        },
    )
