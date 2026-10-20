import { useState, useEffect } from 'react';
import { api, API_ENABLED } from './apiClient';
import {
  getRelativeDateFormatted,
  getRelativeDateISO,
  getRelativeDateTime,
  getCurrentMonthName,
  getCurrentYear,
  getCurrentMonthAndYear,
  getPreviousMonthName,
} from '../utils/dynamicDateUtils';

export interface IntervencionItem {
  id?: string;
  title: string;
  badge?: string;
  date: string;
  desc: string;
  tags?: string[];
  cuadrilla?: string;
  toneladas?: number;
}

export interface FocoTraceItem {
  id: string;
  cuenca: string;
  location: string;
  statusBadge: string;
  statusBadgeClass: string;
  irhActual: number;
  irhInitial: string;
  irhBarClass: string;
  irhWidth: string;
  dotClass: string;
  lastDate: string;
  lastAction: string;
  tipoFoco: string;
  superficie: string;
  cuadrilla: string;
  prioridad: string;
  coords: string;
  distCuenca: string;
  intervencionesList: IntervencionItem[];
  volumenRemovidoTon?: number;
}

export interface AIDetectionItem {
  id: string;
  location: string;
  coords: string;
  confidence: string;
  area: string;
  date: string;
  statusType: 'nuevo' | 'confirmado' | 'descartado';
  statusText: string;
  statusSub: string;
  dotColor: string;
  distancia: string;
  cauce: string;
  pendiente: string;
  densidad: string;
  vulnHidrica: number;
  escurrimiento: number;
  residuosPeligrosos: number;
  /** Confianza exacta (confidence es el texto redondeado). */
  confianzaValor?: number;
  /** basural | microbasural | volcadero: informado por la IA o, si no, el del foco asociado. */
  tipoFoco?: string;
  /** simulado = dato de prueba generado por el sistema; no es una detección real ni una observación verificada en campo. */
  origen?: 'real' | 'simulado';
  /** Nivel de riesgo (IRH) del foco asociado; solo existe cuando la detección fue confirmada. */
  riesgo?: string | null;
  irh?: number | null;
  focoId?: string | null;
}

/** Foco tal como lo devuelve GET /api/focos/ (subconjunto que usan las pantallas). */
export interface FocoApi {
  id: string;
  ubicacion: string;
  barrio: string;
  coordenadas: [number, number];
  irh: number;
  nivelRiesgo: string;
  estado: string;
  distanciaCursoAgua: number | null;
  cursoAguaCercano: string;
  volumenM3: number;
  volumenEstimado: string;
  totalIntervenciones: number;
  alertasActivas: number;
  datosPendientes?: string[];
  irhProvisorio?: boolean;
  ultimaIntervencion: { fecha: string; cuadrilla: string; descripcion: string } | null;
}

/** GET /api/dashboard/ */
export interface DashboardData {
  focosVigentes: number;
  focosActivos: number;
  focosPorNivelRiesgo: Record<string, number>;
  espaciosRecuperados: number;
  irhPromedio: number;
  tasaIntervencion: number;
  reduccionIRH: number;
  distribucionIRH: { rango: string; cantidad: number; porcentaje: number }[];
  evolucionMensual: { mes: number; intervenciones: number; saneados: number }[];
  evolucionNiveles: { mes: number; critico: number; moderado: number; bajo: number }[];
  intervenciones: { total: number; toneladasRemovidas: number };
  riesgoPorMicrocuenca: {
    id: string;
    nombre: string;
    irhPromedio: number;
    nivelRiesgo: string;
    focosActivos: number;
    focosCriticos: number;
    focosTotales: number;
    cuadrillasActivas: number;
  }[];
}

// Initial Traceability Focos with dynamic dates relative to TODAY
const getInitialTraceFocos = (): FocoTraceItem[] => [
  {
    id: '#FOC-2026-088',
    cuenca: 'Canal Norte',
    location: 'Av. Mate de Luna y Canal Norte',
    statusBadge: 'Espacio Recuperado',
    statusBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    irhActual: 30,
    irhInitial: 'Inicial: 91 (-67%)',
    irhBarClass: 'bg-amber-500',
    irhWidth: '30%',
    dotClass: 'bg-emerald-500',
    lastDate: getRelativeDateFormatted(0),
    lastAction: 'Relleno y Plantación Nativa',
    tipoFoco: 'Basural Mixto + Escombros',
    superficie: '~450 m² estimación IA',
    cuadrilla: 'Cuadrilla Espacios Verdes - Brigada 02',
    prioridad: 'Baja (Mitigado) • IRH: 30',
    coords: '-26.8151° S, -65.2096° O',
    distCuenca: '12m',
    volumenRemovidoTon: 14,
    intervencionesList: [
      {
        title: 'Relleno, Nivelación y Plantación Nativa',
        badge: 'RECIENTE',
        date: `${getRelativeDateFormatted(0)} - Hoy`,
        desc: 'Realizado por Cuadrilla Espacios Verdes – Brigada 02. Insumos: 8 m³ de tierra negra fértil, 15 plantines autóctonos (Lapachos rosados y Tarcos). Estado actualizado a Espacio Recuperado.',
      },
      {
        title: 'Retiro de Residuos Pesados y Escombros',
        date: getRelativeDateFormatted(-6),
        desc: 'Cuadrilla Zona Norte retiró 14 toneladas con pala retroexcavadora municipal. IRH reducido de 75 a 48.',
        tags: ['14 Toneladas', '-27 pts IRH'],
      },
      {
        title: 'Limpieza Manual y Desmalezado Ribereño',
        date: getRelativeDateFormatted(-14),
        desc: 'Corte de malezas perimetrales y despeje de desembocadura del canal hacia ducto colector.',
        tags: ['Cuadrilla Desmalezado', '-16 pts IRH'],
      },
      {
        title: 'Relevamiento Inicial y Delimitación Territorial',
        date: getRelativeDateFormatted(-22),
        desc: 'Inspección ocular de técnicos municipales tras alerta satelital. Marcación de estacas y cota de riesgo de arrastre aluvial.',
        tags: ['Relevamiento In Situ', 'Sentinel-2 IA'],
      },
    ],
  },
  {
    id: '#FOC-2026-092',
    cuenca: 'Río Salí',
    location: 'Río Salí - Margen Este',
    statusBadge: 'Pendiente de Acción',
    statusBadgeClass: 'bg-red-50 text-red-700 border-red-200',
    irhActual: 86,
    irhInitial: 'Riesgo Crítico',
    irhBarClass: 'bg-red-500',
    irhWidth: '86%',
    dotClass: 'bg-red-500',
    lastDate: getRelativeDateFormatted(-1),
    lastAction: 'Detección IA Satelital',
    tipoFoco: 'Relleno Clandestino + Plásticos',
    superficie: '~680 m² estimación IA',
    cuadrilla: 'Pendiente Asignación',
    prioridad: 'Alta (Crítico) • IRH: 86',
    coords: '-26.8340° S, -65.1890° O',
    distCuenca: '18m',
    volumenRemovidoTon: 0,
    intervencionesList: [
      {
        title: 'Detección Satelital y Calificación de Riesgo',
        badge: 'ALERTA',
        date: getRelativeDateFormatted(-1),
        desc: 'Identificación automática mediante Sentinel-2 y validación de proximidad al lecho del Río Salí.',
        tags: ['Alerta Prioridad 1', 'IRH 86'],
      },
    ],
  },
  {
    id: '#FOC-2026-085',
    cuenca: 'Parque Guillermina',
    location: 'Ribera Parque Guillermina',
    statusBadge: 'Saneado / Plaza Verde',
    statusBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    irhActual: 22,
    irhInitial: 'Inicial: 74 (-70%)',
    irhBarClass: 'bg-emerald-500',
    irhWidth: '22%',
    dotClass: 'bg-emerald-500',
    lastDate: getRelativeDateFormatted(-12),
    lastAction: 'Forestando 30 ejemplares',
    tipoFoco: 'Microbasural Erradicado',
    superficie: '~280 m²',
    cuadrilla: 'Cuadrilla Espacios Verdes - Brigada 01',
    prioridad: 'Controlada • IRH: 22',
    coords: '-26.8210° S, -65.2340° O',
    distCuenca: '35m',
    volumenRemovidoTon: 8,
    intervencionesList: [
      {
        title: 'Forestación Comunitaria y Parquización',
        badge: 'CONSOLIDADO',
        date: getRelativeDateFormatted(-12),
        desc: 'Plantación de 30 ejemplares arbóreos y colocación de cartelería disuasoria ambiental.',
        tags: ['30 Ejemplares', 'Saneado 100%'],
      },
    ],
  },
  {
    id: '#FOC-2026-079',
    cuenca: 'Canal Sur',
    location: 'Av. Jujuy y Canal Sur',
    statusBadge: 'Cuadrilla Asignada',
    statusBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    irhActual: 94,
    irhInitial: 'Riesgo Crítico',
    irhBarClass: 'bg-red-600',
    irhWidth: '94%',
    dotClass: 'bg-amber-500',
    lastDate: getRelativeDateFormatted(-2),
    lastAction: 'Relevamiento hídrico',
    tipoFoco: 'Basural con Obstáculo de Escorrentía',
    superficie: '~510 m²',
    cuadrilla: 'Cuadrilla Zona Sur - Unidad 02',
    prioridad: 'Crítica Inmediata • IRH: 94',
    coords: '-26.8450° S, -65.2210° O',
    distCuenca: '8m',
    volumenRemovidoTon: 5,
    intervencionesList: [
      {
        title: 'Orden de Despacho e Inspección Hidráulica',
        badge: 'EN PROCESO',
        date: getRelativeDateFormatted(-2),
        desc: 'Relevamiento in situ del taponamiento del ducto pluvial maestro de Canal Sur.',
        tags: ['En Operación', 'Desobstrucción'],
      },
    ],
  },
];

// Initial AI detections with dynamic dates
const getInitialAIDetections = (): AIDetectionItem[] => [
  {
    id: 'AI-001',
    location: 'Av. Mate de Luna - Canal Norte',
    coords: '-26.8151° S, -65.2096° O',
    confidence: '96%',
    area: '~450 m²',
    date: getRelativeDateISO(0),
    statusType: 'nuevo',
    statusText: 'Nuevo / Pendiente IRH',
    statusSub: 'Cálculo IRH al confirmar foco',
    dotColor: 'bg-blue-500 ring-2 ring-blue-500/30',
    distancia: '45 metros',
    cauce: 'CANAL NORTE (Cauce)',
    pendiente: '4.2% con dirección de escorrentía',
    densidad: 'Alta (~320 hab/ha)',
    vulnHidrica: 92,
    escurrimiento: 88,
    residuosPeligrosos: 75,
  },
  {
    id: 'AI-002',
    location: 'B° Villa Luján - Zona Industrial',
    coords: '-26.8281° S, -65.2146° O',
    confidence: '92%',
    area: '~320 m²',
    date: getRelativeDateISO(-1),
    statusType: 'nuevo',
    statusText: 'Nuevo / Pendiente IRH',
    statusSub: 'Cálculo IRH al confirmar foco',
    dotColor: 'bg-amber-500',
    distancia: '60 metros',
    cauce: 'Canal Secundario Oeste',
    pendiente: '3.1% hacia colector',
    densidad: 'Media (~240 hab/ha)',
    vulnHidrica: 85,
    escurrimiento: 80,
    residuosPeligrosos: 68,
  },
  {
    id: 'AI-003',
    location: 'Río Salí - Margen Este',
    coords: '-26.8340° S, -65.1890° O',
    confidence: '89%',
    area: '~680 m²',
    date: getRelativeDateISO(-2),
    statusType: 'confirmado',
    statusText: 'Confirmado (FOC-2026-088)',
    statusSub: 'IRH 0.72 calculado en Geoportal',
    dotColor: 'bg-slate-300',
    distancia: '20 metros',
    cauce: 'RÍO SALÍ (Lecho Activo)',
    pendiente: '1.8% planicie aluvial',
    densidad: 'Baja (~95 hab/ha)',
    vulnHidrica: 96,
    escurrimiento: 91,
    residuosPeligrosos: 82,
  },
  {
    id: 'AI-004',
    location: 'Acceso San Cayetano - Puente',
    coords: '-26.8520° S, -65.1950° O',
    confidence: '85%',
    area: '~210 m²',
    date: getRelativeDateISO(-3),
    statusType: 'confirmado',
    statusText: 'Confirmado (FOC-2026-079)',
    statusSub: 'IRH 0.65 calculado en Geoportal',
    dotColor: 'bg-slate-300',
    distancia: '85 metros',
    cauce: 'Canal de Drenaje San Cayetano',
    pendiente: '2.5% moderada',
    densidad: 'Media (~180 hab/ha)',
    vulnHidrica: 78,
    escurrimiento: 74,
    residuosPeligrosos: 55,
  },
];

class GismatStore {
  private traceFocos: FocoTraceItem[] = API_ENABLED ? [] : getInitialTraceFocos();
  private aiDetections: AIDetectionItem[] = API_ENABLED ? [] : getInitialAIDetections();
  private totalInterventions: number = API_ENABLED ? 0 : 34;
  private recoveredSpaces: number = API_ENABLED ? 0 : 8;
  private tonsRemoved: number = API_ENABLED ? 0 : 142;
  private dashboard: DashboardData | null = null;
  private riesgoBasurales: FocoApi[] = [];
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  // Getters
  public getTraceFocos(): FocoTraceItem[] {
    return this.traceFocos;
  }

  public getAIDetections(): AIDetectionItem[] {
    return this.aiDetections;
  }

  public getDashboard(): DashboardData | null {
    return this.dashboard;
  }

  public getRiesgoBasurales(): FocoApi[] {
    return this.riesgoBasurales;
  }

  public getTotalInterventions(): number {
    return this.totalInterventions;
  }

  public getRecoveredSpaces(): number {
    return this.recoveredSpaces;
  }

  public getTonsRemoved(): number {
    return this.tonsRemoved;
  }

  public getActiveMonthName(): string {
    return getCurrentMonthName(true);
  }

  public getPreviousMonthName(): string {
    return getPreviousMonthName(true);
  }

  public getCurrentMonthAndYear(): string {
    return getCurrentMonthAndYear();
  }

  // ---------------------------------------------------------------- API (Django + PostGIS)
  /** Carga trazabilidad, detecciones de IA y contadores desde el backend. Se invoca tras el login. */
  public async hydrate(): Promise<void> {
    if (!API_ENABLED) return;
    const [focos, dets] = await Promise.all([
      api<FocoTraceItem[]>('/trazabilidad/focos/'),
      api<AIDetectionItem[]>('/detecciones-ia/?estado=todos'),
    ]);
    this.traceFocos = focos;
    this.aiDetections = dets;
    await this.refreshResumen();
    this.notify();
  }

  /** Contadores, dashboard y ranking de riesgo: cambian con cada intervención/confirmación. */
  private async refreshResumen() {
    const [r, dash, focos] = await Promise.all([
      api<{ totalInterventions: number; recoveredSpaces: number; tonsRemoved: number }>('/trazabilidad/focos/resumen/'),
      api<DashboardData>('/dashboard/'),
      api<FocoApi[]>('/focos/'), // ya viene ordenado por IRH descendente
    ]);
    this.totalInterventions = r.totalInterventions;
    this.recoveredSpaces = r.recoveredSpaces;
    this.tonsRemoved = r.tonsRemoved;
    this.dashboard = dash;
    this.riesgoBasurales = focos.filter((f) => f.estado === 'activo' || f.estado === 'pendiente').slice(0, 3);
  }

  /** Orden de despacho desde la pantalla de Riesgo Hídrico. */
  public async asignarCuadrilla(focoId: string, cuadrilla: string): Promise<void> {
    if (!API_ENABLED) return;
    await api(`/focos/${encodeURIComponent(focoId)}/asignar-cuadrilla/`, { body: { cuadrilla } });
    this.traceFocos = await api<FocoTraceItem[]>('/trazabilidad/focos/');
    await this.refreshResumen();
    this.notify();
  }

  /** Toneladas retiradas: el formulario no tiene un campo numérico, se lee de "14 Toneladas" en acciones/observaciones. */
  private inferirToneladas(action: { title: string; desc: string; tags: string[] }): number {
    const texto = [action.title, action.desc, ...action.tags].join(' ');
    const m = texto.match(/(\d+(?:[.,]\d+)?)\s*(?:t\b|tn\b|tons?\b|toneladas?)/i);
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }

  /** Relleno / plantación implican recuperación del espacio (el foco pasa a "limpiado"). */
  private inferirResultado(tags: string[]): 'limpiado' | undefined {
    return tags.some((t) => /plantaci|relleno|recuper|forestaci/i.test(t)) ? 'limpiado' : undefined;
  }

  private async addInterventionApi(
    focoId: string,
    action: { title: string; desc: string; tags: string[]; cuadrilla: string; date?: string }
  ): Promise<void> {
    const actualizado = await api<FocoTraceItem>(`/trazabilidad/focos/${encodeURIComponent(focoId)}/intervenciones/`, {
      body: {
        title: action.title,
        desc: action.desc,
        tags: action.tags,
        cuadrilla: action.cuadrilla,
        date: action.date,
        volumen_removido_ton: this.inferirToneladas(action),
        resultadoFoco: this.inferirResultado(action.tags),
      },
    });
    this.traceFocos = this.traceFocos.map((f) => (f.id === focoId ? actualizado : f));
    await this.refreshResumen();
    this.notify();
  }

  private async confirmDetectionApi(detectionId: string): Promise<void> {
    const det = await api<AIDetectionItem>(`/detecciones-ia/${encodeURIComponent(detectionId)}/confirmar/`, { body: {} });
    this.aiDetections = this.aiDetections.map((d) => (d.id === detectionId ? det : d));
    // La confirmación crea un foco nuevo: se vuelve a leer la trazabilidad y los contadores.
    this.traceFocos = await api<FocoTraceItem[]>('/trazabilidad/focos/');
    await this.refreshResumen();
    this.notify();
  }

  // Actions
  public async addInterventionToFoco(
    focoId: string,
    action: {
      title: string;
      desc: string;
      tags: string[];
      cuadrilla: string;
      date?: string;
    }
  ): Promise<void> {
    if (API_ENABLED) return this.addInterventionApi(focoId, action);
    const todayFormatted = getRelativeDateFormatted(0);
    this.traceFocos = this.traceFocos.map((foco) => {
      if (foco.id === focoId) {
        const newIntervention: IntervencionItem = {
          title: action.title,
          badge: 'RECIENTE',
          date: `${action.date || todayFormatted} - Hoy`,
          desc: action.desc,
          tags: action.tags,
        };

        // If it was not recovered, it may now be recovered or improved
        const newIrh = Math.max(15, foco.irhActual - 20);

        return {
          ...foco,
          lastDate: action.date || todayFormatted,
          lastAction: action.title,
          cuadrilla: action.cuadrilla || foco.cuadrilla,
          irhActual: newIrh,
          statusBadge: newIrh < 35 ? 'Espacio Recuperado' : 'Intervención en Curso',
          statusBadgeClass:
            newIrh < 35
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-blue-50 text-blue-700 border-blue-200',
          intervencionesList: [newIntervention, ...foco.intervencionesList],
        };
      }
      return foco;
    });

    this.totalInterventions += 1;
    this.tonsRemoved += 4;
    this.notify();
  }

  public async confirmDetection(detectionId: string): Promise<void> {
    if (API_ENABLED) return this.confirmDetectionApi(detectionId);
    this.aiDetections = this.aiDetections.map((det) => {
      if (det.id === detectionId) {
        return {
          ...det,
          statusType: 'confirmado',
          statusText: 'Confirmado en Geoportal',
          statusSub: 'IRH calculado y transmitido',
          dotColor: 'bg-emerald-500',
        };
      }
      return det;
    });
    this.notify();
  }
}

// Global Singleton Instance
export const gismatStore = new GismatStore();

// React Hook for dynamic store subscription
export function useGismatStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return gismatStore.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, []);

  return {
    traceFocos: gismatStore.getTraceFocos(),
    aiDetections: gismatStore.getAIDetections(),
    totalInterventions: gismatStore.getTotalInterventions(),
    recoveredSpaces: gismatStore.getRecoveredSpaces(),
    tonsRemoved: gismatStore.getTonsRemoved(),
    activeMonthName: gismatStore.getActiveMonthName(),
    previousMonthName: gismatStore.getPreviousMonthName(),
    currentMonthAndYear: gismatStore.getCurrentMonthAndYear(),
    addIntervention: (focoId: string, action: { title: string; desc: string; tags: string[]; cuadrilla: string; date?: string }) =>
      gismatStore.addInterventionToFoco(focoId, action),
    confirmDetection: (id: string) => gismatStore.confirmDetection(id),
    hydrate: () => gismatStore.hydrate(),
    dashboard: gismatStore.getDashboard(),
    riesgoBasurales: gismatStore.getRiesgoBasurales(),
    asignarCuadrilla: (focoId: string, cuadrilla: string) => gismatStore.asignarCuadrilla(focoId, cuadrilla),
  };
}
