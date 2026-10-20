/**
 * Cliente HTTP de GISMAT. Única puerta de entrada a la API REST (Django + PostGIS).
 *
 *  - VITE_USE_API=false  → vuelve al modo demo con datos mock (sin backend).
 *  - VITE_API_URL        → base de la API (por defecto '/api', que el proxy de Vite envía a :8000).
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const API_URL: string = env.VITE_API_URL || '/api';
export const API_ENABLED: boolean = env.VITE_USE_API !== 'false';

const TOKEN_KEY = 'gismat_token';
const USER_KEY = 'gismat_user';

export interface ApiUser {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  usuario: string;
  rol: 'administrador' | 'operador' | 'analista' | 'supervisor';
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[] | string>) {
    super(message);
  }
}

export const session = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY),
  getUser: (): ApiUser | null => {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  },
  save(token: string, user: ApiUser, remember: boolean) {
    session.clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(TOKEN_KEY);
      s.removeItem(USER_KEY);
    }
  },
};

/** Resume un error 400 de DRF ({detail, errors}) en una frase legible. */
function mensaje(status: number, body: any): string {
  if (body?.errors) {
    const e = body.errors;
    const partes = Array.isArray(e) ? e : Object.values(e).flat();
    const txt = partes.map((p: any) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    if (txt) return txt;
  }
  if (body?.detail) return String(body.detail);
  if (status === 401) return 'Tu sesión expiró. Volvé a iniciar sesión.';
  if (status === 403) return 'Tu rol no tiene permiso para esta operación.';
  if (status === 429) return 'Demasiados intentos. Esperá un minuto.';
  return `Error del servidor (${status}).`;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = session.getToken();
  if (token && opts.auth !== false) headers.Authorization = `Token ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de GISMAT.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) session.clear();
    throw new ApiError(res.status, mensaje(res.status, body), body?.errors);
  }
  return body as T;
}

export const qs = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function login(identificador: string, password: string, recordar: boolean): Promise<ApiUser> {
  const r = await api<{ token: string; usuario: ApiUser }>('/auth/login/', {
    body: { usuario: identificador, password },
    auth: false,
  });
  session.save(r.token, r.usuario, recordar);
  return r.usuario;
}

export async function logout(): Promise<void> {
  try {
    await api('/auth/logout/', { method: 'POST', body: {} });
  } finally {
    session.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Registro público ("Registrate"). Crea la cuenta en el backend; NO inicia sesión: después de registrarse la
// persona entra por el login normal. Si hay errores de validación lanza ApiError:
//   e.message  → frase lista para mostrar ("Ese correo electrónico ya está registrado.")
//   e.errors   → por campo, con las MISMAS claves que envió el formulario: { correo: ['...'], usuario: ['...'] }
// El backend acepta varios nombres por campo (usuario|username, email|correo, password|contraseña,
// confirmar|confirmPassword, nombre, apellido, nombreCompleto, documento|dni). El rol no se envía: lo asigna el servidor.
// ---------------------------------------------------------------------------------------------
export interface RegistroDatos {
  usuario?: string;
  email?: string;
  password?: string;
  confirmar?: string;
  nombre?: string;
  apellido?: string;
  documento?: string;
  [campoAlternativo: string]: unknown;
}

export interface RegistroResultado {
  detail: string;
  usuario: ApiUser;
  puedeIniciarSesion: boolean;
  requiereVerificacionCorreo: boolean;
}

export function registrar(datos: RegistroDatos): Promise<RegistroResultado> {
  return api<RegistroResultado>('/auth/registro/', { body: datos, auth: false });
}

/** Descarga un archivo binario (PDF, CSV...) desde la API con la sesión actual y lo guarda en la computadora. */
export async function descargarArchivo(path: string, nombreSugerido: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = session.getToken();
  if (token) headers.Authorization = `Token ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de GISMAT.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) session.clear();
    throw new ApiError(res.status, mensaje(res.status, body), body?.errors);
  }
  const nombre = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '')?.[1] || nombreSugerido;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
