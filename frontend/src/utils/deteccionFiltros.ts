import type { AIDetectionItem } from '../services/gismatStore';

/**
 * Filtros, estadísticas y archivos de la pantalla Detecciones IA.
 *
 * Los filtros tienen EXACTAMENTE el mismo criterio que `filtrar_detecciones` del backend (geoportal/filters.py): lo que se ve en
 * la tabla es lo que descarga la exportación con esos mismos filtros. Las tarjetas, las gráficas y los contadores de las pestañas
 * se calculan con la misma lista, así que siempre coinciden entre sí.
 */

export type PestanaDeteccion = 'todos' | 'nuevos' | 'confirmados' | 'descartados';
export type EstadoDeteccion = 'nuevo' | 'confirmado' | 'descartado';

export const ESTADO_DE_PESTANA: Record<PestanaDeteccion, '' | EstadoDeteccion> = {
  todos: '',
  nuevos: 'nuevo',
  confirmados: 'confirmado',
  descartados: 'descartado',
};

export interface FiltrosAvanzados {
  tipo: string; // '' | basural | microbasural | volcadero
  mes: string; // '' | AAAA-MM
  confianzaMin: number; // 0 = sin mínimo
  origen: '' | 'real' | 'simulado';
  riesgo: string; // '' | Crítico | Moderado | Bajo
}

export interface FiltrosDeteccion extends FiltrosAvanzados {
  estado: '' | EstadoDeteccion;
  q: string;
}

export const AVANZADOS_VACIOS: FiltrosAvanzados = { tipo: '', mes: '', confianzaMin: 0, origen: '', riesgo: '' };

export const TIPOS_FOCO = [
  { valor: 'basural', etiqueta: 'Basural' },
  { valor: 'microbasural', etiqueta: 'Microbasural' },
  { valor: 'volcadero', etiqueta: 'Volcadero clandestino' },
];

export const NIVELES_RIESGO = ['Crítico', 'Moderado', 'Bajo'];
export const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const etiquetaTipo = (tipo?: string): string => TIPOS_FOCO.find((t) => t.valor === tipo)?.etiqueta ?? '—';

/** Una detección es simulada si el backend la marcó con origen = simulado (dato de prueba, no es una detección real). */
export const esSimulada = (d: Pick<AIDetectionItem, 'origen'>): boolean => d.origen === 'simulado';

/** Confianza exacta (la misma que usa el servidor); si el backend no la envía, se lee del texto "NN%". */
export const confianzaNum = (d: AIDetectionItem): number =>
  typeof d.confianzaValor === 'number' ? d.confianzaValor : parseFloat(String(d.confidence ?? '').replace('%', '').replace(',', '.'));

export function coincide(d: AIDetectionItem, f: FiltrosDeteccion): boolean {
  if (f.estado && d.statusType !== f.estado) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !`${d.id ?? ''}\n${d.location ?? ''}\n${d.cauce ?? ''}`.toLowerCase().includes(q)) return false;
  if (f.tipo && (d.tipoFoco ?? '') !== f.tipo) return false;
  if (f.mes && !String(d.date ?? '').startsWith(f.mes)) return false;
  if (f.confianzaMin > 0 && !(confianzaNum(d) >= f.confianzaMin)) return false;
  if (f.origen === 'simulado' && !esSimulada(d)) return false;
  if (f.origen === 'real' && esSimulada(d)) return false;
  if (f.riesgo && d.riesgo !== f.riesgo) return false;
  return true;
}

export const aplicarFiltros = (lista: AIDetectionItem[], f: FiltrosDeteccion): AIDetectionItem[] => lista.filter((d) => coincide(d, f));

export const contarFiltrosActivos = (a: FiltrosAvanzados): number =>
  (a.tipo ? 1 : 0) + (a.mes ? 1 : 0) + (a.confianzaMin > 0 ? 1 : 0) + (a.origen ? 1 : 0) + (a.riesgo ? 1 : 0);

/** Cadena de consulta para /detecciones-ia/exportar/: los mismos filtros que se ven en pantalla (la exportación no pagina). */
export function consultaExportacion(f: FiltrosDeteccion): string {
  const p = new URLSearchParams();
  p.set('estado', f.estado || 'todos');
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.tipo) p.set('tipo', f.tipo);
  if (f.mes) p.set('mes', f.mes);
  if (f.confianzaMin > 0) p.set('confianza_min', String(f.confianzaMin));
  if (f.origen) p.set('origen', f.origen);
  if (f.riesgo) p.set('riesgo', f.riesgo);
  return p.toString();
}

// ------------------------------------------------------------------ estadísticas
const anioMes = (d: AIDetectionItem) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(d.date ?? ''));
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1 } : null;
};

export function calcularEstadisticas(base: AIDetectionItem[], hoy: Date = new Date()) {
  const y = hoy.getFullYear();
  const mActual = hoy.getMonth();
  const mAnt = mActual === 0 ? 11 : mActual - 1;
  const yAnt = mActual === 0 ? y - 1 : y;

  const nuevos = base.filter((d) => d.statusType === 'nuevo');
  const confirmados = base.filter((d) => d.statusType === 'confirmado');
  const descartados = base.filter((d) => d.statusType === 'descartado');
  const confs = base.map(confianzaNum).filter((n) => !Number.isNaN(n));
  const confsNuevos = nuevos.map(confianzaNum).filter((n) => !Number.isNaN(n));
  const enMes = (yy: number, mm: number, lista = base) => lista.filter((d) => { const f = anioMes(d); return !!f && f.y === yy && f.m === mm; }).length;
  const mesActual = enMes(y, mActual);
  const mesAnterior = enMes(yAnt, mAnt);

  const buckets = [0, 0, 0, 0, 0]; // 90-100, 80-90, 70-80, 60-70, <60
  confs.forEach((c) => { buckets[c >= 90 ? 0 : c >= 80 ? 1 : c >= 70 ? 2 : c >= 60 ? 3 : 4] += 1; });

  const monthly = NOMBRES_MES.slice(0, mActual + 1).map((month, idx) => ({
    month,
    detectados: enMes(y, idx),
    confirmados: enMes(y, idx, confirmados),
    pendientes: enMes(y, idx, nuevos),
    descartados: enMes(y, idx, descartados),
    isCurrent: idx === mActual,
  }));
  const revisadas = confirmados.length + descartados.length;

  return {
    total: base.length,
    nuevos: nuevos.length,
    confirmados: confirmados.length,
    descartados: descartados.length,
    simuladas: base.filter(esSimulada).length,
    mesActual,
    variacion: mesAnterior > 0 ? Math.round(((mesActual - mesAnterior) / mesAnterior) * 100) : null,
    confProm: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : null,
    // precisión del modelo: de las detecciones ya revisadas, cuántas se confirmaron
    precision: revisadas ? Math.round((confirmados.length / revisadas) * 100) : null,
    rangoNuevos: confsNuevos.length ? { min: Math.round(Math.min(...confsNuevos)), max: Math.round(Math.max(...confsNuevos)) } : null,
    buckets,
    maxBucket: Math.max(1, ...buckets),
    monthly,
    maxMensual: Math.max(3, ...monthly.map((d) => d.detectados)),
  };
}

// ------------------------------------------------------------------ archivos (modo sin API)
/** Latitud y longitud desde textos como "-26.8151º S, -65.2096º O". */
export function leerCoordenadas(coords: string): [number, number] | null {
  const n = (String(coords ?? '').match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.')));
  const valido = n.length >= 2 && Math.abs(n[0]) <= 90 && Math.abs(n[1]) <= 180;
  return valido ? [n[0], n[1]] : null;
}

/** Arma el CSV o el GeoJSON con la lista recibida (se usa solo si no hay conexión con el servidor). */
export function armarArchivoLocal(lista: AIDetectionItem[], formato: 'geojson' | 'csv') {
  const origen = (d: AIDetectionItem) => (esSimulada(d) ? 'Simulado (datos de prueba)' : 'Real');
  if (formato === 'csv') {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Código', 'Fecha', 'Tipo de foco', 'Dirección', 'Lat', 'Lng', 'Confianza (%)', 'Estado', 'Riesgo (foco asociado)', 'Cauce',
      'Distancia al curso', 'Área', 'Foco asociado', 'Origen'];
    const filas = lista.flatMap((d) => {
      const c = leerCoordenadas(d.coords);
      return c ? [[d.id, d.date, etiquetaTipo(d.tipoFoco), d.location, c[0], c[1], confianzaNum(d), d.statusType, d.riesgo ?? '', d.cauce, d.distancia,
        d.area, d.focoId ?? '', origen(d)]] : [];
    });
    return { nombre: 'detecciones-ia.csv', mime: 'text/csv;charset=utf-8', contenido: '\ufeff' + [cab, ...filas].map((f) => f.map(celda).join(',')).join('\r\n') };
  }
  const features = lista.flatMap((d) => {
    const c = leerCoordenadas(d.coords);
    return c ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [c[1], c[0]] },
      properties: { codigo: d.id, fecha: d.date, tipo_foco: d.tipoFoco ?? '', direccion: d.location, confianza: confianzaNum(d), estado: d.statusType,
        riesgo: d.riesgo ?? null, cauce: d.cauce, area: d.area, foco: d.focoId ?? null, origen: esSimulada(d) ? 'simulado' : 'real', simulado: esSimulada(d) } }] : [];
  });
  const simuladas = lista.filter(esSimulada).length;
  const fc: Record<string, unknown> = { type: 'FeatureCollection', features };
  if (simuladas) fc.aviso = `${simuladas} de ${features.length} detecciones son SIMULADAS (datos de prueba): no son detecciones reales ni observaciones verificadas en campo.`;
  return { nombre: 'detecciones-ia.geojson', mime: 'application/geo+json', contenido: JSON.stringify(fc) };
}

/** Guarda un texto como archivo en la computadora. */
export function guardarTexto(nombre: string, contenido: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
