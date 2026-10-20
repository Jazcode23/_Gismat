# Conexión del frontend con la API

El frontend ya viene conectado (versión `gismat-frontend-conectado.zip`). Solo cambió **la fuente de datos**: ningún estilo, texto, layout, ruta ni componente visual se modificó.

## Ejecutar todo
```bash
# 1) Backend (ver README del backend): PostgreSQL+PostGIS, migrate, cargar_datos_demo, crear_usuarios_demo
python manage.py runserver 8000

# 2) Frontend
npm install
npm run dev            # http://localhost:3000  — el proxy de Vite envía /api y /media a http://localhost:8000
```
Ingresá con un usuario de `crear_usuarios_demo` (`admin`, `operador`, `analista`, `supervisor`).
`VITE_USE_API=false` en `.env` devuelve el frontend al modo demo original con datos mock (sin backend).
En producción, definí `VITE_API_URL=https://tu-servidor/api` y agregá el origen del frontend a `CORS_ALLOWED_ORIGINS` del backend.

## Archivos del frontend que cambiaron (solo datos)
| Archivo | Cambio |
|---|---|
| `src/services/apiClient.ts` *(nuevo)* | `fetch` con token, errores legibles, sesión (`localStorage` si "Recordar sesión", si no `sessionStorage`) |
| `src/services/geoportalService.ts` | cada método llama a `/api/geoportal/*` (activó el flag `useApiBackend` que ya traía) |
| `src/services/gismatStore.ts` | misma interfaz del hook; ahora carga (`hydrate`) y escribe contra `/trazabilidad`, `/detecciones-ia`, `/dashboard`, `/focos` |
| `src/components/ScreenAuth.tsx` | login real (usuario o correo), recuperación y restablecimiento de contraseña, verificación de correo. Muestra el error del servidor bajo el formulario solo si falla |
| `src/components/ScreenTraceability.tsx`, `ScreenAIDetections.tsx` | esperan la respuesta de la API antes de mostrar el cartel de éxito; si falla (p. ej. rol sin permiso) muestran el mensaje en un `alert` |
| `src/components/ScreenHydrologicalRisk.tsx` | top-3 de focos, dona y evolución de riesgo, historial y volumen vienen de la API; "Confirmar asignación" llama a `/focos/{id}/asignar-cuadrilla/` |
| `src/components/ScreenEnvironmentalDashboard.tsx` | KPIs, distribución por rango de IRH, evolución mensual y tabla por cuenca vienen de `/api/dashboard/` |
| `vite.config.ts`, `.env.example` | proxy `/api` y flag `VITE_USE_API` |

## Equivalencias (frontend → API)
| Frontend | Endpoint |
|---|---|
| `geoportalService.getCapas / getFocos(filtros) / getFocoById / getCursosAgua / getMicrocuencas / getZonasRiesgo / getPuntosMonitoreo / getBarrios / getAlertas / getEstadisticas / buscarLugares` | `GET /api/geoportal/{capas, focos, focos/{id}, cursos-agua, microcuencas, zonas-riesgo, puntos-monitoreo, barrios, alertas, estadisticas, buscar}` |
| `gismatStore.hydrate()` (tras el login) | `GET /api/trazabilidad/focos/`, `/api/detecciones-ia/`, `/api/trazabilidad/focos/resumen/`, `/api/dashboard/`, `/api/focos/` |
| `addInterventionToFoco(id, {title,desc,tags,cuadrilla,date})` | `POST /api/trazabilidad/focos/{id}/intervenciones/` |
| `confirmDetection(id)` | `POST /api/detecciones-ia/{id}/confirmar/` |
| `asignarCuadrilla(id, 'alfa')` | `POST /api/focos/{id}/asignar-cuadrilla/` |
| Login / recuperar / restablecer | `POST /api/auth/login/`, `/recuperar/`, `/restablecer/` |

## Decisiones que conviene conocer
1. **Intervenciones y toneladas.** El formulario de trazabilidad no tiene un campo numérico de toneladas. El store las toma del texto ("20 toneladas" en observaciones/acciones); sin cifra, la intervención se registra con 0 t y el IRH apenas cambia. Elegir *Relleno*, *Plantación* o *Recuperación* marca el espacio como **recuperado** (`limpiado`). Si querés un campo numérico real, es un agregado de UI.
2. **Roles.** El backend decide: el analista no puede registrar intervenciones y el operador no puede asignar cuadrillas; la pantalla muestra el aviso del servidor. La interfaz **no oculta** botones según el rol (no se tocó el diseño).
3. **"Reducción interanual"** del dashboard pasó a **"reducción acumulada"** (IRH inicial vs. actual de cada foco): con datos de unos meses no existe una comparación interanual real.
4. **Los números cambian respecto del mock.** Ahora salen de PostGIS: IRH, distancias y conteos reflejan la geometría cargada. Los cursos de agua de ejemplo son esquemáticos (ver README del backend); con hidrografía oficial los valores serán fieles.
5. **Sin focos activos**, la pantalla de Riesgo Hídrico muestra un registro vacío "Sin focos activos". Trazabilidad e IA asumen al menos un registro (como el diseño original).
6. **Direcciones de referencia** del buscador siguen siendo una lista fija del frontend; focos, microcuencas y cursos vienen de la API.
7. No hay botón de "cerrar sesión" en el diseño; `logout()` existe en `apiClient.ts` para cuando se agregue. Los tokens vencen a las `TOKEN_TTL_HOURS`.

## Pantalla "Registrate"
`src/services/apiClient.ts` expone `registrar(datos)`. Se llama desde el `onSubmit` del formulario existente (no requiere cambiar su diseño):
```tsx
import { registrar, ApiError } from '../services/apiClient';

const handleRegistro = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    const r = await registrar({ usuario, email, password, confirmar, nombre, apellido });
    // éxito: r.detail = "Cuenta creada. Ya podés iniciar sesión." → mostrar el mensaje y pasar al login
  } catch (err) {
    if (err instanceof ApiError) {
      // err.message  → frase lista para mostrar
      // err.errors   → por campo, con las mismas claves que enviaste: { email: ['…'], usuario: ['…'] }
    }
  }
};
```
Contrato completo (campos, alias, errores): `docs/API.md` → "Registro público".
