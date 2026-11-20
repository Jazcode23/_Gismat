# Casos de prueba – CU016 Recibir y consultar alerta automática

Ejecutados en navegador real (Playwright) contra el backend Django + PostGIS, con los roles operador, supervisor y administrador.

**Resultado: 9 de 9 casos pasaron.**

| ID | Caso | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| CP-CU016-01 | Un foco que alcanza el IRH crítico genera una alerta automática | Al registrar un foco con IRH crítico se genera una alerta crítica asociada al foco. | Foco BR-013 con IRH 92.9 (Crítico) -> alerta crítica generada: "Alerta hidrológica crítica: foco BR-013 a 53 m de Río Salí (Cauce Principal Troncal) (IRH 92.9)". | Pasó |
| CP-CU016-02 | El Supervisor visualiza la alerta en su panel con la recomendación accionable | La campana muestra la alerta; el panel incluye la recomendación (al menos una acción) y que está dirigida al Supervisor. | Alerta visible en el panel del Supervisor con 2 acción(es) recomendada(s):   Limpieza prioritaria con maquinaria pesada (retroexcavadora y camiones volcadores) Notificación al organismo ambiental correspondiente por residuos de peligrosidad e · Dirigida a: Supervisor. | Pasó |
| CP-CU016-03 | Alerta de advertencia (datos incompletos) con recomendación de relevamiento | Un foco con IRH alto pero datos incompletos genera una advertencia (no crítica) cuya recomendación pide relevar los datos que faltan. | Alerta de ADVERTENCIA para BR-014 con la recomendación: "Relevar en campo permeabilidad del suelo, tipo de residuo, volumen para confirmar el nivel de riesgo y priorizar la intervención.". | Pasó |
| CP-CU016-04 | El panel ordena las alertas por prioridad | Las alertas críticas ("Prioridad Alta") van antes que las de advertencia. | Orden de prioridad correcto en 6 alertas (0,0,0,0,0,1). | Pasó |
| CP-CU016-05 | El Supervisor marca la alerta como atendida | La alerta deja de figurar en el panel y en la lista de activas; el contador baja. | Alerta atendida: sale del panel, queda "atendida" en el servidor y el contador pasa de 6 a 5. | Pasó |
| CP-CU016-06 | El Operador ve las alertas pero no puede marcarlas como atendidas | Sin botón "Marcar como atendida" y la API responde 403. | El operador consulta las alertas; sin botón de atender; API: 403. | Pasó |
| CP-CU016-07 | Error técnico al marcar la alerta como atendida | Se muestra un mensaje de error y la alerta permanece activa. | Mensaje "No se pudo marcar la alerta como atendida, intente nuevamente."; la alerta sigue activa. | Pasó |
| CP-CU016-08 | Al bajar el IRH por debajo del umbral la alerta se cierra sola | Tras sanear el foco la alerta crítica deja de estar activa. | Foco BR-016 saneado (IRH 76): la alerta crítica pasó a "atendida" automáticamente. | Pasó |
| CP-CU016-09 | Sin errores de ejecución en la aplicación | No se registran excepciones en el navegador. | Sin excepciones. | Pasó |

Además hay 3 pruebas automáticas en el backend (`geoportal/tests/test_cu016_alertas.py`): alerta crítica con recomendación y destinatario, el Supervisor marca como atendida (idempotente) y operador/analista no pueden (403).

## Cómo ejecutarlos
Con backend y frontend levantados: `GISMAT_PASS=<clave> node ejecutar-casos-cu016.js` (requiere `npm i playwright`).

## Alcance y límites
- **Notificación dentro de la plataforma:** la alerta aparece en la campana (con contador) y en el panel lateral *Alertas Ambientales y de Riesgo* del Geoportal. No se envían correos ni notificaciones push.
- **Destinatario:** las alertas se identifican como *Dirigida a: Supervisor*. Es una etiqueta del sistema: la alerta no se asigna a un usuario concreto y también la pueden ver los demás roles (consulta). Solo Supervisor y Administrador pueden marcarla como atendida.
- **Panel de seguimiento (CU018):** este documento cubre la consulta y la gestión de alertas desde el panel de alertas. No se implementó una pantalla de seguimiento aparte.
- La recomendación es automática y depende del foco: volumen (maquinaria pesada o cuadrilla), cercanía al cauce (cercos y barreras), peligrosidad del residuo (aviso al organismo ambiental) y tipo volcadero (control nocturno).

## Defectos encontrados y corregidos al implementar el caso de uso
- El servidor generaba la recomendación accionable pero la pantalla no la mostraba: el Supervisor veía la alerta sin la recomendación. Ahora se muestra como lista de acciones.
- La alerta no indicaba a quién estaba dirigida. Ahora muestra *Dirigida a: Supervisor*.
- No había forma de dar por atendida una alerta desde la pantalla, ni el Supervisor tenía permiso. Ahora hay un botón *Marcar como atendida* (Supervisor y Administrador) con mensaje de error si falla.
- El panel mostraba las alertas sin criterio de prioridad. Ahora las críticas van primero.