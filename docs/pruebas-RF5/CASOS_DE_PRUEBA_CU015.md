# Casos de prueba – CU015 Validar detección de IA

Ejecutados en navegador real (Playwright) contra el backend Django + PostGIS, con los roles operador, analista y supervisor. Las detecciones de prueba se cargaron por la misma API que usaría el módulo de IA.

**Resultado: 17 de 17 casos pasaron.**

| ID | Caso | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| CP-CU015-01 | Precondición y listado: se listan las detecciones pendientes con ubicación y fecha | En la pestaña "Nuevos" figuran las detecciones preliminares pendientes, con su ubicación sugerida y fecha. | 9 detecciones pendientes listadas; la fila muestra ubicación, fecha y estado "Nuevo / Pendiente IRH". | Pasó |
| CP-CU015-02 | Paso 3-4: se muestra la imagen satelital y la ubicación sugerida | Al abrir la detección se ve la imagen satelital con la ubicación sugerida marcada. | Visor satelital con la ubicación sugerida (punto) y la superficie detectada (círculo); 6 teselas de imagen solicitadas. Coordenadas -26.8222, -65.2185. | Pasó |
| CP-CU015-03 | Fecha de captura satelital visible | Se informa la fecha de captura satelital de la detección. | Fecha de captura satelital: 19/11/2026 Superficie detectada: ~420 m² | Pasó |
| CP-CU015-04 | Flujo 5a: ampliar la imagen antes de decidir y volver al paso 5 | Se amplía la imagen y se consulta la fecha de captura; al cerrar vuelve la pantalla de decisión con los botones. | Imagen ampliada (192 px -> 680 px de alto) con fecha de captura; al cerrar vuelve a CONFIRMAR / DESCARTAR. | Pasó |
| CP-CU015-05 | Paso 5-6: confirmar incorpora el foco y calcula el IRH | La detección pasa a Confirmada, se crea el foco con IRH calculado y se informa; deja de estar pendiente. | Foco BR-013 creado (estado Pendiente) con IRH 43.1 (Moderado); el mensaje informa el IRH real; la detección ya no figura en "Nuevos". | Pasó |
| CP-CU015-06 | Confirmada: el foco queda registrado en el ABM de basurales | El foco generado por la detección aparece en Basurales (CU005 disparado). | El foco BR-013 figura en el visor y en la lista de focos. | Pasó |
| CP-CU015-07 | Descartar: la detección deja de figurar entre las pendientes y no se crea foco | Se pide confirmación, la detección queda Descartada, sale de "Nuevos" y no se crea ningún foco. | Pidió confirmación, la detección quedó Descartada (persistido), salió de "Nuevos", figura en "Descartados" y no se creó ningún foco. | Pasó |
| CP-CU015-08 | Descartar: se puede volver atrás sin cambios | Al elegir "Volver" la detección sigue pendiente. | Sin cambios: la detección sigue "Nuevo". | Pasó |
| CP-CU015-09 | Flujo 6a: error técnico al confirmar | Se muestra un mensaje de error y la detección permanece pendiente (sin foco creado). | Mensaje de error del caso de uso mostrado; la detección sigue pendiente, sin foco creado, y se puede reintentar. | Pasó |
| CP-CU015-10 | Flujo 6a: tras el error se puede reintentar y la confirmación funciona | Al reintentar sin la falla, la detección se confirma. | Reintento exitoso: foco BR-014, IRH 49.3. | Pasó |
| CP-CU015-11 | Una detección ya resuelta no puede volver a validarse | Al abrir una detección confirmada o descartada no se ofrecen los botones y se indica su estado. | Sin botones; la API rechaza confirmar una descartada (400). | Pasó |
| CP-CU015-12 | Rol Analista también puede validar; Supervisor solo consulta | El analista confirma; el supervisor ve la detección pero no puede confirmar ni descartar (UI y API 403). | Analista: puede validar. Supervisor: consulta; confirmar/descartar -> 403 y sin cambios. | Pasó |
| CP-CU015-13 | La pestaña "Nuevos" explica que sirve para confirmar o descartar | En "Nuevos" se indica que son pendientes de validación y que cada una se confirma o se descarta; la fila ofrece "Validar". | Banner "Nuevos = pendientes de validación" con las acciones confirmar / descartar; botón "Validar" en cada fila pendiente; la ayuda solo aparece en "Nuevos". | Pasó |
| CP-CU015-14 | Procesar nuevas imágenes: el módulo de IA (simulado) genera detecciones preliminares pendientes | Se muestra el avance del análisis, se generan detecciones nuevas marcadas como SIMULADO y quedan en "Nuevos" para validar. | El análisis generó 4 detecciones preliminares (pendientes 6 -> 10), todas marcadas SIMULADO; "Revisar pendientes" lleva a la pestaña Nuevos. | Pasó |
| CP-CU015-15 | Las detecciones generadas por el análisis se pueden validar (confirmar y descartar) | Una generada se confirma (crea foco con IRH) y otra se descarta. | AI-013 confirmada -> foco MB-015 (IRH 51.6); AI-012 descartada; se creó un solo foco. | Pasó |
| CP-CU015-16 | El supervisor no puede ejecutar el análisis | El botón "Procesar Nuevas Imágenes" está deshabilitado y la API responde 403. | Botón deshabilitado; API: 403. | Pasó |
| CP-CU015-17 | Sin errores de ejecución en la aplicación | No se registran excepciones en el navegador. | Sin excepciones. | Pasó |

Además hay 10 pruebas automáticas en el backend (`geoportal/tests/test_cu015_validar_deteccion.py`): confirmar crea foco con IRH, confirmar dos veces no duplica, descartar, no descartar una ya confirmada, fallo técnico atómico (sin foco huérfano y la detección sigue pendiente), permisos por rol, datos de ubicación/fecha y el análisis simulado.

## Cómo ejecutarlos
Con backend y frontend levantados: `GISMAT_PASS=<clave> node ejecutar-casos-cu015.js` (requiere `npm i playwright`).

## Qué es real y qué es simulado
- **Real:** el flujo de validación (listar pendientes, ver imagen y ubicación, ampliar, confirmar → foco + IRH, descartar), los permisos por rol, la atomicidad ante errores y el punto de entrada para el módulo de IA (`POST /api/detecciones-ia/`).
- **Simulado:** la generación de las detecciones. No hay un modelo de IA ni procesamiento de imágenes Sentinel-2: el botón *Procesar Nuevas Imágenes* ejecuta un análisis de demostración (`POST /api/detecciones-ia/analizar/`) que crea detecciones preliminares plausibles cerca de los focos conocidos. Todas quedan marcadas como SIMULADO en pantalla y en las exportaciones.
- **Imagen satelital:** es una imagen aérea de referencia (Esri) centrada en la ubicación sugerida, con el punto sugerido y la superficie detectada dibujados. No es la captura exacta que originó la detección. La *fecha de captura* mostrada es la fecha de la detección.
- El entorno de prueba no tiene salida a internet hacia el proveedor de imágenes, por eso en las capturas el mapa aparece sin fondo. Se verificó que el visor solicita las teselas, dibuja la ubicación y la superficie y se puede ampliar.

## Defectos encontrados y corregidos al implementar el caso de uso
- El botón DESCARTAR solo cerraba la ventana: no descartaba nada. Ahora descarta (con confirmación), persiste el estado y la detección sale de las pendientes.
- El mensaje de éxito mostraba siempre "IRH 0.84". Ahora muestra el IRH real calculado y el foco generado.
- La imagen era un dibujo decorativo. Ahora es una imagen satelital de referencia con la ubicación sugerida, ampliable.
- Confirmar no era atómico: un fallo a mitad de camino podía dejar un foco sin vincular. Ahora es todo o nada.
- El error técnico usaba una alerta del navegador; ahora se muestra el mensaje del caso de uso dentro de la ventana.
- El supervisor veía los botones de confirmar y descartar aunque el servidor los rechazaba (403). Ahora solo consulta.
- El botón *Procesar Nuevas Imágenes* solo mostraba un aviso del navegador. Ahora ejecuta el análisis simulado.
- La pestaña *Nuevos* no explicaba su función. Ahora indica que son detecciones pendientes de validación que se confirman o se descartan.