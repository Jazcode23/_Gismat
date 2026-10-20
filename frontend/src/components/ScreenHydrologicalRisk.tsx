import React, { useState } from 'react';
import { ScreenId, TransitionType } from '../types';
import { GismatModal } from './GismatModal';
import { getRelativeDateFormatted, getMonthlyRiskEvolution, getCurrentYear } from '../utils/dynamicDateUtils';
import { useGismatStore, FocoApi } from '../services/gismatStore';
import { API_ENABLED } from '../services/apiClient';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const coordsTexto = ([lat, lng]: [number, number]) =>
  `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lng).toFixed(4)}° ${lng < 0 ? 'O' : 'E'}`;


interface ScreenHydrologicalRiskProps {
  onNavigate: (screen: ScreenId, transition?: TransitionType) => void;
}

interface BasuralRecord {
  id: string;
  rank: string;
  name: string;
  location: string;
  irh: number;
  irhWidth: string;
  distancia: string;
  cuerpoAgua: string;
  cuerpoAguaType: string;
  volumen: string;
  prioridad: string;
  alertas: number;
  coords: string;
  alertas24h: number;
}

type ModalStage = 'none' | 'p2' | 'p3' | 'p4' | 'p5';

export const ScreenHydrologicalRisk: React.FC<ScreenHydrologicalRiskProps> = ({ onNavigate }) => {
  const [modalStage, setModalStage] = useState<ModalStage>('none');
  const [selectedCuadrilla, setSelectedCuadrilla] = useState('alfa');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { riesgoBasurales, dashboard, asignarCuadrilla } = useGismatStore();

  const toBasural = (f: FocoApi, i: number): BasuralRecord => ({
    id: f.id,
    rank: `#${i + 1}`,
    name: f.ubicacion,
    location: f.ubicacion,
    irh: Math.round(f.irh),
    irhWidth: `${Math.round(f.irh)}%`,
    distancia: f.distanciaCursoAgua != null ? `${f.distanciaCursoAgua} m` : '-',
    cuerpoAgua: (f.cursoAguaCercano || '-').split(' (')[0],
    cuerpoAguaType: f.cursoAguaCercano || '-',
    volumen: f.datosPendientes?.includes('volumen') ? 'Sin relevar' : `~${Math.round(f.volumenM3)} m³`,
    prioridad: f.nivelRiesgo,
    alertas: f.alertasActivas,
    coords: coordsTexto(f.coordenadas),
    alertas24h: f.alertasActivas,
  });
  const BASURAL_VACIO: BasuralRecord = {
    id: '-', rank: '-', name: 'Sin focos activos', location: '-', irh: 0, irhWidth: '0%', distancia: '-',
    cuerpoAgua: '-', cuerpoAguaType: '-', volumen: '-', prioridad: '-', alertas: 0, coords: '-', alertas24h: 0,
  };
  // Con la API activa se muestran los 3 focos abiertos con mayor IRH (PostGIS); sin API, los datos de demostración.
  const mockBasurales: BasuralRecord[] = [
    {
      id: 'BR-001',
      rank: '#1',
      name: 'Basural Canal Norte - Mate de Luna',
      location: 'Basural Canal Norte - Mate de Luna',
      irh: 94,
      irhWidth: '94%',
      distancia: '12 m',
      cuerpoAgua: 'Canal Norte',
      cuerpoAguaType: 'Canal Norte (Desagüe Pluvial Maestro)',
      volumen: '~680 m³',
      prioridad: 'Crítico',
      alertas: 3,
      coords: '-26.8151° S, -65.2096° O',
      alertas24h: 3,
    },
    {
      id: 'BR-002',
      rank: '#2',
      name: 'Basural Río Salí - Margen Este',
      location: 'Río Salí - Margen Este',
      irh: 89,
      irhWidth: '89%',
      distancia: '18 m',
      cuerpoAgua: 'Río Salí',
      cuerpoAguaType: 'Río Salí (Cauce Principal)',
      volumen: '~520 m³',
      prioridad: 'Crítico',
      alertas: 2,
      coords: '-26.8340° S, -65.1890° O',
      alertas24h: 2,
    },
    {
      id: 'BR-003',
      rank: '#3',
      name: 'Basural Arroyo Medina - Bº Villa Luján',
      location: 'Arroyo Medina - Bº Villa Luján',
      irh: 76,
      irhWidth: '76%',
      distancia: '25 m',
      cuerpoAgua: 'Arroyo Medina',
      cuerpoAguaType: 'Arroyo Medina (Canal Colector)',
      volumen: '~380 m³',
      prioridad: 'Crítico',
      alertas: 2,
      coords: '-26.8281° S, -65.2146° O',
      alertas24h: 2,
    },
  ];

  const nivelApi = API_ENABLED && dashboard ? dashboard.focosPorNivelRiesgo : null;
  const nCrit = nivelApi ? nivelApi['Crítico'] ?? 0 : 18;
  const nMod = nivelApi ? nivelApi['Moderado'] ?? 0 : 55;
  const nBajo = nivelApi ? nivelApi['Bajo'] ?? 0 : 27;
  const totalFocos = nCrit + nMod + nBajo;
  const DONA = 282.7;
  const offModerado = totalFocos ? DONA * (1 - (nBajo + nMod) / totalFocos) : DONA;
  const offCritico = totalFocos ? DONA * (1 - nCrit / totalFocos) : DONA;
  // Evolución mensual: API (último IRH conocido al cierre de cada mes) o serie de demostración
  const evolucionRiesgo = API_ENABLED && dashboard
    ? dashboard.evolucionNiveles.map((e) => ({
        month: MESES[e.mes - 1], monthFull: MESES_FULL[e.mes - 1], critico: e.critico, moderado: e.moderado,
        bajo: e.bajo, isCurrent: e.mes === new Date().getMonth() + 1,
      }))
    : getMonthlyRiskEvolution();
  const maxMes = Math.max(80, ...evolucionRiesgo.map((m) => m.critico + m.moderado + m.bajo));
  const basurales: BasuralRecord[] = API_ENABLED ? riesgoBasurales.map(toBasural) : mockBasurales;
  const [selectedBasural, setSelectedBasural] = useState<BasuralRecord>(basurales[0] ?? BASURAL_VACIO);
  const fuenteApi = (b: BasuralRecord) => (API_ENABLED ? riesgoBasurales.find((f) => f.id === b.id) : undefined);

  const confirmarAsignacion = async () => {
    try {
      await asignarCuadrilla(selectedBasural.id, selectedCuadrilla);
    } catch (err) {
      window.alert((err as Error).message); // p. ej. cuadrilla no disponible o rol sin permiso
      return;
    }
    setModalStage('p5');
  };

  const getBasuralCoords = (b: BasuralRecord) => {
    const api = fuenteApi(b);
    if (api) return { lat: api.coordenadas[0], lng: api.coordenadas[1] };
    if (b.id === 'BR-001') return { lat: -26.8151, lng: -65.2096 };
    if (b.id === 'BR-002') return { lat: -26.834, lng: -65.189 };
    if (b.id === 'BR-003') return { lat: -26.8281, lng: -65.2146 };
    return { lat: -26.8151, lng: -65.2096 };
  };

  const getBasuralHistorial = (b: BasuralRecord) => {
    const api = fuenteApi(b);
    if (api) {
      if (!api.totalIntervenciones) return 'Sin intervenciones registradas en el sistema municipal';
      const u = api.ultimaIntervencion;
      return `${api.totalIntervenciones} ${api.totalIntervenciones === 1 ? 'intervención previa' : 'intervenciones previas'}${
        u ? ` • Última: ${u.descripcion} (${new Date(u.fecha + 'T00:00:00').toLocaleDateString('es-AR')})` : ''
      }`;
    }
    if (b.id === 'BR-001') {
      return `3 intervenciones previas • Último despeje con retroexcavadora (${getRelativeDateFormatted(-14)})`;
    }
    if (b.id === 'BR-002') {
      return `2 intervenciones previas • Monitoreo preventivo de margen (${getRelativeDateFormatted(-10)})`;
    }
    if (b.id === 'BR-003') {
      return `1 intervención previa • Limpieza manual y retiro de ramas (${getRelativeDateFormatted(-5)})`;
    }
    return `2 intervenciones registradas en el sistema municipal (${getRelativeDateFormatted(-7)})`;
  };

  const getBasuralVolumenRecurso = (b: BasuralRecord) => {
    const api = fuenteApi(b);
    if (api) return api.volumenEstimado;
    if (b.id === 'BR-001') return '~680 m³ (~410 Toneladas de residuos mixtos)';
    if (b.id === 'BR-002') return '~520 m³ (~310 Toneladas de residuos mixtos)';
    if (b.id === 'BR-003') return '~380 m³ (~230 Toneladas de residuos mixtos)';
    return `${b.volumen} de residuos sólidos estimados`;
  };

  const openDetailModalFor = (item: BasuralRecord) => {
    setSelectedBasural(item);
    setModalStage('p2');
  };

  const closeAllModals = () => {
    setModalStage('none');
  };

  return (
    <div className="bg-[#f5f7fb] text-slate-700 min-h-screen flex overflow-x-hidden font-sans">
      {/* BEGIN: Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-[#1565c0] text-white flex flex-col justify-between shrink-0 min-h-screen select-none transition-all duration-200`}
        data-purpose="sidebar-navigation"
      >
        <div>
          <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
              <svg className="w-6 h-6 text-[#1565c0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
              </svg>
            </div>
            {!sidebarCollapsed && <span className="text-2xl font-black tracking-wider text-white">GISMAT</span>}
          </div>

          <nav className="mt-6 px-3 space-y-1.5 font-medium text-sm">
            <a
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
              href="#geoportal"
              onClick={(e) => {
                e.preventDefault();
                closeAllModals();
                onNavigate('GEOPORTAL', 'none');
              }}
            >
              <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {!sidebarCollapsed && <span>Geoportal</span>}
            </a>

            {/* Detecciones IA */}
            <a
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_02_AI_DETECTIONS', 'none');
              }}
              href="#detecciones-ia"
            >
              <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {!sidebarCollapsed && <span>Detecciones IA</span>}
            </a>

            {/* Riesgo Hídrico (Active) */}
            <a
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-[#00c853] text-white font-semibold shadow-md transition-all cursor-pointer"
              href="#riesgo-hidrico"
              onClick={(e) => e.preventDefault()}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {!sidebarCollapsed && <span>Riesgo Hídrico</span>}
            </a>

            {/* Trazabilidad */}
            <a
              className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_04_TRACEABILITY', 'none');
              }}
              href="#trazabilidad"
            >
              <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {!sidebarCollapsed && <span>Trazabilidad</span>}
            </a>
          </nav>
        </div>

        <div className="p-4 flex items-center justify-between text-xs text-white/70 border-t border-white/10">
          <button
            className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            {!sidebarCollapsed && <span>Contraer</span>}
          </button>
          {!sidebarCollapsed && <span className="font-mono text-white/50">v2.4</span>}
        </div>
      </aside>
      {/* END: Sidebar */}

      {/* BEGIN: MainContent */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Riesgo Hídrico</h1>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-700">Municipalidad de San Miguel de Tucumán</div>
              <div className="text-[11px] text-slate-400">Sistema de Gestión Ambiental</div>
            </div>
            <button className="relative p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#1565c0] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                AA
              </div>
              <div className="leading-tight">
                <div className="text-xs font-bold text-slate-800">AA</div>
                <div className="text-[10px] text-slate-400">Analista Ambiental</div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 md:p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          {/* Top KPI Section */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6" data-purpose="kpi-cards">
            <div className="bg-[#d32f2f] text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between h-44">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Nivel Crítico</span>
                  <div className="text-4xl font-extrabold mt-1">18</div>
                  <p className="text-xs text-white/90 mt-0.5 font-medium">Basurales de Riesgo Crítico</p>
                </div>
                <span className="bg-white/20 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase">Urgente</span>
              </div>
              <div className="flex justify-between items-end pt-4 border-t border-white/15">
                <span className="text-xs text-white/80 font-medium">Índice Crítico</span>
                <span className="text-xs font-bold tracking-wide">IRH ≥ 80</span>
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center pointer-events-none">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>

            <div className="bg-[#1976d2] text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between h-44">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Hidrografía</span>
                  <div className="text-4xl font-extrabold mt-1">8</div>
                  <p className="text-xs text-white/90 mt-0.5 font-medium">Cuerpos de Agua Afectados</p>
                </div>
                <span className="bg-white/20 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase">Monitoreo</span>
              </div>
              <div className="flex justify-between items-end pt-4 border-t border-white/15">
                <span className="text-xs text-white/80 font-medium">Estado fluvial</span>
                <span className="text-xs font-medium tracking-wide">Canales y ríos activos</span>
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center pointer-events-none">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
                </svg>
              </div>
            </div>

            <div className="bg-[#8e24aa] text-white rounded-2xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between h-44">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Notificaciones</span>
                  <div className="text-4xl font-extrabold mt-1">8</div>
                  <p className="text-xs text-white/90 mt-0.5 font-medium">Alertas Automáticas</p>
                </div>
                <span className="bg-white/20 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase">Activas</span>
              </div>
              <div className="flex justify-between items-end pt-4 border-t border-white/15">
                <span className="text-xs text-white/80 font-medium">Ventana de tiempo</span>
                <span className="text-xs font-medium tracking-wide">Últimas 24 horas</span>
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center pointer-events-none">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                  />
                </svg>
              </div>
            </div>
          </section>

          {/* Charts Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-purpose="charts">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-[#1976d2]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                    <path
                      d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Distribución por Nivel de Riesgo</h2>
                  <p className="text-xs text-slate-400">Total: {totalFocos} basurales monitoreados</p>
                </div>
              </div>

              <div className="relative flex items-center justify-center my-6">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" fill="none" r="45" stroke="#f1f5f9" strokeWidth="12" />
                  <circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r="45"
                    stroke="#00c853"
                    strokeDasharray="282.7"
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    strokeWidth="12"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r="45"
                    stroke="#ff9800"
                    strokeDasharray="282.7"
                    strokeDashoffset={offModerado}
                    strokeWidth="12"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r="45"
                    stroke="#e53935"
                    strokeDasharray="282.7"
                    strokeDashoffset={offCritico}
                    strokeWidth="12"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-extrabold text-slate-800">{totalFocos}</span>
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider">TOTAL</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-slate-600 font-medium pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e53935]"></span>
                  <span>
                    Crítico: <strong>{nCrit}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9800]"></span>
                  <span>
                    Moderado: <strong>{nMod}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00c853]"></span>
                  <span>
                    Bajo: <strong>{nBajo}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50 text-[#ff9800]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Evolución Mensual del Riesgo</h2>
                  <p className="text-xs text-slate-400">Tendencia {getCurrentYear()}</p>
                </div>
              </div>

              <div className="h-48 w-full flex items-end justify-between px-3 sm:px-5 pt-4 pb-2 border-b border-slate-100 relative">
                <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span>80</span>
                  <span>60</span>
                  <span>40</span>
                  <span>20</span>
                  <span>0</span>
                </div>
                {evolucionRiesgo.map((m) => (
                  <div
                    key={m.month}
                    className="flex flex-col items-center gap-1.5 flex-1 max-w-[42px] z-10"
                    title={`${m.monthFull}: ${m.critico} Críticos, ${m.moderado} Moderados, ${m.bajo} Bajos (Total: ${m.critico + m.moderado + m.bajo})`}
                  >
                    <div
                      className={`w-5 sm:w-6.5 rounded-sm overflow-hidden flex flex-col-reverse shadow-xs transition-all hover:opacity-90 ${
                        m.isCurrent ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                      }`}
                    >
                      <div className="bg-[#00c853]" style={{ height: `${(m.bajo / maxMes) * 150}px` }}></div>
                      <div className="bg-[#ff9800]" style={{ height: `${(m.moderado / maxMes) * 150}px` }}></div>
                      <div className="bg-[#e53935]" style={{ height: `${(m.critico / maxMes) * 150}px` }}></div>
                    </div>
                    <span
                      className={`text-[11px] sm:text-xs font-medium transition-colors ${
                        m.isCurrent ? 'text-blue-700 font-bold bg-blue-50 px-1 rounded' : 'text-slate-500'
                      }`}
                    >
                      {m.month}{m.isCurrent ? '*' : ''}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-slate-600 font-medium pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e53935]"></span>
                  <span>Crítico</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9800]"></span>
                  <span>Moderado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00c853]"></span>
                  <span>Bajo</span>
                </div>
              </div>
            </div>
          </section>

          {/* Table Ranking Section */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80" data-purpose="ranking-table">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Ranking de Basurales Prioritarios</h2>
                <p className="text-xs text-slate-400">Ordenados por Índice de Riesgo Hídrico (IRH)</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">ID / UBICACIÓN</th>
                    <th className="py-3 px-3">IRH</th>
                    <th className="py-3 px-3">DISTANCIA</th>
                    <th className="py-3 px-3">CUERPO DE AGUA</th>
                    <th className="py-3 px-3">VOLUMEN</th>
                    <th className="py-3 px-3">PRIORIDAD</th>
                    <th className="py-3 px-3 text-center">ALERTAS</th>
                    <th className="py-3 px-3 text-right">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {basurales.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-3 font-bold text-slate-400">{item.rank}</td>
                      <td className="py-4 px-3">
                        <div className="text-[10px] text-slate-400 font-mono">{item.id}</div>
                        <div className="text-xs font-semibold text-slate-800">{item.name}</div>
                      </td>
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-[#e53935] h-2 rounded-full" style={{ width: item.irhWidth }}></div>
                          </div>
                          <span className="font-bold text-red-600">{item.irh}</span>
                        </div>
                      </td>
                      <td className="py-4 px-3 font-semibold text-red-500">{item.distancia}</td>
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-1.5 text-blue-600">
                          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>{item.cuerpoAgua}</span>
                        </div>
                      </td>
                      <td className="py-4 px-3 text-slate-600 font-semibold">{item.volumen}</td>
                      <td className="py-4 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                          {item.prioridad}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 font-bold text-[10px]">
                          {item.alertas}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right">
                        <button
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#1976d2] text-white font-medium hover:bg-blue-700 transition shadow-sm text-xs cursor-pointer"
                          onClick={() => openDetailModalFor(item)}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            <path
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.8"
                            />
                          </svg>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* ========================================== */}
      {/* UNIFIED MODAL 1: CUR 03 - P2               */}
      {/* ========================================== */}
      <GismatModal
        isOpen={modalStage === 'p2'}
        onClose={closeAllModals}
        id="modalP2"
        headerTheme="light"
        icon={
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        }
        badge={
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
            Nivel Crítico – Urgente (IRH {selectedBasural.irh})
          </span>
        }
        title={`Detalle del Foco Crítico de Residuo – ${selectedBasural.id}`}
        subtitle={`${selectedBasural.id} • ${selectedBasural.name}`}
        footer={
          <div className="flex items-center justify-between">
            <button className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer" onClick={closeAllModals}>
              Cerrar y volver al panel
            </button>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00c853] hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition cursor-pointer"
              onClick={() => setModalStage('p3')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              Asignar Cuadrilla
            </button>
          </div>
        }
      >
        <div className="space-y-3.5">
          {/* Quick Stats Metrics */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="border border-slate-200/80 rounded-xl p-2.5 bg-slate-50/50">
              <div className="text-[9.5px] text-slate-400 font-semibold uppercase">Índice IRH</div>
              <div className="text-lg font-extrabold text-red-600 mt-0.5">
                {selectedBasural.irh}<span className="text-xs font-normal text-slate-400">/100</span>
              </div>
              <div className="text-[9.5px] text-red-600 font-medium">Nivel Crítico</div>
            </div>
            <div className="border border-slate-200/80 rounded-xl p-2.5 bg-slate-50/50">
              <div className="text-[9.5px] text-slate-400 font-semibold uppercase">Distancia Cauce</div>
              <div className="text-lg font-extrabold text-slate-800 mt-0.5">{selectedBasural.distancia}</div>
              <div className="text-[9.5px] text-blue-600 font-medium truncate">{selectedBasural.cuerpoAgua}</div>
            </div>
            <div className="border border-slate-200/80 rounded-xl p-2.5 bg-slate-50/50">
              <div className="text-[9.5px] text-slate-400 font-semibold uppercase">Volumen Est.</div>
              <div className="text-lg font-extrabold text-slate-800 mt-0.5">{selectedBasural.volumen}</div>
              <div className="text-[9.5px] text-slate-400 font-medium">Residuos sólidos</div>
            </div>
            <div className="border border-slate-200/80 rounded-xl p-2.5 bg-slate-50/50">
              <div className="text-[9.5px] text-slate-400 font-semibold uppercase">Reportes</div>
              <div className="text-lg font-extrabold text-red-600 mt-0.5">{selectedBasural.alertas24h}</div>
              <div className="text-[9.5px] text-slate-400 font-medium">Alertas 24h</div>
            </div>
          </div>

          {/* Map Viewer Container */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs relative">
            <div className="bg-white/90 backdrop-blur px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 text-[11px]">Visor Google Maps™ • San Miguel de Tucumán</span>
              <span className="text-[9.5px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                Capa Hídrica GIS Activa
              </span>
            </div>
            <div className="h-44 relative bg-slate-100 overflow-hidden">
              <iframe
                src={`https://maps.google.com/maps?q=${getBasuralCoords(selectedBasural).lat},${getBasuralCoords(selectedBasural).lng}&hl=es&z=16&output=embed`}
                className="w-full h-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Google Maps - ${selectedBasural.name}, San Miguel de Tucumán`}
              />

              {/* Pin marcador realista del foco ambiental BR-001 sobre el mapa real */}
              <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-xs text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-xs border border-slate-200 flex items-center gap-1.5 pointer-events-none z-10">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                <span>Foco {selectedBasural.id}: {selectedBasural.name}</span>
              </div>

              <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded text-[9.5px] font-bold text-blue-700 border border-blue-200 shadow-sm flex items-center gap-1 pointer-events-none z-10">
                <svg className="w-2.5 h-2.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
                </svg>
                Cauce: {selectedBasural.distancia} de {selectedBasural.cuerpoAgua}
              </div>

              <div className="absolute bottom-2 right-2 bg-slate-900/85 backdrop-blur-xs text-white text-[9px] font-mono px-2 py-0.5 rounded shadow-xs border border-slate-700 pointer-events-none z-10">
                {selectedBasural.coords}
              </div>
            </div>
          </div>

          {/* Technical Diagnosis Form Fields */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
              <span>DATOS CLAVE DEL FOCO Y DIAGNÓSTICO TÉCNICO</span>
              <span className="text-[9.5px] text-slate-400 font-medium">ACTUALIZADO HACE 2H</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Ubicación */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-mono text-[10.5px]">
                <span className="text-[9px] text-slate-400 font-sans block">Ubicación:</span>
                {selectedBasural.name} ({selectedBasural.coords})
              </div>

              {/* Distancia al Cauce */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 text-[10.5px]">
                <span className="text-[9px] text-slate-400 block">Distancia al Cauce:</span>
                {selectedBasural.distancia} de {selectedBasural.cuerpoAgua}
              </div>

              {/* Historial - ubicado debajo de Ubicación */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 text-[10.5px]">
                <span className="text-[9px] text-slate-400 block font-sans">Historial:</span>
                {getBasuralHistorial(selectedBasural)}
              </div>

              {/* Volumen estimado del recurso - tal como aparece en la imagen */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 text-[10.5px]">
                <span className="text-[9px] text-slate-400 block font-sans">Volumen estimado del recurso:</span>
                {getBasuralVolumenRecurso(selectedBasural)}
              </div>
            </div>
          </div>
        </div>
      </GismatModal>

      {/* ========================================== */}
      {/* UNIFIED MODAL 2: CUR 03 - P3               */}
      {/* ========================================== */}
      <GismatModal
        isOpen={modalStage === 'p3'}
        onClose={closeAllModals}
        id="modalP3"
        headerTheme="light"
        icon={
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#00c853] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        }
        title="Asignar Cuadrilla Operativa"
        subtitle={`Foco Crítico ${selectedBasural.id} • ${selectedBasural.name}`}
        footer={
          <div className="flex items-center justify-between">
            <button className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer" onClick={() => setModalStage('p2')}>
              Cancelar
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white font-bold text-xs shadow-md transition cursor-pointer"
              onClick={() => setModalStage('p4')}
            >
              Siguiente
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase">
            <span>Cuadrillas Disponibles en Zona (Radio &lt; 5km)</span>
            <span className="text-emerald-600 font-bold tracking-normal bg-emerald-50 px-2 py-0.5 rounded-full">• 3 Operativas</span>
          </div>

          <label
            onClick={() => setSelectedCuadrilla('alfa')}
            className={`block p-3 rounded-xl border-2 cursor-pointer relative transition ${
              selectedCuadrilla === 'alfa'
                ? 'border-[#00c853] bg-emerald-50/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <input
                  checked={selectedCuadrilla === 'alfa'}
                  onChange={() => setSelectedCuadrilla('alfa')}
                  className="w-4 h-4 text-[#00c853] focus:ring-[#00c853] border-slate-300 cursor-pointer"
                  name="cuadrilla_choice"
                  type="radio"
                />
                <span className="text-xs font-bold text-slate-800">Cuadrilla Alfa – Saneamiento Hidráulico</span>
                <span className="text-[8.5px] font-bold bg-[#00c853]/15 text-[#00c853] px-1.5 py-0.2 rounded uppercase">
                  Recomendada
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="mt-1 pl-6 text-[11px] text-slate-600">
              <p><strong>Equipamiento:</strong> Retroexcavadora CAT 416 + Camión Batea 15m³</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                <span>👤 4 operarios</span>
                <span className="text-emerald-600 font-medium">📍 A 1.2 km (~8 min)</span>
                <span>Resp: Ing. C. Morales</span>
              </div>
            </div>
          </label>

          <label
            onClick={() => setSelectedCuadrilla('beta')}
            className={`block p-3 rounded-xl border cursor-pointer relative transition ${
              selectedCuadrilla === 'beta'
                ? 'border-2 border-[#00c853] bg-emerald-50/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <input
                  checked={selectedCuadrilla === 'beta'}
                  onChange={() => setSelectedCuadrilla('beta')}
                  className="w-4 h-4 text-[#00c853] focus:ring-[#00c853] border-slate-300 cursor-pointer"
                  name="cuadrilla_choice"
                  type="radio"
                />
                <span className="text-xs font-bold text-slate-800">Cuadrilla Beta – Desobstrucción Pluvial</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="mt-1 pl-6 text-[11px] text-slate-600">
              <p><strong>Equipamiento:</strong> Camión Desobstructor + Minipala Bobcat</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                <span>👤 5 operarios</span>
                <span className="text-blue-600 font-medium">📍 A 2.5 km (~14 min)</span>
                <span>Resp: Téc. R. Peralta</span>
              </div>
            </div>
          </label>

          <label
            onClick={() => setSelectedCuadrilla('gamma')}
            className={`block p-3 rounded-xl border cursor-pointer relative transition ${
              selectedCuadrilla === 'gamma'
                ? 'border-2 border-[#00c853] bg-emerald-50/20'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <input
                  checked={selectedCuadrilla === 'gamma'}
                  onChange={() => setSelectedCuadrilla('gamma')}
                  className="w-4 h-4 text-[#00c853] focus:ring-[#00c853] border-slate-300 cursor-pointer"
                  name="cuadrilla_choice"
                  type="radio"
                />
                <span className="text-xs font-bold text-slate-800">Cuadrilla Gamma – Residuos Especiales</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="mt-1 pl-6 text-[11px] text-slate-600">
              <p><strong>Equipamiento:</strong> Camión Volcador 10m³ + Herramientas pesadas</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                <span>👤 3 operarios</span>
                <span className="text-blue-600 font-medium">📍 A 3.1 km (~18 min)</span>
                <span>Resp: Sup. M. Juárez</span>
              </div>
            </div>
          </label>
        </div>
      </GismatModal>

      {/* ========================================== */}
      {/* UNIFIED MODAL 3: CUR 03 - P4               */}
      {/* ========================================== */}
      <GismatModal
        isOpen={modalStage === 'p4'}
        onClose={closeAllModals}
        id="modalP4"
        headerTheme="light"
        icon={
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#00c853] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        }
        title="Confirmación de Orden de Despacho"
        subtitle={`Foco Crítico ${selectedBasural.id} • ${selectedBasural.name}`}
        footer={
          <div className="flex items-center justify-between">
            <button
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
              onClick={() => setModalStage('p3')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              Volver
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white font-bold text-xs shadow-md transition cursor-pointer"
              onClick={confirmarAsignacion}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
              </svg>
              CONFIRMAR ASIGNACIÓN
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5 text-xs text-amber-900">
            <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                clipRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                fillRule="evenodd"
              />
            </svg>
            <div>
              <h4 className="font-bold text-amber-800">Orden de Despacho Inmediato</h4>
              <p className="text-amber-700/90 text-[11px] mt-0.5">
                Al confirmar, se notificará al líder de cuadrilla vía GIS-Mobile y se registrará en el Libro de Guardia Municipal.
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-3.5 space-y-3">
            <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">
              Resumen del Despacho
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[9.5px] text-slate-400 font-medium">Foco Crítico Destino:</div>
                <div className="font-bold text-slate-800 text-[11.5px] mt-0.5">{selectedBasural.id} • {selectedBasural.name}</div>
                <div className="text-[10px] text-red-600 font-medium mt-0.5">IRH {selectedBasural.irh} (Nivel Crítico)</div>
              </div>
              <div>
                <div className="text-[9.5px] text-slate-400 font-medium">Cuadrilla Seleccionada:</div>
                <div className="font-bold text-slate-800 text-[11.5px] mt-0.5">
                  {selectedCuadrilla === 'alfa'
                    ? 'Cuadrilla Alfa – Saneamiento Hidráulico'
                    : selectedCuadrilla === 'beta'
                    ? 'Cuadrilla Beta – Desobstrucción Pluvial'
                    : 'Cuadrilla Gamma – Residuos Especiales'}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium mt-0.5">4 operarios • A 1.2 km</div>
              </div>
            </div>
            <div className="text-xs pt-1 border-t border-slate-100">
              <div className="text-[9.5px] text-slate-400 font-medium">Equipamiento:</div>
              <div className="font-semibold text-slate-700 text-[11px] mt-0.5">1x Retroexcavadora + 1x Camión Batea (15m³)</div>
            </div>
            <div className="text-xs">
              <span className="inline-block bg-red-100 text-red-600 text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-red-200">
                • Despacho Urgente Prioridad 1
              </span>
            </div>
          </div>
        </div>
      </GismatModal>

      {/* ========================================== */}
      {/* UNIFIED MODAL 4: CUR 03 - P5 (ÉXITO)       */}
      {/* ========================================== */}
      <GismatModal
        isOpen={modalStage === 'p5'}
        onClose={closeAllModals}
        id="modalP5"
        headerTheme="light"
        maxWidthClass="w-[90vw] sm:w-[70vw] md:w-[50vw] lg:w-[42vw] max-w-[480px]"
        maxHeightClass="max-h-[75vh]"
      >
        <div className="py-4 px-4 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 ring-6 ring-emerald-50">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 mb-1.5">¡Cuadrilla Asignada con Éxito!</h3>
          <p className="text-xs text-slate-600 max-w-sm leading-relaxed mb-6">
            Se emitió la orden de trabajo <strong className="text-slate-800">#OT-2026-0842</strong> para el foco{' '}
            <strong className="text-slate-800">{selectedBasural.id} ({selectedBasural.name})</strong>. El equipo ya inició desplazamiento.
          </p>
          <button
            className="px-6 py-2.5 rounded-xl bg-[#1e293b] hover:bg-slate-800 text-white font-bold text-xs tracking-wide shadow-md transition cursor-pointer"
            onClick={closeAllModals}
          >
            Volver al Panel de Riesgo Hídrico
          </button>
        </div>
      </GismatModal>
    </div>
  );
};
