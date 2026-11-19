"""Metadatos para interpretar los datos y gráficos del frontend (GET /api/metadatos/).

Única fuente de verdad: los umbrales y pesos salen de la configuración real del cálculo del IRH, así que si cambian
(settings / services/irh.py) las pantallas se actualizan solas. Los textos admiten marcadores que el frontend reemplaza
con valores de contexto: {anio}, {mes_actual}.
"""
from django.conf import settings

from .irh import DISTANCIA_MAX_M, PESOS, VOLUMEN_REF_M3

PESOS_ETIQUETA = {
    "proximidad": "Proximidad al curso de agua",
    "volumen": "Volumen de residuos",
    "composicion": "Composición del residuo",
    "permeabilidad": "Permeabilidad del suelo",
    "estado": "Estado del basural",
}


def _niveles():
    crit, mod = settings.IRH_UMBRAL_CRITICO, settings.IRH_UMBRAL_MODERADO
    return [
        {"nivel": "Crítico", "desde": crit, "hasta": 100, "color": "#e53935", "rango": f"{_n(crit)} a 100"},
        {"nivel": "Moderado", "desde": mod, "hasta": crit, "color": "#ff9800", "rango": f"{_n(mod)} a {_n(crit - 0.1)}"},
        {"nivel": "Bajo", "desde": 0, "hasta": mod, "color": "#00c853", "rango": f"0 a {_n(mod - 0.1)}"},
    ]


def _n(v):
    """70 -> '70'; 69.9 -> '69,9' (formato es-AR)."""
    return (f"{v:.1f}".rstrip("0").rstrip(".")).replace(".", ",")


def metadatos():
    crit, mod = settings.IRH_UMBRAL_CRITICO, settings.IRH_UMBRAL_MODERADO
    niveles = _niveles()
    leyenda = f"Crítico ≥ {_n(crit)} · Moderado {_n(mod)}-{_n(crit - 0.1)} · Bajo < {_n(mod)}"
    pesos_txt = ", ".join(f"{PESOS_ETIQUETA[k].lower()} ({round(v * 100)} %)" for k, v in PESOS.items())
    fuente_irh = (f"Índice de Riesgo Hídrico (IRH, 0-100) calculado por el sistema ponderando: {pesos_txt}. "
                  f"Proximidad: máximo a 0 m, nula desde {round(DISTANCIA_MAX_M)} m; volumen: referencia {round(VOLUMEN_REF_M3)} m³. {leyenda}.")
    return {
        "irh": {
            "nombre": "Índice de Riesgo Hídrico",
            "sigla": "IRH",
            "escala": {"min": 0, "max": 100, "unidad": "puntos (0 = sin riesgo, 100 = riesgo máximo)"},
            "umbrales": {"moderado": mod, "critico": crit},
            "niveles": niveles,
            "leyenda": leyenda,
            "pesos": [{"variable": k, "etiqueta": PESOS_ETIQUETA[k], "peso": v} for k, v in PESOS.items()],
            "provisorio": "El IRH es provisorio mientras falten datos por relevar (volumen, permeabilidad o tipo de residuo).",
        },
        "detecciones": {
            "confianza": {
                "unidad": "%", "escala": {"min": 0, "max": 100},
                "descripcion": "Puntaje (0-100 %) que el módulo de IA asigna a su propia detección. No es la precisión del modelo.",
                "rangos": [
                    {"etiqueta": "90-100%", "desde": 90, "nivel": "Muy alta", "color": "#6a1b9a"},
                    {"etiqueta": "80-90%", "desde": 80, "nivel": "Alta", "color": "#7b2cbf"},
                    {"etiqueta": "70-80%", "desde": 70, "nivel": "Media", "color": "#9d4edd"},
                    {"etiqueta": "60-70%", "desde": 60, "nivel": "Baja", "color": "#c77dff"},
                    {"etiqueta": "<60%", "desde": 0, "nivel": "Muy baja", "color": "#e0aaff"},
                ],
            },
            "precision": {
                "formula": "confirmadas / (confirmadas + descartadas)",
                "descripcion": "Porcentaje de las detecciones ya revisadas por una persona que resultaron ser un foco real.",
            },
            "estados": {"nuevo": "En revisión manual", "confirmado": "Confirmada como foco", "descartado": "Descartada"},
            "variablesSatelitales": {
                "vulnHidrica": {"nombre": "Vulnerabilidad Hídrica", "unidad": "% (0-100)",
                                "descripcion": "Índice informado por el módulo de IA: cuánto compromete esta detección a los recursos hídricos cercanos. Mayor = más vulnerable."},
                "escurrimiento": {"nombre": "Afectación de Escurrimiento", "unidad": "% (0-100)",
                                  "descripcion": "Índice informado por el módulo de IA: cuánto afecta al escurrimiento del agua hacia el cauce. Mayor = más afectación."},
                "residuosPeligrosos": {"nombre": "Residuos Peligrosos", "unidad": "% (0-100)",
                                       "descripcion": "Índice informado por el módulo de IA: presencia estimada de residuos peligrosos. Mayor = más presencia."},
                "nota": "Son datos previos: el IRH definitivo se calcula al confirmar el foco.",
            },
        },
        "graficos": {
            "detecciones_mensuales": {
                "mide": "Para cada mes, cuántas anomalías detectó el satélite (área oscura) y cuántas de ellas un operador confirmó como foco real (línea punteada).",
                "unidad": "cantidad de detecciones (número entero)",
                "periodo": "enero a {mes_actual} de {anio}, según la fecha de cada detección",
                "fuente": "Módulo de IA satelital; el estado (confirmada, en revisión, descartada) lo define la validación manual. Respeta la búsqueda y los filtros activos.",
                "comoLeer": [
                    "Eje vertical: cantidad de detecciones. Eje horizontal: mes del año.",
                    "La distancia entre la línea oscura y la punteada son las detecciones que no se confirmaron (en revisión o descartadas).",
                    "Pasá el cursor sobre un punto para ver el desglose del mes: detectadas, confirmadas, en revisión y descartadas.",
                    "El punto azul con * es el mes en curso: su valor todavía puede crecer.",
                ],
            },
            "confianza_ia": {
                "mide": "La cantidad de detecciones que cae en cada rango de confianza del modelo. Una barra alta a la derecha (90-100 %) indica que la mayoría de las detecciones son muy seguras.",
                "unidad": "eje vertical: N.º de detecciones (con su % del total); eje horizontal: confianza en %",
                "periodo": "todas las detecciones que cumplen la búsqueda y los filtros activos, sin límite de fechas",
                "fuente": "Campo «confianza» que informa el módulo de IA para cada detección (0-100). La precisión se calcula como confirmadas / (confirmadas + descartadas).",
                "comoLeer": [
                    "Cada barra es un rango de confianza; su altura y el número sobre ella son la cantidad de detecciones.",
                    "La intensidad del violeta acompaña la confianza: más oscuro = más seguro el modelo de que es un foco.",
                    "Una confianza alta no garantiza que el foco exista: por eso conviene validar las de menor puntaje primero.",
                    "Pasá el cursor sobre una barra para ver el detalle del rango.",
                ],
            },
            "riesgo_por_nivel": {
                "mide": "Cuántos basurales vigentes (no dados de baja) hay en cada nivel de riesgo. Cada porción de la dona es un nivel; su tamaño es proporcional a la cantidad.",
                "unidad": "N.º de basurales y % del total; el nivel surge del IRH (puntaje de 0 a 100)",
                "periodo": "estado actual (foto de hoy), no una evolución en el tiempo",
                "fuente": fuente_irh,
                "comoLeer": [
                    "Rojo = Crítico (atender primero), naranja = Moderado, verde = Bajo. Los arcos arrancan arriba y siguen en sentido horario: primero el rojo, luego naranja y verde.",
                    "El número del centro es el total de basurales vigentes; la tabla de abajo da la cantidad y el porcentaje exactos.",
                    "Los basurales con IRH provisorio (datos sin relevar) también cuentan, con un valor estimado.",
                    "Pasá el cursor sobre un arco para ver su cantidad y porcentaje.",
                ],
            },
            "riesgo_mensual": {
                "mide": "Para cada mes, cuántos basurales estaban en nivel Crítico, Moderado y Bajo. Cada barra es un mes y sus colores apilados suman el total de basurales de ese mes (número sobre la barra).",
                "unidad": "N.º de basurales (el nivel se define con el IRH, de 0 a 100)",
                "periodo": "enero a {mes_actual} de {anio}, medido al último día de cada mes",
                "fuente": "Historial de cálculos del IRH: para cada mes se toma el último IRH conocido de cada basural a esa fecha. Un basural cuenta desde que fue registrado. " + leyenda + ".",
                "comoLeer": [
                    "Eje vertical: cantidad de basurales. Eje horizontal: mes. La escala se ajusta sola para que quepa la barra más alta.",
                    "Si el rojo (Crítico) se agranda mes a mes, el problema se agrava; si crece el verde, hay más basurales bajo control.",
                    "La barra puede crecer simplemente porque se registraron más basurales: comparar siempre la proporción de cada color.",
                    "La barra con * y borde azul es el mes en curso, todavía incompleto.",
                ],
            },
        },
    }
