/**
 * GISMAT Geoportal Service
 * Capa de abstracción de datos para el Geoportal Municipal de San Miguel de Tucumán.
 *
 * NOTA DE ARQUITECTURA:
 * Actualmente utiliza el conjunto de datos mock representativo de SMT.
 * Está estructurado de forma asíncrona para que al conectarse al backend
 * con PostgreSQL y PostGIS sólo requiera cambiar el adapter interno o activar
 * las llamadas `fetch('/api/geoportal/...')`.
 */

import {
  FocoAmbiente,
  CursoAgua,
  Microcuenca,
  ZonaRiesgo,
  PuntoMonitoreo,
  BarrioSector,
  LayerConfig,
  GeoportalFilters,
  EnvironmentalAlert,
  GeoportalStats,
} from '../types/geoportal';

import { api, qs, API_ENABLED } from './apiClient';

import {
  MOCK_FOCOS_AMBIENTALES,
  MOCK_CURSOS_AGUA,
  MOCK_MICROCUENCAS,
  MOCK_ZONAS_RIESGO,
  MOCK_PUNTOS_MONITOREO,
  MOCK_BARRIOS,
  INITIAL_LAYERS,
  MOCK_ALERTAS_AMBIENTALES,
  MOCK_GEOPORTAL_STATS,
} from '../data/mockGeoportalData';

export interface SearchResultItem {
  id: string;
  titulo: string;
  subtitulo: string;
  categoria: 'foco' | 'microcuenca' | 'curso' | 'direccion';
  coordenadas: [number, number];
  data?: unknown;
}

export class GeoportalService {
  private useApiBackend = API_ENABLED; // API REST (Django + PostGIS). VITE_USE_API=false => datos mock

  /**
   * Obtiene la lista de capas disponibles y su estado
   */
  async getCapas(): Promise<LayerConfig[]> {
    if (this.useApiBackend) {
      return api<LayerConfig[]>('/geoportal/capas');
    }
    return Promise.resolve([...INITIAL_LAYERS]);
  }

  /**
   * Obtiene los focos ambientales aplicando los filtros del Geoportal
   * Mapeo PostGIS equivalente:
   * SELECT id, tipo, estado, irh, ST_AsGeoJSON(geom), ST_Distance(geom, cursos.geom)
   * FROM focos_residuos WHERE irh >= :min AND irh <= :max ...
   */
  async getFocos(filters?: Partial<GeoportalFilters>): Promise<FocoAmbiente[]> {
    if (this.useApiBackend) {
      return api<FocoAmbiente[]>(`/geoportal/focos${qs((filters || {}) as Record<string, unknown>)}`);
    }

    let items = [...MOCK_FOCOS_AMBIENTALES];

    if (!filters) return items;

    if (filters.tipoFoco && filters.tipoFoco !== 'todos') {
      items = items.filter((f) => f.tipo === filters.tipoFoco);
    }

    if (filters.estado && filters.estado !== 'todos') {
      items = items.filter((f) => f.estado === filters.estado);
    }

    if (filters.nivelRiesgo && filters.nivelRiesgo !== 'todos') {
      items = items.filter((f) => f.nivelRiesgo === filters.nivelRiesgo);
    }

    if (typeof filters.irhMin === 'number') {
      items = items.filter((f) => f.irh >= filters.irhMin!);
    }

    if (typeof filters.irhMax === 'number') {
      items = items.filter((f) => f.irh <= filters.irhMax!);
    }

    if (filters.microcuenca && filters.microcuenca !== 'todas') {
      items = items.filter((f) => f.microcuencaId === filters.microcuenca);
    }

    if (filters.proximidadMax && filters.proximidadMax > 0) {
      items = items.filter((f) => f.distanciaCursoAgua <= filters.proximidadMax!);
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      items = items.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          f.ubicacion.toLowerCase().includes(q) ||
          f.barrio.toLowerCase().includes(q) ||
          f.cursoAguaCercano.toLowerCase().includes(q)
      );
    }

    if (filters.soloAlertas) {
      const idsConAlerta = MOCK_ALERTAS_AMBIENTALES.map((a) => a.focoId).filter(Boolean);
      items = items.filter((f) => idsConAlerta.includes(f.id));
    }

    return Promise.resolve(items);
  }

  /**
   * Obtiene un foco ambiental individual por su identificador
   */
  async getFocoById(id: string): Promise<FocoAmbiente | null> {
    if (this.useApiBackend) {
      return api<FocoAmbiente>(`/geoportal/focos/${encodeURIComponent(id)}`).catch(() => null);
    }
    const foco = MOCK_FOCOS_AMBIENTALES.find((f) => f.id === id) || null;
    return Promise.resolve(foco);
  }

  /**
   * Obtiene los cursos de agua (Río Salí, Canal Norte, Canal Sur, etc.)
   * Mapeo PostGIS:
   * SELECT id, nombre, tipo, ST_AsGeoJSON(geom), ST_Length(geom::geography)/1000 AS longitud_km
   * FROM cursos_agua
   */
  async getCursosAgua(): Promise<CursoAgua[]> {
    if (this.useApiBackend) {
      return api<CursoAgua[]>('/geoportal/cursos-agua');
    }
    return Promise.resolve([...MOCK_CURSOS_AGUA]);
  }

  /**
   * Obtiene las microcuencas urbanas
   * Mapeo PostGIS:
   * SELECT id, nombre, ST_AsGeoJSON(geom), ST_Area(geom::geography)/1000000 AS area_km2,
   *   AVG(focos.irh) as irh_promedio
   * FROM microcuencas
   */
  async getMicrocuencas(): Promise<Microcuenca[]> {
    if (this.useApiBackend) {
      return api<Microcuenca[]>('/geoportal/microcuencas');
    }
    return Promise.resolve([...MOCK_MICROCUENCAS]);
  }

  /**
   * Obtiene zonas de riesgo aluvial y lixiviados
   */
  async getZonasRiesgo(): Promise<ZonaRiesgo[]> {
    if (this.useApiBackend) {
      return api<ZonaRiesgo[]>('/geoportal/zonas-riesgo');
    }
    return Promise.resolve([...MOCK_ZONAS_RIESGO]);
  }

  /**
   * Obtiene los puntos de monitoreo hidrométrico y meteorológico
   */
  async getPuntosMonitoreo(): Promise<PuntoMonitoreo[]> {
    if (this.useApiBackend) {
      return api<PuntoMonitoreo[]>('/geoportal/puntos-monitoreo');
    }
    return Promise.resolve([...MOCK_PUNTOS_MONITOREO]);
  }

  /**
   * Obtiene los límites de los barrios de San Miguel de Tucumán
   */
  async getBarrios(): Promise<BarrioSector[]> {
    if (this.useApiBackend) {
      return api<BarrioSector[]>('/geoportal/barrios');
    }
    return Promise.resolve([...MOCK_BARRIOS]);
  }

  /**
   * Obtiene las alertas de riesgo hidrológico y ambiental de GISMAT
   */
  async getAlertas(): Promise<EnvironmentalAlert[]> {
    if (this.useApiBackend) {
      return api<EnvironmentalAlert[]>('/geoportal/alertas');
    }
    return Promise.resolve([...MOCK_ALERTAS_AMBIENTALES]);
  }

  /**
   * Obtiene indicadores cuantitativos del territorio
   */
  async getEstadisticas(): Promise<GeoportalStats> {
    if (this.useApiBackend) {
      return api<GeoportalStats>('/geoportal/estadisticas');
    }
    return Promise.resolve({ ...MOCK_GEOPORTAL_STATS });
  }

  /**
   * Búsqueda integral predictiva por ID de foco, dirección, microcuenca o curso de agua
   */
  async buscarLugares(query: string): Promise<SearchResultItem[]> {
    if (!query || query.trim().length < 2) return [];

    const q = query.trim().toLowerCase();
    const results: SearchResultItem[] = this.useApiBackend
      ? await api<SearchResultItem[]>(`/geoportal/buscar${qs({ q: query.trim() })}`)
      : [];

    // Buscar en Focos
    for (const f of this.useApiBackend ? [] : MOCK_FOCOS_AMBIENTALES) {
      if (
        f.id.toLowerCase().includes(q) ||
        f.ubicacion.toLowerCase().includes(q) ||
        f.barrio.toLowerCase().includes(q)
      ) {
        results.push({
          id: f.id,
          titulo: `${f.id} — ${f.ubicacion}`,
          subtitulo: `Foco ${f.tipo} | IRH: ${f.irh} (${f.nivelRiesgo}) | ${f.barrio}`,
          categoria: 'foco',
          coordenadas: f.coordenadas,
          data: f,
        });
      }
    }

    // Buscar en Microcuencas
    for (const mc of this.useApiBackend ? [] : MOCK_MICROCUENCAS) {
      if (mc.nombre.toLowerCase().includes(q)) {
        // Coordenada central aproximada del primer vértice
        results.push({
          id: mc.id,
          titulo: mc.nombre,
          subtitulo: `Microcuenca | IRH Prom: ${mc.irhPromedio} | ${mc.focosTotales} focos`,
          categoria: 'microcuenca',
          coordenadas: mc.coordenadas[0],
          data: mc,
        });
      }
    }

    // Buscar en Cursos de agua
    for (const c of this.useApiBackend ? [] : MOCK_CURSOS_AGUA) {
      if (c.nombre.toLowerCase().includes(q) || c.tipo.toLowerCase().includes(q)) {
        const midPoint = c.coordenadas[Math.floor(c.coordenadas.length / 2)];
        results.push({
          id: c.id,
          titulo: c.nombre,
          subtitulo: `${c.tipo} (${c.longitudKm} km) | Estado: ${c.estadoConservacion}`,
          categoria: 'curso',
          coordenadas: midPoint,
          data: c,
        });
      }
    }

    // Direcciones urbanas típicas de San Miguel de Tucumán
    const direccionesComunes = [
      { nombre: 'Plaza Independencia (Microcentro)', coords: [-26.8309, -65.2038] as [number, number] },
      { nombre: 'Av. Mate de Luna 2800', coords: [-26.822, -65.231] as [number, number] },
      { nombre: 'Av. Jujuy y Canal Sur', coords: [-26.8582, -65.2215] as [number, number] },
      { nombre: 'Av. Siria y Canal Norte', coords: [-26.806, -65.215] as [number, number] },
      { nombre: 'Parque 9 de Julio (Lago San Miguel)', coords: [-26.825, -65.185] as [number, number] },
      { nombre: 'Puente Lucas Córdoba (Río Salí)', coords: [-26.832, -65.176] as [number, number] },
      { nombre: 'Av. Roca y Av. Colón', coords: [-26.848, -65.234] as [number, number] },
    ];

    for (const dir of direccionesComunes) {
      if (dir.nombre.toLowerCase().includes(q)) {
        results.push({
          id: `dir_${dir.nombre.replace(/\s+/g, '_')}`,
          titulo: dir.nombre,
          subtitulo: 'Punto de referencia urbano en San Miguel de Tucumán',
          categoria: 'direccion',
          coordenadas: dir.coords,
        });
      }
    }

    return Promise.resolve(results.slice(0, 7));
  }
}

export const geoportalService = new GeoportalService();
