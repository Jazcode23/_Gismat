export type FocoTipo = 'basural' | 'microbasural' | 'volcadero';
export type FocoEstado = 'activo' | 'inactivo' | 'limpiado' | 'pendiente';
export type NivelRiesgo = 'Bajo' | 'Moderado' | 'Crítico';

export interface IntervencionRecord {
  fecha: string;
  cuadrilla: string;
  descripcion: string;
  volumenRemovidoTon?: number;
}

export interface FocoAmbiente {
  id: string;
  tipo: FocoTipo;
  estado: FocoEstado;
  fechaRegistro: string;
  ubicacion: string;
  barrio: string;
  coordenadas: [number, number]; // [lat, lng]
  irh: number; // 0 - 100
  nivelRiesgo: NivelRiesgo;
  distanciaCursoAgua: number; // metros
  cursoAguaCercano: string;
  microcuencaId: string;
  volumenEstimado: string;
  volumenM3: number;
  permeabilidadSuelo: string;
  observaciones: string;
  ultimaIntervencion?: IntervencionRecord;
  proximaAccionRecomendada: string;
  superficieM2: number;
}

export interface CursoAgua {
  id: string;
  nombre: string;
  tipo: 'Río Principal' | 'Canal Troncal Pluvial' | 'Arroyo' | 'Zanja Colectora';
  longitudKm: number;
  estadoConservacion: 'Crítico' | 'Regular' | 'Bueno';
  coordenadas: [number, number][];
  bufferMetros: number;
}

export interface Microcuenca {
  id: string;
  nombre: string;
  superficieKm2: number;
  irhPromedio: number;
  nivelRiesgo: NivelRiesgo;
  focosTotales: number;
  focosActivos: number;
  focosCriticos: number;
  cursosAsociados: string[];
  recomendaciones: string;
  coordenadas: [number, number][];
  color: string;
}

export interface ZonaRiesgo {
  id: string;
  nombre: string;
  tipo: 'Inundabilidad Aluvial' | 'Lixiviados Estivales' | 'Erosión de Márgenes';
  nivel: 'Alto' | 'Muy Alto' | 'Extremo';
  coordenadas: [number, number][];
  descripcion: string;
}

export interface PuntoMonitoreo {
  id: string;
  nombre: string;
  tipo: 'Estación Hidrométrica' | 'Sensor Pluviométrico' | 'Aforo de Caudal';
  coordenadas: [number, number];
  ultimoDato: string;
  valorMedido: string;
  estado: 'Operativo' | 'Mantenimiento';
}

export interface BarrioSector {
  id: string;
  nombre: string;
  habitantesAprox: number;
  coordenadas: [number, number][];
}

export interface LayerConfig {
  id: string;
  nombre: string;
  icono: string;
  visible: boolean;
  opacidad: number;
  categoria: 'focos' | 'hidrologia' | 'cuencas' | 'riesgo' | 'monitoreo' | 'base_urbana';
  conteo?: number;
  color?: string;
}

export interface GeoportalFilters {
  tipoFoco: string; // 'todos' | 'basural' | 'microbasural' | 'volcadero'
  estado: string; // 'todos' | 'activo' | 'inactivo' | 'limpiado' | 'pendiente'
  nivelRiesgo: string; // 'todos' | 'Bajo' | 'Moderado' | 'Crítico'
  irhMin: number;
  irhMax: number;
  microcuenca: string; // 'todas' | id
  proximidadMax: number; // metros (0 = cualquiera)
  searchQuery: string;
  soloAlertas: boolean;
}

export type BaseMapId = 'osm' | 'esri_satellite' | 'carto_light' | 'carto_dark' | 'topo';

export type MapTool = 'none' | 'measure_distance' | 'measure_area' | 'query_coords' | 'risk_heat';

export interface EnvironmentalAlert {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: 'proximidad_curso' | 'irh_critico' | 'lluvias_previstas' | 'lixiviados';
  nivel: 'informativa' | 'advertencia' | 'critica';
  fecha: string;
  focoId?: string;
  microcuencaId?: string;
  coordenadas?: [number, number];
}

export interface GeoportalStats {
  totalFocos: number;
  focosActivos: number;
  focosCriticos: number;
  focosLimpiados: number;
  irhPromedioSMT: number;
  residuosEstimadosM3: number;
  distanciaPromedioCauce: number;
  alertasActivas: number;
}
