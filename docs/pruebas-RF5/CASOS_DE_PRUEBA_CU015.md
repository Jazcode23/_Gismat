# Casos de prueba – CU015 Validar detección de IA

Ejecutados en navegador real (Playwright) contra el backend Django + PostGIS, con los roles operador, analista y supervisor. Las detecciones se cargaron por la misma API que usaría el módulo de IA.

**Resultado: 13 de 13 casos pasaron.**

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
| CP-CU015-13 | Sin errores de ejecución en la aplicación | No se registran excepciones en el navegador. | Sin excepciones. | Pasó |

Además hay 7 pruebas automáticas en el backend (`geoportal/tests/test_cu015_validar_deteccion.py`): confirmar crea foco con IRH, confirmar dos veces no duplica, descartar, no descartar una ya confirmada, fallo técnico atómico (sin foco huérfano y la detección sigue pendiente), permisos por rol y datos de ubicación/fecha.

## Cómo ejecutarlos
Con backend y frontend levantados: `GISMAT_PASS=<clave> node ejecutar-casos-cu015.js` (requiere `npm i playwright`).

## Notas y límites
- La imagen satelital es una imagen aérea de referencia (Esri) centrada en la ubicación sugerida, con el punto sugerido y la superficie detectada dibujados. No es la captura exacta del satélite que originó la detección: esa captura no se almacena. La *fecha de captura* que se muestra es la fecha de la detección.
- El entorno de prueba no tiene salida a internet hacia el proveedor de imágenes, por eso en las capturas el mapa aparece sin imagen de fondo. Se verificó que el visor solicita las teselas satelitales, que dibuja la ubicación y la superficie y que se puede ampliar.
- Los datos cargados por la demo son simulados y se identifican como tales en pantalla.

## Defectos encontrados y corregidos al implementar el caso de uso
- El botón DESCARTAR solo cerraba la ventana: no descartaba nada. Ahora descarta (con confirmación), persiste el estado y la detección sale de las pendientes.
- El mensaje de éxito mostraba siempre "IRH 0.84". Ahora muestra el IRH real calculado y el foco generado.
- La imagen era un dibujo decorativo. Ahora es una imagen satelital de referencia con la ubicación sugerida, ampliable.
- Confirmar no era atómico: un fallo a mitad de camino podía dejar un foco sin vincular. Ahora es todo o nada.
- El error técnico usaba una alerta del navegador; ahora se muestra el mensaje del caso de uso dentro de la ventana.
- El supervisor veía los botones de confirmar y descartar aunque el servidor los rechazaba (403). Ahora solo consulta.