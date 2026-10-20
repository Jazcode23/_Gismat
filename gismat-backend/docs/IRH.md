# Índice de Riesgo Hídrico (IRH)

Implementado en `geoportal/services/irh.py` → `calcular_irh(distancia_m, volumen_m3, factor_residuo, permeabilidad, estado)`.
Función pura (sin base de datos): la reutilizan alta, modificación, intervención, baja, recálculo manual y confirmación de detecciones IA.

## Fórmula

`IRH = 100 · Σ pesoᵢ · componenteᵢ` (cada componente en [0, 1]) → escala 0-100, un decimal.

| Variable (Plan de Dirección) | Peso | Componente |
|---|---|---|
| Proximidad a curso de agua | 0,35 | `1 − d/300 m` (tope 0) — `d` se calcula con PostGIS (`ST_Distance` sobre *geography*, en metros) |
| Volumen estimado | 0,25 | `√(V / 600 m³)` (tope 1) |
| Composición del residuo | 0,10 | `factor_peligrosidad` del tipo de residuo (0-1, tabla `TipoResiduo`) |
| Permeabilidad del suelo | 0,15 | alta 1,0 · media-alta 0,85 · media 0,6 · media-baja 0,4 · baja 0,2 |
| Estado de intervención | 0,15 | activo/pendiente 1,0 · limpiado 0,15 · inactivo 0 |

Clasificación: **Bajo** < 40 · **Moderado** 40–69,9 · **Crítico** ≥ 70 (`IRH_UMBRAL_*` en `.env`).

## ⚠ Pendiente de validación

El Plan de Dirección define *qué variables* intervienen pero no pesos ni curvas. Los valores de arriba son una **propuesta técnica**
calibrada para que los focos de referencia del frontend caigan en el nivel esperado. Deben ser validados por el equipo y los tutores.
Todo está concentrado en las constantes del inicio de `irh.py`; cambiarlos no requiere tocar nada más (los cálculos viejos quedan en el historial con las variables que usaron).

## Historial

Cada cálculo inserta una fila en `HistorialIRH` (valor, nivel, entradas, componentes, pesos, motivo: `alta`, `modificacion`, `intervencion`, `manual`, `baja`, `migracion`).
Nunca se actualiza ni se borra (el admin de Django lo bloquea).
