# Casos de prueba – ABM de basurales (RF5) y Fotografías de Campo

Basados en CU005 (Registrar foco), CU006 (Modificar foco), CU007 (Dar de baja) y CU008 (Consultar foco).
Ejecutados en navegador real (Playwright) contra el backend Django + PostGIS, con los roles operador, analista, administrador y supervisor.

**Resultado: 34 de 34 casos pasaron.**

| ID | CU | Caso | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|---|
| CP-CU005-01 | CU005 | Alta exitosa con todos los datos y fotografía de campo | El foco se registra con código, IRH calculado y categoría; queda en la lista y visible en el visor; la foto se guarda. | MB-013 registrado. IRH calculado: 55 (Moderado). Foto cargada; figura en la lista y en el visor. | Pasó |
| CP-CU005-02 | CU005 | Alta con datos mínimos: variables sin relevar | Se registra con solo los obligatorios; el IRH queda provisorio y se informa qué datos faltan. | BR-014 registrado. IRH calculado: 30 (Bajo), provisorio hasta relevar los datos pendientes. | Pasó |
| CP-CU005-03 | CU005 | Indicar la ubicación haciendo clic en el mapa (paso 3) | El clic en el mapa completa latitud y longitud dentro del área de San Miguel de Tucumán y el foco se registra con esa ubicación. | Clic en el mapa -> latitud -26.824071, longitud -65.222569. BR-015 registrado. IRH calculado: 30 (Bajo), provisorio hasta relevar los datos pendientes. | Pasó |
| CP-CU005-04 | CU005 | Flujo 6a: faltan datos obligatorios | No se registra; se indican los campos a corregir y el formulario permanece abierto (retorna al paso 5). | Mensajes: dirección obligatoria, latitud obligatoria, longitud obligatoria. No se creó ningún foco. | Pasó |
| CP-CU005-05 | CU005 | Flujo 6a: formato inválido (volumen negativo, coordenadas no numéricas) | Se rechaza indicando el campo y el motivo. | Latitud no numérica y volumen negativo rechazados con mensaje por campo. | Pasó |
| CP-CU005-06 | CU005 | Ubicación fuera del área de San Miguel de Tucumán | Se rechaza con mensaje claro; no se registra. | Rechazado: "Fuera del área de San Miguel de Tucumán". | Pasó |
| CP-CU005-07 | CU005 | Flujo 7a: IRH crítico genera alerta automática (CU016) | El IRH queda en categoría Crítico y se genera una alerta crítica asociada al foco. | BR-016 registrado. IRH calculado: 92.9 (Crítico). Alerta generada: "Alerta hidrológica crítica: foco BR-016 a 53 m de Río Salí (Cauce Principal Troncal) (IRH 92.9)" (alertas 4 -> 5). | Pasó |
| CP-CU005-08 | CU005 | Estado de intervención informado al registrar (paso 4) | El foco queda registrado con el estado elegido. | BR-017 registrado con estado "Pendiente". | Pasó |
| CP-FOTO-01 | CU005 | Fotografía de campo: formato no permitido | No se acepta un archivo que no sea JPG/PNG/WebP; se informa el motivo. | Rechazado: "La foto debe ser JPG, PNG o WebP." | Pasó |
| CP-FOTO-02 | CU005 | Fotografía de campo: tamaño máximo 5 MB | Se rechaza una imagen mayor a 5 MB indicando el tamaño máximo. | Rechazado: "La foto pesa 6.0 MB; el máximo es 5 MB." | Pasó |
| CP-FOTO-03 | CU005 | Fotografía de campo: vista previa antes de confirmar y descarte | Se ve la vista previa de la imagen elegida y se puede descartar. | Vista previa mostrada y descartada correctamente. | Pasó |
| CP-CU005-09 | CU005 | Flujo 8a: error técnico al guardar | Se muestra "No se pudo completar el registro, intente nuevamente." y no se registra el foco. | Mensaje exacto del caso de uso mostrado; no se creó ningún foco. | Pasó |
| CP-CU005-10 | CU005 | Rol Supervisor no puede registrar | El botón "Nuevo basural" no se ofrece y la API responde 403. | Sin botón en pantalla; API: 403. | Pasó |
| CP-CU006-01 | CU006 | Modificar datos que no afectan el IRH | Se actualiza el dato y el IRH se mantiene. | Datos actualizados con mensaje de éxito; IRH sin cambios (55). | Pasó |
| CP-CU006-02 | CU006 | Modificar el volumen recalcula el IRH y la categoría | El IRH se recalcula y se actualiza la categoría de riesgo. | IRH 55 -> 69. MB-013 actualizado. IRH vigente: 68.8 (Moderado). | Pasó |
| CP-FOTO-04 | CU006 | Fotografía de campo: reemplazar la foto de un foco | La nueva foto reemplaza a la anterior. | La miniatura apunta a un archivo nuevo. | Pasó |
| CP-FOTO-05 | CU006 | Fotografía de campo: quitar la foto de un foco | El foco queda sin foto. | El foco quedó sin fotografía. | Pasó |
| CP-CU006-03 | CU006 | Flujo 5a: datos inválidos al modificar | Se muestra el error y el foco no se modifica (retorna al paso 4). | Rechazado y sin cambios en el registro. | Pasó |
| CP-CU006-04 | CU006 | Flujo 7a: el recálculo lleva el IRH a Crítico y genera alerta | La categoría pasa a Crítico y se genera una alerta automática. | BR-018 actualizado. IRH vigente: 92.9 (Crítico). Alerta automática generada. | Pasó |
| CP-CU006-05 | CU006 | Flujo 8a: error técnico al actualizar | Se muestra un mensaje de error y el registro no se modifica. | Mensaje de error mostrado; el registro conserva sus datos. | Pasó |
| CP-CU006-06 | CU006 | Un foco dado de baja no puede modificarse | No se ofrece "Editar" y la API rechaza la modificación. | Sin botón Editar; API: 400 "El foco está dado de baja y no puede modificarse". | Pasó |
| CP-CU007-01 | CU007 | Baja de un foco Activo | Pasa a Inactivo, sale de los vigentes, conserva historial; se pide confirmación. | Estado "Inactivo"; fuera de la lista de vigentes; historial conservado (1 -> 2 registros). | Pasó |
| CP-CU007-02 | CU007 | Baja de un foco Saneado | La baja procede y el foco queda Inactivo. | BR-021 (Saneado) -> Inactivo. | Pasó |
| CP-CU007-03 | CU007 | Precondición: un foco Pendiente de intervención no puede darse de baja | El botón Baja está deshabilitado y la API rechaza con mensaje; el foco conserva su estado. | Botón deshabilitado; API 400 "Solo puede darse de baja un foco en estado Activo o Saneado"; estado sin cambios. | Pasó |
| CP-CU007-04 | CU007 | Flujo 4a: cancelación por el operador | No hay cambios en el foco. | Se cerró la confirmación y el foco sigue Activo. | Pasó |
| CP-CU007-05 | CU007 | Flujo 5a: error técnico al dar de baja | Se muestra un mensaje de error y el foco permanece en su estado. | Mensaje de error mostrado; el foco permanece Activo. | Pasó |
| CP-CU007-06 | CU007 | La baja excluye al foco de los cálculos vigentes y lo conserva en el historial | Disminuyen los focos vigentes del dashboard; el foco no se muestra por defecto pero sí se consulta en "Dados de baja". | Focos vigentes 21 -> 20; fuera del visor; consultable en "Dados de baja". | Pasó |
| CP-CU007-07 | CU007 | Rol Operador no puede dar de baja | No se ofrece el botón Baja y la API responde 403. | Sin botón Baja; API: 403. | Pasó |
| CP-CU008-01 | CU008 | Consultar un foco: atributos, IRH e historial resumido de intervenciones | Un panel de detalle muestra ubicación, tipo de residuo, volumen, estado, IRH y las intervenciones. | Detalle de BR-002 con atributos, IRH y 1 intervención(es). | Pasó |
| CP-CU008-02 | CU008 | Un Supervisor puede consultar pero no modificar | Ve el botón Ver y el detalle; no ve Editar ni Baja. | Consulta habilitada; edición y baja no disponibles. | Pasó |
| CP-CU008-03 | CU008 | Flujo 2a: foco con datos incompletos | Muestra el resto de los atributos e indica que el IRH es provisorio y qué falta relevar. | Atributos mostrados; IRH marcado como provisorio con la lista de datos pendientes de relevar. | Pasó |
| CP-CU008-04 | CU008 | Flujo 3a: error técnico al recuperar los datos | Se muestra "No se pudo cargar la información del foco seleccionado." | Mensaje exacto del caso de uso mostrado. | Pasó |
| CP-CU008-05 | CU008 | Un foco dado de baja sigue siendo consultable (trazabilidad) | Desde "Dados de baja" se abre el detalle con estado Dado de baja. | Detalle disponible con estado "Dado de baja". | Pasó |
| CP-GEN-01 | Transversal | Sin errores de ejecución en la aplicación durante todas las pruebas | No se registran excepciones en el navegador. | Sin excepciones. | Pasó |

## Cómo ejecutarlos
Con backend (`runserver` en :8000, datos demo cargados) y frontend (`vite --port 3114`) levantados: `GISMAT_PASS=<clave> node ejecutar-casos.js` (requiere `npm i playwright`).

## Desvíos conocidos respecto de los casos de uso
- Las alertas críticas se generan automáticamente pero no tienen un destinatario específico (Supervisor).
- Con datos incompletos se muestra un IRH *provisorio* en lugar de "IRH no disponible".
- No existe el estado "En seguimiento": los estados son Activo, Pendiente, Saneado e Inactivo (baja lógica).
- Las fotos antes/después de Trazabilidad son imágenes estáticas (la intervención no guarda fotos). CU009 queda fuera del alcance del ABM.

## Defecto hallado y corregido durante la prueba
- Un foco dado de baja seguía apareciendo en el visor (`/api/geoportal/focos`). Ahora se excluye salvo que se pida `estado=inactivo` (con test automatizado).