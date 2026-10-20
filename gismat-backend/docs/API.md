# API REST de GISMAT

Base: `http://localhost:8000/api/` · JSON · `Authorization: Token <token>` en todo salvo login/recuperación.
Errores: `{"detail": "...", "errors": {"campo": ["mensaje"]}}` (400 validación · 401 sin sesión/expirada · 403 sin permiso · 404 · 429 demasiados intentos).

## Roles y permisos (única fuente: `accounts/permissions.py`)

| Acción | Administrador | Operador | Analista | Supervisor |
|---|:-:|:-:|:-:|:-:|
| Ver focos, capas, alertas, dashboard | ✔ | ✔ | ✔ | ✔ |
| Registrar / modificar foco | ✔ | ✔ | ✔ | – |
| Dar de baja foco | ✔ | – | – | – |
| Registrar intervención | ✔ | ✔ | – | – |
| Asignar cuadrilla | ✔ | – | ✔ | ✔ |
| Validar/descartar detecciones IA | ✔ | ✔ | ✔ | – |
| Reportes PDF/CSV | ✔ | – | ✔ | ✔ |
| Gestionar usuarios | ✔ | – | – | – |

*La matriz es una propuesta razonable a partir de los 4 perfiles del Plan; ajustarla es cambiar un diccionario.*

## Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login/` | `{usuario \| email, password}` → `{token, usuario}`. Token con expiración (`TOKEN_TTL_HOURS`), 10 intentos/min |
| POST | `/auth/logout/` | invalida el token |
| GET/PUT | `/auth/perfil/` | ver/editar nombre, apellido, correo (nunca rol ni estado) |
| POST | `/auth/cambiar-contrasena/` | `{actual, nueva}` |
| POST | `/auth/verificar-email/` | `{token}` (enviado por correo al crear el usuario) |
| POST | `/auth/recuperar/` · `/auth/restablecer/` | recuperación por correo; la respuesta no revela si el correo existe |
| CRUD | `/usuarios/` | solo Administrador. `DELETE` = baja lógica; `POST /usuarios/{id}/reactivar/` |

Política de contraseña: ≥ 8 caracteres con mayúscula, minúscula, número y símbolo. Se guardan con PBKDF2.

## Registro público (pantalla "Registrate")
`POST /api/auth/registro/` — público (sin token). Crea la cuenta en PostgreSQL; **no devuelve token**: la persona entra por el login normal.

| Campo | Obligatorio | Reglas | Alias aceptados |
|---|:-:|---|---|
| `usuario` | sí | 3–30 caracteres: letras, números, `.` `-` `_` (sin espacios ni `@`); único sin distinguir mayúsculas | `username`, `nombre_usuario`, `nombreUsuario` |
| `email` | sí | correo válido; único sin distinguir mayúsculas; se guarda en minúsculas | `correo`, `correo_electronico`, `mail` |
| `password` | sí | 8+ caracteres con mayúscula, minúscula, número y símbolo; se guarda hasheada (PBKDF2) | `contrasena`, `contraseña`, `clave` |
| `confirmar` | no | si viene, debe coincidir | `confirmPassword`, `confirmarPassword`, `password2`, `confirmar_password` |
| `nombre`, `apellido` | no | hasta 150 caracteres | `first_name`/`last_name`; o un solo `nombreCompleto` (se separa en nombre + apellido) |
| `documento` | no | 7–11 dígitos; único | `dni` |

El **rol no se envía**: lo asigna el servidor (`REGISTRO_ROL_POR_DEFECTO`, por defecto `supervisor`); cualquier `rol`, `is_staff`, `is_superuser` del cliente se ignora.

```http
POST /api/auth/registro/   {"usuario":"lucia.m","correo":"Lucia.M@gmail.com","contraseña":"Clave#Lucia2026","confirmPassword":"Clave#Lucia2026","nombreCompleto":"Lucía Méndez"}
201 {"detail":"Cuenta creada. Ya podés iniciar sesión.","usuario":{"id":6,"usuario":"lucia.m","email":"lucia.m@gmail.com","rol":"supervisor",...},
     "puedeIniciarSesion":true,"requiereVerificacionCorreo":false}

400 {"detail":"Revisá los datos del formulario.",
     "errors":{"correo":["Ese correo electrónico ya está registrado."],"usuario":["Ese nombre de usuario ya está registrado."]}}
```
Los errores vienen **todos juntos** y con **las mismas claves que envió el formulario** (si mandó `correo`, el error viene en `correo`). Otros códigos: `403` registro deshabilitado, `429` más de 20 registros/hora desde una misma IP.
Variables (`.env`): `REGISTRO_PUBLICO`, `REGISTRO_ROL_POR_DEFECTO`, `REGISTRO_VERIFICAR_CORREO` (`False` = la cuenta entra enseguida y el correo solo se guarda; `True` = exige verificar el correo, requiere configurar el envío).

## Focos
| Método | Ruta | |
|---|---|---|
| GET | `/focos/` | filtros: `tipo`/`tipoFoco`, `estado`, `nivel`/`nivelRiesgo`, `microcuenca`, `tipoResiduo`, `irhMin`, `irhMax`, `proximidadMax`, `desde`, `hasta` (período), `barrio`, `q`/`searchQuery`, `soloAlertas`, **`zona=lat_min,lng_min,lat_max,lng_max`**, **`cerca=lat,lng,metros`** |
| POST | `/focos/` | alta; calcula microcuenca, curso cercano, distancia e IRH |
| GET/PUT/PATCH | `/focos/{id}/` | `id` = código (`BR-001`). Si cambia ubicación/volumen/permeabilidad/residuo/estado → recalcula IRH y guarda historial |
| DELETE | `/focos/{id}/` | **baja lógica** (`estado=inactivo`), `{"motivo": "..."}` opcional |
| GET | `/focos/{id}/historial/` | evolución del IRH + intervenciones |
| GET | `/focos/{id}/irh/` · POST `/focos/{id}/calcular-irh/` | IRH vigente con sus variables · recálculo manual |
| GET/POST | `/focos/{id}/intervenciones/` | listar / registrar |
| POST | `/focos/{id}/asignar-cuadrilla/` | orden de despacho |
| GET | `/focos/{id}/cercanos/?metros=500` | focos cercanos (ST_DWithin) |

El IRH, el nivel, la microcuenca y la distancia **nunca se aceptan del cliente**.

## Capas, mapa y análisis
`GET /cursos-agua/` · `/microcuencas/` · `/microcuencas/{id}/` · `/microcuencas/riesgo/` (carga acumulada) · `/zonas-riesgo/` · `/puntos-monitoreo/` · `/barrios/` · `/tipos-residuo/` · `/cuadrillas/`
**GeoJSON** (`FeatureCollection`): `GET /geojson/{focos|cursos-agua|microcuencas|zonas-riesgo|puntos-monitoreo|barrios}/` (focos acepta los mismos filtros).

## Otros
`GET /intervenciones/?foco=&desde=&hasta=&estado=` · `GET /alertas/?nivel=&estado=&tipo=&foco=` · `POST /alertas/{id}/atender/` · `GET /dashboard/?meses=6` · `GET /reportes/focos/?formato=pdf|csv` (+ filtros de focos)
Módulo IA (integración futura): `POST /detecciones-ia/` crea una detección `nuevo`; `POST /detecciones-ia/{id}/confirmar/` la convierte en foco con IRH; `/descartar/`.
Compatibilidad con el frontend: `/geoportal/*`, `/trazabilidad/*` (ver `INTEGRACION_FRONTEND.md`).

## Ejemplos

**Login**
```http
POST /api/auth/login/   {"usuario": "analista", "password": "********"}
200 {"token": "9f2c…", "usuario": {"id": 3, "nombre": "Analista", "rol": "analista", "email": "analista@gismat.local", ...}}
```
**Alta de foco**
```http
POST /api/focos/
{"tipo": "basural", "ubicacion": "Av. Mate de Luna y Canal Norte", "barrio": "Villa 9 de Julio",
 "latitud": -26.8151, "longitud": -65.2096, "volumenM3": 400, "superficieM2": 600,
 "permeabilidad": "media_alta", "permeabilidadDetalle": "suelo aluvial", "tipoResiduo": "escombros"}

201 {"id": "BR-013", "tipo": "basural", "estado": "activo", "coordenadas": [-26.8151, -65.2096],
     "irh": 71.4, "nivelRiesgo": "Crítico", "distanciaCursoAgua": 36, "cursoAguaCercano": "Canal Norte (...)",
     "microcuencaId": "mc_canal_norte", "volumenEstimado": "~400 m³ (~240 Toneladas)", ...}
```
(se genera además una alerta crítica con recomendación y un registro en el historial de IRH)

**Intervención** (acepta nombres del frontend `title/desc/tags/cuadrilla/date` o `tipo/observaciones/etiquetas`)
```http
POST /api/focos/BR-013/intervenciones/
{"title": "Retiro de escombros", "desc": "Retroexcavadora", "tags": ["14 Toneladas"], "cuadrilla": "alfa",
 "date": "15/03/2026", "volumen_removido_ton": 140}
201 {"id": 1, "focoId": "BR-013", "fecha": "2026-03-15", "tipo": "Retiro de escombros", "estado": "completada",
     "irh_antes": 71.4, "irh_despues": 52.9, ...}
```
**Dashboard** (extracto)
```json
{"totalFocos": 12, "focosActivos": 7, "focosInactivos": 1, "focosPorNivelRiesgo": {"Bajo": 3, "Moderado": 5, "Crítico": 3},
 "intervenciones": {"total": 6, "toneladasRemovidas": 722.0}, "alertas": {"activas": 3, "criticas": 3},
 "riesgoPorMicrocuenca": [{"id": "mc_canal_norte", "irhPromedio": 70.3, "cargaAcumulada": 211.0, ...}],
 "evolucionIRH": [{"mes": "2026-10", "irhPromedio": 56.2, "calculos": 12}]}
```
