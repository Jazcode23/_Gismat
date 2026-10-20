# Correo en GISMAT: verificación de cuenta y recuperación de contraseña

## Qué hace el sistema
| Situación | Qué ocurre |
|---|---|
| El Administrador crea un usuario (`POST /api/usuarios/`) | Se envía un enlace de verificación **al correo cargado** (vale 3 días). Hasta verificarlo, esa cuenta **no puede iniciar sesión**. |
| "Olvidé mi contraseña" (`POST /api/auth/recuperar/`) | Se envía un enlace **al correo asociado a la cuenta**. El enlace es de **un solo uso** y, al usarlo, se cierran las sesiones abiertas. |
| Correo inexistente en "olvidé mi contraseña" | Misma respuesta de siempre y no se envía nada (no se revela qué correos existen). |
| Falla el envío (SMTP caído, credenciales mal, límite de Gmail) | **No se rompe nada:** se registra el error en el log (sin credenciales). Al crear un usuario, la respuesta incluye `correoEnviado: false` y un `aviso`; la cuenta queda creada pero sin verificar (se puede verificar desde `/admin/` → Usuarios → "Email verificado"). |

*No existe registro público:* las cuentas las crea el Administrador. El correo (Gmail u otro) es obligatorio, único y se guarda en minúsculas.

## Configurar Gmail (una sola vez)
1. **Cuenta que enviará los mensajes.** Puede ser una Gmail propia o una dedicada al sistema (recomendado: una cuenta nueva solo para GISMAT).
2. Activá la **verificación en 2 pasos**: <https://myaccount.google.com/security> → "Verificación en 2 pasos".
3. Generá una **contraseña de aplicación**: <https://myaccount.google.com/apppasswords> → nombre "GISMAT" → *Crear*. Google muestra 16 letras en bloques de 4 (`abcd efgh ijkl mnop`); copiala (los espacios no importan).
   - Si no ves la opción: la verificación en 2 pasos no está activa, o la cuenta es de un Workspace cuyo administrador la deshabilitó.
   - **Nunca uses la contraseña normal de Gmail**: Google la rechaza para SMTP y, además, no debe guardarse en ningún archivo del sistema.
4. Copiá `.env.example` a `.env` (el `.env` **está en `.gitignore`**; no lo subas ni lo compartas) y completá:

| Variable | Qué poner | Obligatoria |
|---|---|---|
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` (ya viene así en `.env.example`) | sí |
| `EMAIL_HOST` | `smtp.gmail.com` | sí |
| `EMAIL_PORT` / `EMAIL_USE_TLS` / `EMAIL_USE_SSL` | `587` / `True` / `False` (alternativa: `465` / `False` / `True`) | sí |
| **`EMAIL_HOST_USER`** | **tu cuenta Gmail completa**, p. ej. `gismat.tucuman@gmail.com` | **sí — completar** |
| **`EMAIL_HOST_PASSWORD`** | **la contraseña de aplicación** de 16 letras | **sí — completar** |
| `DEFAULT_FROM_EMAIL` | remitente visible; vacío = usa `EMAIL_HOST_USER` (Gmail solo acepta la cuenta autenticada) | no |
| **`FRONTEND_URL`** | dirección del frontend, p. ej. `http://localhost:3000`. Con ella se arman los enlaces del correo | **sí — completar** |
| `EMAIL_TIMEOUT` | segundos de espera máxima al servidor SMTP (20 por defecto) | no |

5. Reiniciá el backend. `python manage.py check` te avisa si falta algo o si quedaron los valores de ejemplo.

## Iniciar el backend
```bash
cd gismat-backend
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python manage.py migrate         # solo la primera vez
python manage.py runserver 8000
```

## Probar el envío real
**1. Prueba directa (30 segundos)** — envía un correo de prueba y diagnostica errores:
```bash
python manage.py probar_correo tu.cuenta@gmail.com
```
Muestra la configuración detectada (la contraseña solo como "16 caracteres", nunca su valor) y termina con `✔ El servidor aceptó el correo…` o con el motivo del fallo
(contraseña normal en vez de la de aplicación, 2 pasos desactivado, puerto bloqueado, etc.). Revisá también la carpeta de spam.

**2. Prueba del flujo completo con tu Gmail**
1. Asociá tu Gmail a un usuario (los de prueba tienen correos ficticios `@gismat.local`):
   Django admin (`http://localhost:8000/admin/` → Usuarios → *Dirección de correo electrónico*), o
   `python manage.py shell -c "from accounts.models import Usuario as U; u=U.objects.get(username='admin'); u.email='tu.cuenta@gmail.com'; u.save()"`
2. En el frontend (`npm run dev`, <http://localhost:3000>) → "¿Olvidaste tu contraseña?" → ingresá ese correo.
3. Abrí el correo recibido → el enlace lleva a `FRONTEND_URL/restablecer?uid=…&token=…` y abre el formulario de nueva contraseña → guardá → iniciá sesión con la nueva.
4. Reabrí el mismo enlace: debe rechazarse (un solo uso).
5. Verificación: como Administrador creá un usuario con otro correo tuyo (p. ej. `tu.cuenta+prueba@gmail.com`, Gmail entrega los `+alias` a tu misma casilla) → llega el enlace de verificación → hasta abrirlo, esa cuenta no puede iniciar sesión.

## Cómo se verificó (y qué NO)
- 26 pruebas automáticas de cuentas/correo y el resto del backend (ver README).
- Prueba de extremo a extremo contra un **servidor SMTP local que exige STARTTLS + usuario/contraseña como Gmail**, con la configuración cargada solo por variables de entorno
  (incluida la contraseña con espacios): alta → correo → bloqueo de login → verificación → login; recuperación → enlace → nueva contraseña → enlace de un solo uso.
  También se comprobó el rechazo por contraseña incorrecta con su diagnóstico y el comportamiento con SMTP caído.
- **No se probó contra los servidores reales de Gmail** (el entorno de desarrollo no tiene salida a internet ni las credenciales). La prueba real es el paso 1 de arriba.

## Seguridad
- Las credenciales viven **solo en `.env`** (ignorado por git). No están en el código, en los logs ni en la salida de `probar_correo`.
- Si una contraseña de aplicación se filtra, revocala en <https://myaccount.google.com/apppasswords> y generá otra.
- Gmail limita ~500 envíos/día por cuenta; para uso institucional conviene un SMTP del municipio (mismas variables, otro `EMAIL_HOST`).
