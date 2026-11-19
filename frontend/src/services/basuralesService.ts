/**
 * Servicio del ABM de basurales (focos). Habla con /api/focos/ (Django + PostGIS).
 *
 * Reglas del backend que respeta este módulo:
 *  - El IRH, el nivel de riesgo, la microcuenca y la distancia al curso de agua se calculan en el servidor; nunca se envían.
 *  - Lo que no se informa (volumen, permeabilidad, tipo de residuo) queda "pendiente de relevar" => IRH provisorio.
 *  - La baja es lógica (DELETE => estado "inactivo"): el historial y las intervenciones se conservan.
 *  - Un foco dado de baja no se puede modificar.
 */
import { api, API_URL, qs, session } from './apiClient';

export type TipoFoco = 'basural' | 'microbasural' | 'volcadero';
export type EstadoFoco = 'activo' | 'pendiente' | 'limpiado' | 'inactivo';
export type Permeabilidad = 'alta' | 'media_alta' | 'media' | 'media_baja' | 'baja';

export const TIPOS_FOCO: { value: TipoFoco; label: string }[] = [
  { value: 'basural', label: 'Basural' },
  { value: 'microbasural', label: 'Microbasural' },
  { value: 'volcadero', label: 'Volcadero' },
];

/** "inactivo" no figura: se llega solo mediante la baja (DELETE). */
export const ESTADOS_EDITABLES: { value: Exclude<EstadoFoco, 'inactivo'>; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pendiente', label: 'Pendiente de intervención' },
  { value: 'limpiado', label: 'Limpiado' },
];

export const PERMEABILIDADES: { value: Permeabilidad; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media_alta', label: 'Media-Alta' },
  { value: 'media', label: 'Media' },
  { value: 'media_baja', label: 'Media-Baja' },
  { value: 'baja', label: 'Baja' },
];

/** Foco completo tal como lo devuelve /api/focos/ y /api/focos/{id}/. */
export interface Basural {
  id: string;
  tipo: TipoFoco;
  estado: EstadoFoco;
  fechaRegistro: string;
  ubicacion: string;
  barrio: string;
  coordenadas: [number, number];
  latitud: number;
  longitud: number;
  irh: number;
  nivelRiesgo: 'Bajo' | 'Moderado' | 'Crítico';
  distanciaCursoAgua: number | null;
  cursoAguaCercano: string;
  microcuencaId: string;
  volumenEstimado: string;
  volumenM3: number;
  superficieM2: number;
  permeabilidad: Permeabilidad;
  permeabilidadDetalle: string;
  permeabilidadSuelo: string;
  tipoResiduo: string | null;
  foto: string | null;
  observaciones: string;
  proximaAccionRecomendada: string;
  datosPendientes: string[];
  irhProvisorio: boolean;
  totalIntervenciones: number;
  alertasActivas: number;
  fechaActualizacion: string;
}

export interface IntervencionResumen {
  id: number;
  fecha: string;
  tipo: string;
  cuadrillaNombre?: string;
  responsableNombre?: string;
  estado: string;
  volumen_removido_ton: number;
  irh_antes: number | null;
  irh_despues: number | null;
}

export interface HistorialFoco {
  foco: string;
  irh: { id: number; fecha: string; valor: number; nivel: string; motivo: string }[];
  intervenciones: IntervencionResumen[];
}

/** CU007: solo puede darse de baja un foco Activo o Saneado (limpiado). */
export const puedeDarseDeBaja = (b: Pick<Basural, 'estado'>) => b.estado === 'activo' || b.estado === 'limpiado';

/** Mensajes de error técnico de los casos de uso (CU005 8a, CU006 8a, CU007 5a, CU008 3a). */
export const MSG_TECNICO = {
  alta: 'No se pudo completar el registro, intente nuevamente.',
  modificacion: 'No se pudo actualizar el foco, intente nuevamente. El registro no fue modificado.',
  baja: 'No se pudo completar la baja, intente nuevamente. El foco conserva su estado.',
  consulta: 'No se pudo cargar la información del foco seleccionado.',
};

/** Un error es "técnico" si no es de validación/permiso: el servidor falló o no hubo conexión. */
export const esErrorTecnico = (e: unknown) => {
  const s = (e as { status?: number })?.status;
  return s === 0 || (typeof s === 'number' && s >= 500);
};

export interface TipoResiduoOpcion {
  id: string;
  nombre: string;
  descripcion: string;
  factorPeligrosidad: number;
}

/** Datos editables del formulario. Los campos "opcionales" se omiten si están vacíos (quedan pendientes de relevar). */
export interface BasuralForm {
  tipo: TipoFoco;
  estado: Exclude<EstadoFoco, 'inactivo'>;
  ubicacion: string;
  barrio: string;
  latitud: string;
  longitud: string;
  volumenM3: string;
  superficieM2: string;
  permeabilidad: Permeabilidad | '';
  permeabilidadDetalle: string;
  tipoResiduo: string;
  observaciones: string;
  proximaAccionRecomendada: string;
  /** Archivo nuevo elegido en el formulario (null = no cambia la foto). */
  foto: File | null;
  /** Edición: true = eliminar la foto actual. */
  quitarFoto: boolean;
}

export const FORM_VACIO: BasuralForm = {
  tipo: 'basural',
  estado: 'activo',
  ubicacion: '',
  barrio: '',
  latitud: '',
  longitud: '',
  volumenM3: '',
  superficieM2: '',
  permeabilidad: '',
  permeabilidadDetalle: '',
  tipoResiduo: '',
  observaciones: '',
  proximaAccionRecomendada: '',
  foto: null,
  quitarFoto: false,
};

export function formDesdeBasural(b: Basural): BasuralForm {
  const pend = new Set(b.datosPendientes || []);
  return {
    tipo: b.tipo,
    estado: b.estado === 'inactivo' ? 'activo' : b.estado,
    ubicacion: b.ubicacion,
    barrio: b.barrio || '',
    latitud: String(b.latitud),
    longitud: String(b.longitud),
    volumenM3: pend.has('volumen') ? '' : String(b.volumenM3),
    superficieM2: b.superficieM2 ? String(b.superficieM2) : '',
    permeabilidad: pend.has('permeabilidad') ? '' : b.permeabilidad,
    permeabilidadDetalle: b.permeabilidadDetalle || '',
    tipoResiduo: b.tipoResiduo || '',
    observaciones: b.observaciones || '',
    proximaAccionRecomendada: b.proximaAccionRecomendada || '',
    foto: null,
    quitarFoto: false,
  };
}

// Caja geográfica que acepta el backend (settings.GISMAT_BBOX): San Miguel de Tucumán y alrededores.
export const BBOX = { latMin: -27.0, latMax: -26.6, lngMin: -65.45, lngMax: -65.0 };

/** Validación previa al envío. El backend vuelve a validar todo; esto solo evita idas y vueltas. */
export function validarForm(f: BasuralForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.ubicacion.trim()) e.ubicacion = 'La dirección o ubicación es obligatoria.';
  else if (f.ubicacion.trim().length > 200) e.ubicacion = 'Máximo 200 caracteres.';
  if (f.barrio.length > 120) e.barrio = 'Máximo 120 caracteres.';

  const lat = Number(f.latitud.replace(',', '.'));
  const lng = Number(f.longitud.replace(',', '.'));
  if (f.latitud.trim() === '' || Number.isNaN(lat)) e.latitud = 'Latitud obligatoria (ej. -26.8151).';
  else if (lat < BBOX.latMin || lat > BBOX.latMax) e.latitud = `Fuera del área de San Miguel de Tucumán (${BBOX.latMin} a ${BBOX.latMax}).`;
  if (f.longitud.trim() === '' || Number.isNaN(lng)) e.longitud = 'Longitud obligatoria (ej. -65.2096).';
  else if (lng < BBOX.lngMin || lng > BBOX.lngMax) e.longitud = `Fuera del área de San Miguel de Tucumán (${BBOX.lngMin} a ${BBOX.lngMax}).`;

  for (const [campo, etiqueta] of [['volumenM3', 'El volumen'], ['superficieM2', 'La superficie']] as const) {
    const v = f[campo].trim();
    if (v !== '' && (Number.isNaN(Number(v.replace(',', '.'))) || Number(v.replace(',', '.')) < 0)) {
      e[campo] = `${etiqueta} debe ser un número mayor o igual a 0.`;
    }
  }
  if (f.permeabilidadDetalle.length > 120) e.permeabilidadDetalle = 'Máximo 120 caracteres.';
  if (f.foto) {
    if (!FOTO_TIPOS.includes(f.foto.type)) e.foto = 'La foto debe ser JPG, PNG o WebP.';
    else if (f.foto.size > FOTO_MAX_BYTES) e.foto = `La foto pesa ${(f.foto.size / 1048576).toFixed(1)} MB; el máximo es ${FOTO_MAX_BYTES / 1048576} MB.`;
  }
  return e;
}

export const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

/** El backend devuelve la foto con URL absoluta; se usa solo la ruta (/media/...) para que pase por el proxy del frontend. */
export function fotoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  // La API puede estar en otro dominio (producción): las fotos se piden siempre al origen de la API, siempre por https
  // si la página es https, aunque el backend (detrás del proxy) arme la URL con http.
  try {
    const ruta = new URL(url, window.location.origin).pathname;
    const origen = /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : '';
    return origen + ruta;
  } catch { return url; }
}

const num = (s: string) => Number(s.trim().replace(',', '.'));

/** Arma el cuerpo JSON. Nunca incluye irh, nivelRiesgo, microcuenca ni distancia (los calcula el servidor). */
/** Con foto (o para quitarla) el pedido va como multipart; sin foto, como JSON. */
export function cuerpoPedido(f: BasuralForm, modo: 'alta' | 'edicion'): Record<string, unknown> | FormData {
  const json = cuerpoDesdeForm(f, modo);
  if (!f.foto && !(modo === 'edicion' && f.quitarFoto)) return json;
  const fd = new FormData();
  Object.entries(json).forEach(([k, v]) => fd.append(k, String(v)));
  if (f.foto) fd.append('foto', f.foto);
  else fd.append('foto', ''); // vacío = quitar la foto (el serializer acepta null)
  return fd;
}

export function cuerpoDesdeForm(f: BasuralForm, modo: 'alta' | 'edicion'): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tipo: f.tipo,
    ubicacion: f.ubicacion.trim(),
    barrio: f.barrio.trim(),
    latitud: num(f.latitud),
    longitud: num(f.longitud),
    permeabilidadDetalle: f.permeabilidadDetalle.trim(),
    observaciones: f.observaciones.trim(),
    proximaAccionRecomendada: f.proximaAccionRecomendada.trim(),
  };
  body.estado = f.estado; // CU005 paso 4: el estado de intervención se informa también al registrar
  if (f.volumenM3.trim() !== '') body.volumenM3 = num(f.volumenM3);
  if (f.superficieM2.trim() !== '') body.superficieM2 = num(f.superficieM2);
  if (f.permeabilidad) body.permeabilidad = f.permeabilidad;
  if (f.tipoResiduo) body.tipoResiduo = f.tipoResiduo;
  return body;
}

export interface FiltrosBasurales {
  q?: string;
  tipo?: string;
  estado?: string;
  nivel?: string;
}

export const basuralesService = {
  listar: (filtros: FiltrosBasurales = {}) =>
    api<Basural[]>(`/focos/${qs({ q: filtros.q?.trim() || undefined, tipo: filtros.tipo, estado: filtros.estado, nivel: filtros.nivel })}`),

  obtener: (id: string) => api<Basural>(`/focos/${encodeURIComponent(id)}/`),

  crear: (f: BasuralForm) => api<Basural>('/focos/', { method: 'POST', body: cuerpoPedido(f, 'alta') }),

  modificar: (id: string, f: BasuralForm) =>
    api<Basural>(`/focos/${encodeURIComponent(id)}/`, { method: 'PATCH', body: cuerpoPedido(f, 'edicion') }),

  /** Baja lógica (estado = inactivo). El historial y las intervenciones se conservan. */
  darDeBaja: (id: string, motivo: string) =>
    api<Basural>(`/focos/${encodeURIComponent(id)}/`, { method: 'DELETE', body: { motivo: motivo.trim() } }),

  tiposResiduo: () => api<TipoResiduoOpcion[]>('/tipos-residuo/'),

  /** CU008: evolución del IRH e intervenciones del foco. */
  historial: (id: string) => api<HistorialFoco>(`/focos/${encodeURIComponent(id)}/historial/`),
};

/** Permisos en la UI (espejo de accounts/permissions.py; el backend es quien manda). */
export function permisosUsuario() {
  const rol = session.getUser()?.rol;
  const puedeEscribir = rol === 'administrador' || rol === 'operador' || rol === 'analista';
  return { rol, puedeCrear: puedeEscribir, puedeEditar: puedeEscribir, puedeDarDeBaja: rol === 'administrador' };
}
