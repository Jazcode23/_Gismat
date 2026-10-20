import React, { useState } from 'react';
import { ScreenId, TransitionType } from '../types';
import { GismatModal } from './GismatModal';
import { useGismatStore, AIDetectionItem } from '../services/gismatStore';
import { API_ENABLED, descargarArchivo } from '../services/apiClient';
import {
  AVANZADOS_VACIOS, ESTADO_DE_PESTANA, NIVELES_RIESGO, NOMBRES_MES, TIPOS_FOCO, aplicarFiltros, armarArchivoLocal, calcularEstadisticas,
  consultaExportacion, contarFiltrosActivos, esSimulada, etiquetaTipo, guardarTexto, type FiltrosAvanzados, type FiltrosDeteccion,
} from '../utils/deteccionFiltros';
import { getRelativeDateFormatted, getCurrentYear } from '../utils/dynamicDateUtils';

interface ScreenAIDetectionsProps {
  onNavigate: (screen: ScreenId, transition?: TransitionType) => void;
}

export type DetectionItem = AIDetectionItem;

export const ScreenAIDetections: React.FC<ScreenAIDetectionsProps> = ({ onNavigate }) => {
  const { aiDetections: aiDetectionsRaw, confirmDetection, activeMonthName, previousMonthName } = useGismatStore();

  // CORRECCIÓN: el store puede devolver undefined al inicio (antes de cargar datos)
  const aiDetections: DetectionItem[] = aiDetectionsRaw ?? [];

  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'todos' | 'nuevos' | 'confirmados' | 'descartados'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [avanzados, setAvanzados] = useState<FiltrosAvanzados>(AVANZADOS_VACIOS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // CORRECCIÓN: el estado admite null (aiDetections[0] puede no existir todavía)
  const [selectedDetection, setSelectedDetection] = useState<DetectionItem | null>(aiDetections[0] ?? null);

  // Un único conjunto de datos alimenta todo: `base` (búsqueda + filtros avanzados, sin la pestaña) -> tarjetas, gráficas y contadores
  // de las pestañas; la tabla es `base` + pestaña; y la exportación usa los mismos filtros (también en el servidor).
  const filtros: FiltrosDeteccion = { ...avanzados, q: searchQuery, estado: ESTADO_DE_PESTANA[filterTab] };
  const base = React.useMemo(
    () => aplicarFiltros(aiDetectionsRaw ?? [], { ...avanzados, q: searchQuery, estado: '' }),
    [aiDetectionsRaw, avanzados, searchQuery],
  );
  const stats = React.useMemo(() => calcularEstadisticas(base), [base]);
  const filteredDetections = React.useMemo(
    () => aplicarFiltros(base, { ...AVANZADOS_VACIOS, q: '', estado: ESTADO_DE_PESTANA[filterTab] }),
    [base, filterTab],
  );
  const nAvanzados = contarFiltrosActivos(avanzados);
  const mesesDelAnio = NOMBRES_MES.slice(0, new Date().getMonth() + 1).map((n, i) => ({
    valor: `${new Date().getFullYear()}-${String(i + 1).padStart(2, '0')}`, etiqueta: `${n} ${new Date().getFullYear()}`,
  }));

  // Descarga TODAS las detecciones que coinciden con los filtros activos (pestaña, búsqueda y filtros avanzados), no solo las visibles.
  const handleExportar = async (formato: 'geojson' | 'csv') => {
    setExportMenuOpen(false);
    if (API_ENABLED) {
      try {
        await descargarArchivo(`/detecciones-ia/exportar/?formato=${formato}&${consultaExportacion(filtros)}`, `detecciones-ia.${formato === 'csv' ? 'csv' : 'geojson'}`);
      } catch (err) {
        window.alert((err as Error).message);
      }
      return;
    }
    const archivo = armarArchivoLocal(filteredDetections, formato);   // sin servidor: se arma con lo que hay en pantalla
    guardarTexto(archivo.nombre, archivo.contenido, archivo.mime);
  };

  const handleOpenDetails = (item: DetectionItem) => {
    setSelectedDetection(item);
    setInspectionModalOpen(true);
  };

  const handleConfirmDetection = async () => {
    // CORRECCIÓN: no hacer nada si no hay detección seleccionada
    if (!selectedDetection) return;
    try {
      await confirmDetection(selectedDetection.id);
    } catch (err) {
      window.alert((err as Error).message);
      return;
    }
    setInspectionModalOpen(false);
    setSuccessDialogOpen(true);
  };

  return (
    <div className="h-full flex overflow-hidden text-slate-800 bg-[#f8fafc]">
      {/* BEGIN: Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-[#1565c0] flex-shrink-0 flex flex-col justify-between text-white shadow-xl z-20 transition-all duration-200 select-none`}
        data-purpose="sidebar-navigation"
      >
        <div>
          {/* Logotipo GISMAT */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-blue-600/50">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-emerald-600 shadow-md shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div>
                <span className="font-extrabold text-xl tracking-wider text-white">GISMAT</span>
              </div>
            )}
          </div>

          {/* Menú de Enlaces */}
          <nav aria-label="Sidebar" className="mt-6 px-3 space-y-1.5">
            <a
              className="flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-blue-100 hover:bg-blue-700/60 font-medium text-sm transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('GEOPORTAL', 'none');
              }}
              href="#geoportal"
            >
              <svg className="w-5 h-5 opacity-80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex items-center gap-3.5 px-4 py-2.5 rounded-full bg-[#00c853] text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
              href="#detecciones"
              onClick={(e) => e.preventDefault()}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              {!sidebarCollapsed && <span>Detecciones IA</span>}
            </a>

            {/* Riesgo Hídrico */}
            <a
              className="flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-blue-100 hover:bg-blue-700/60 font-medium text-sm transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_03_HYDROLOGICAL_RISK', 'none');
              }}
              href="#riesgo-hidrico"
            >
              <svg className="w-5 h-5 opacity-80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex items-center gap-3.5 px-4 py-2.5 rounded-lg text-blue-100 hover:bg-blue-700/60 font-medium text-sm transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_04_TRACEABILITY', 'none');
              }}
              href="#trazabilidad"
            >
              <svg className="w-5 h-5 opacity-80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Enlace Inferior Contraer */}
        <div className="p-4 border-t border-blue-600/40">
          <button
            className="flex items-center gap-2 text-xs text-blue-200 hover:text-white transition-colors cursor-pointer w-full"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            {!sidebarCollapsed && <span>Contraer v2.4</span>}
          </button>
        </div>
      </aside>
      {/* END: Sidebar */}

      {/* BEGIN: Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar Institucional */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-10 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Inteligencia Artificial</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700">Municipalidad de San Miguel de Tucumán</p>
              <p className="text-[11px] text-slate-500">Sistema de Gestión Ambiental</p>
            </div>
            <button aria-label="Notificaciones" className="relative text-slate-400 hover:text-slate-600 cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center border border-slate-300">
              OP
            </div>
          </div>
        </header>

        {/* Contenido Scrolleable */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
          {/* Encabezado y Acciones */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-600">Panel de Monitoreo de Detecciones Satelitales Automáticas</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
              <button
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm flex items-center gap-2 cursor-pointer"
                onClick={() => setFiltrosOpen((v) => !v)}
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Filtros Avanzados
                {nAvanzados > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">{nAvanzados}</span>
                )}
              </button>
              {filtrosOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFiltrosOpen(false)} />
                  <div className="absolute right-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-3 space-y-2.5" data-purpose="advanced-filters">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Se aplican a la tabla, a las estadísticas y a la exportación</p>
                    <label className="block text-[11px] font-semibold text-slate-600">Tipo de foco
                      <select aria-label="Tipo de foco" className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" value={avanzados.tipo} onChange={(e) => setAvanzados({ ...avanzados, tipo: e.target.value })}>
                        <option value="">Todos</option>
                        {TIPOS_FOCO.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-600">Mes de la detección
                      <select aria-label="Mes" className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" value={avanzados.mes} onChange={(e) => setAvanzados({ ...avanzados, mes: e.target.value })}>
                        <option value="">Todos</option>
                        {mesesDelAnio.map((mm) => <option key={mm.valor} value={mm.valor}>{mm.etiqueta}</option>)}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-600">Confianza mínima
                      <select aria-label="Confianza mínima" className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" value={avanzados.confianzaMin} onChange={(e) => setAvanzados({ ...avanzados, confianzaMin: Number(e.target.value) })}>
                        <option value={0}>Cualquiera</option>
                        {[60, 70, 80, 90].map((c) => <option key={c} value={c}>{c}% o más</option>)}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-600">Riesgo del foco asociado
                      <select aria-label="Riesgo" className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" value={avanzados.riesgo} onChange={(e) => setAvanzados({ ...avanzados, riesgo: e.target.value })}>
                        <option value="">Todos</option>
                        {NIVELES_RIESGO.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-600">Origen de los datos
                      <select aria-label="Origen" className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600" value={avanzados.origen} onChange={(e) => setAvanzados({ ...avanzados, origen: e.target.value as FiltrosAvanzados['origen'] })}>
                        <option value="">Todos</option>
                        <option value="real">Solo reales</option>
                        <option value="simulado">Solo simulados (datos de prueba)</option>
                      </select>
                    </label>
                    <button className="w-full text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg py-1.5 hover:bg-slate-50 cursor-pointer" onClick={() => setAvanzados(AVANZADOS_VACIOS)}>
                      Limpiar filtros avanzados
                    </button>
                  </div>
                </>
              )}
              </div>
              <button
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm flex items-center gap-2 cursor-pointer"
                onClick={() => alert('Sincronizando últimas imágenes satelitales Sentinel-2 para la cuenca de Tucumán...')}
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Procesar Nuevas Imágenes
              </button>
            </div>
          </div>

          {/* BEGIN: KPI Cards Row */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" data-purpose="kpi-metrics-grid">
            <div className="bg-[#5e2786] rounded-xl p-5 text-white shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-medium tracking-wide">IA Activa</span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{stats.mesActual}</p>
                <p className="text-xs font-medium text-white/90">Focos Detectados ({activeMonthName})</p>
              </div>
              <p className="text-[11px] text-white/80 mt-3 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                {stats.variacion === null ? `Sin detecciones en ${previousMonthName}` : `${stats.variacion >= 0 ? '+' : ''}${stats.variacion}% vs mes anterior (${previousMonthName})`}
              </p>
            </div>

            <div className="bg-[#1565c0] rounded-xl p-5 text-white shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-medium tracking-wide">Sentinel-2</span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{stats.confProm === null ? '–' : `${stats.confProm}%`}</p>
                <p className="text-xs font-medium text-white/90">Confianza Promedio</p>
              </div>
              <p className="text-[11px] text-white/80 mt-3 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                Última actualización: {getRelativeDateFormatted(0)}
              </p>
            </div>

            <div className="bg-[#1b5e20] rounded-xl p-5 text-white shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-medium tracking-wide">Confirmados</span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{stats.confirmados}</p>
                <p className="text-xs font-medium text-white/90">Detecciones Verificadas</p>
              </div>
              <p className="text-[11px] text-white/80 mt-3 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                {stats.precision === null ? 'Sin detecciones revisadas' : `${stats.precision}% de precisión (confirmadas sobre revisadas)`}
              </p>
            </div>

            <div className="bg-[#c2410c] rounded-xl p-5 text-white shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-medium tracking-wide">Procesando</span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-extrabold">{stats.nuevos}</p>
                <p className="text-xs font-medium text-white/90">En Revisión Manual</p>
              </div>
              <p className="text-[11px] text-white/80 mt-3 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                {stats.rangoNuevos ? `Confianza: ${stats.rangoNuevos.min}-${stats.rangoNuevos.max}%` : 'Sin pendientes de revisión'}
              </p>
            </div>
          </section>
          {/* END: KPI Cards Row */}

          {/* BEGIN: Charts Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6" data-purpose="charts-visualizations">
            <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                    <h3 className="text-xs font-bold text-slate-800">Detecciones Mensuales</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Evolución histórica de anomalías {getCurrentYear()}</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block"></span> Detectados
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span> Confirmados
                  </span>
                </div>
              </div>

              <div className="relative h-48 w-full">
                {(() => {
                  const detectionsData = stats.monthly;
                  if (detectionsData.length === 0) return null;

                  const maxVal = stats.maxMensual;
                  const paddingL = 35;
                  const paddingR = 15;
                  const paddingT = 20;
                  const paddingB = 20;
                  const chartW = 500 - paddingL - paddingR;
                  const chartH = 160 - paddingT - paddingB;

                  const points = detectionsData.map((d, i) => {
                    const x = paddingL + (i / Math.max(1, detectionsData.length - 1)) * chartW;
                    const y = paddingT + chartH - (d.detectados / maxVal) * chartH;
                    const yConf = paddingT + chartH - (d.confirmados / maxVal) * chartH;
                    return { x, y, yConf, ...d };
                  });

                  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                  const areaD = `${lineD} L ${points[points.length - 1].x.toFixed(1)},${paddingT + chartH} L ${points[0].x.toFixed(1)},${paddingT + chartH} Z`;
                  const confLineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.yConf.toFixed(1)}`).join(' ');

                  return (
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 160">
                      <line stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="1" x1="30" x2="490" y1="20" y2="20" />
                      <line stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="1" x1="30" x2="490" y1="60" y2="60" />
                      <line stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="1" x1="30" x2="490" y1="100" y2="100" />
                      <line stroke="#e2e8f0" strokeWidth="1" x1="30" x2="490" y1="140" y2="140" />

                      <text className="text-[10px] fill-slate-400 font-sans" x="12" y="24">{Math.round(stats.maxMensual)}</text>
                      <text className="text-[10px] fill-slate-400 font-sans" x="12" y="64">{Math.round((stats.maxMensual * 2) / 3)}</text>
                      <text className="text-[10px] fill-slate-400 font-sans" x="12" y="104">{Math.round(stats.maxMensual / 3)}</text>
                      <text className="text-[10px] fill-slate-400 font-sans" x="16" y="143">0</text>

                      {/* Area and Line for Detectados */}
                      <path d={areaD} fill="#1e293b" opacity="0.85" />
                      <path d={lineD} fill="none" stroke="#0f172a" strokeWidth="2.5" />

                      {/* Line for Confirmados */}
                      <path d={confLineD} fill="none" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1.8" />

                      {/* Data dots */}
                      {points.map((p, idx) => (
                        <g key={idx}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            fill={p.isCurrent ? '#3b82f6' : '#1e293b'}
                            r={p.isCurrent ? 5 : 3.5}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        </g>
                      ))}
                    </svg>
                  );
                })()}
              </div>

              <div className="flex justify-between pl-8 pr-2 pt-2 text-[10.5px] font-semibold text-slate-700">
                {stats.monthly.map((d) => (
                  <span
                    key={d.month}
                    className={d.isCurrent ? 'text-blue-700 font-bold bg-blue-50 px-1 rounded' : 'text-slate-600'}
                  >
                    {d.month}{d.isCurrent ? '*' : ''}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  <h3 className="text-xs font-bold text-slate-800">Distribución de Confianza IA</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Índice de precisión del modelo predictivo</p>
              </div>

              <div className="h-48 flex items-end justify-between gap-3 px-2 pb-2 border-b border-slate-100">
                <div className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full bg-[#6a1b9a] rounded-t-sm transition-all hover:bg-purple-900" style={{ height: `${(stats.buckets[0] / stats.maxBucket) * 100}%`, minHeight: stats.buckets[0] > 0 ? '3%' : 0 }} title={`${stats.buckets[0]} detecciones`}></div>
                </div>
                <div className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full bg-[#7b2cbf] rounded-t-sm transition-all hover:bg-purple-800" style={{ height: `${(stats.buckets[1] / stats.maxBucket) * 100}%`, minHeight: stats.buckets[1] > 0 ? '3%' : 0 }} title={`${stats.buckets[1]} detecciones`}></div>
                </div>
                <div className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full bg-[#9d4edd] rounded-t-sm transition-all hover:bg-purple-700" style={{ height: `${(stats.buckets[2] / stats.maxBucket) * 100}%`, minHeight: stats.buckets[2] > 0 ? '3%' : 0 }} title={`${stats.buckets[2]} detecciones`}></div>
                </div>
                <div className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full bg-[#c77dff] rounded-t-sm transition-all hover:bg-purple-600" style={{ height: `${(stats.buckets[3] / stats.maxBucket) * 100}%`, minHeight: stats.buckets[3] > 0 ? '3%' : 0 }} title={`${stats.buckets[3]} detecciones`}></div>
                </div>
                <div className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full bg-[#e0aaff] rounded-t-sm transition-all hover:bg-purple-400" style={{ height: `${(stats.buckets[4] / stats.maxBucket) * 100}%`, minHeight: stats.buckets[4] > 0 ? '3%' : 0 }} title={`${stats.buckets[4]} detecciones`}></div>
                </div>
              </div>

              <div className="flex justify-between px-1 pt-2 text-[10px] font-semibold text-slate-600">
                <span className="flex-1 text-center">90-100%</span>
                <span className="flex-1 text-center">80-90%</span>
                <span className="flex-1 text-center">70-80%</span>
                <span className="flex-1 text-center">60-70%</span>
                <span className="flex-1 text-center">&lt;60%</span>
              </div>
            </div>
          </section>
          {/* END: Charts Section */}

          {/* BEGIN: Table Section */}
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden" data-purpose="detections-table-container">
            <div className="p-5 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  <h3 className="text-xs font-bold text-slate-800">Focos Detectados Automáticamente</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Últimas detecciones registradas por el modelo de IA y Sentinel-2</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                  <button
                    className={`px-3 py-1 rounded-md cursor-pointer transition ${
                      filterTab === 'todos' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                    }`}
                    onClick={() => setFilterTab('todos')}
                  >
                    Todos ({stats.total})
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md cursor-pointer transition ${
                      filterTab === 'nuevos' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                    }`}
                    onClick={() => setFilterTab('nuevos')}
                  >
                    Nuevos ({stats.nuevos})
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md cursor-pointer transition ${
                      filterTab === 'confirmados' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                    }`}
                    onClick={() => setFilterTab('confirmados')}
                  >
                    Confirmados ({stats.confirmados})
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md cursor-pointer transition ${
                      filterTab === 'descartados' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                    }`}
                    onClick={() => setFilterTab('descartados')}
                  >
                    Descartados ({stats.descartados})
                  </button>
                </div>

                <div className="relative">
                  <input
                    className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 w-44"
                    placeholder="Filtrar por calle o ID..."
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>

                <div className="relative">
                <button
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
                  onClick={() => setExportMenuOpen((v) => !v)}
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  GeoJSON / CSV
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                        Se descarga la pestaña activa: {filterTab}
                      </p>
                      <button className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer" onClick={() => handleExportar('geojson')}>
                        Descargar GeoJSON <span className="text-slate-400">(.geojson)</span>
                      </button>
                      <button className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer" onClick={() => handleExportar('csv')}>
                        Descargar CSV <span className="text-slate-400">(.csv, abre en Excel)</span>
                      </button>
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-5">ID</th>
                    <th className="py-3 px-4">TIPO DE FOCO</th>
                    <th className="py-3 px-4">UBICACIÓN GEORREFERENCIADA</th>
                    <th className="py-3 px-4 text-center">CONFIANZA IA</th>
                    <th className="py-3 px-4">ÁREA EST.</th>
                    <th className="py-3 px-4">FECHA DETECCIÓN</th>
                    <th className="py-3 px-4">ESTADO</th>
                    <th className="py-3 px-4">RIESGO</th>
                    <th className="py-3 px-4">CAUCE</th>
                    <th className="py-3 px-5 text-right">ACCIONES DE VERIFICACIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDetections.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 px-5 text-center text-slate-400 text-xs">
                        No hay detecciones para mostrar.
                      </td>
                    </tr>
                  )}
                  {filteredDetections.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-slate-800 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${row.dotColor}`}></span>
                        {row.id}
                        {esSimulada(row) && (
                          <span title="Dato de prueba: no es una detección real" className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[9px] font-extrabold tracking-wide">
                            SIMULADO
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">{etiquetaTipo(row.tipoFoco)}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{row.location}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{row.coords}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-900">{row.confidence}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">{row.area}</td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                            />
                          </svg>
                          {row.date}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {row.statusType === 'confirmado' ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                              <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                              </svg>
                              {row.statusText}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">{row.statusSub}</div>
                          </>
                        ) : (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${row.statusType === 'descartado' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>
                              {row.statusText}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">{row.statusSub}</div>
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {row.riesgo ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            row.riesgo === 'Crítico' ? 'bg-red-100 text-red-800' : row.riesgo === 'Moderado' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {row.riesgo}{row.irh != null ? ` · IRH ${row.irh}` : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400" title="El riesgo se calcula al confirmar el foco">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {row.cauce ? (
                          <>
                            <div className="font-medium text-slate-700">{row.cauce}</div>
                            {row.distancia && row.distancia !== '-' && <div className="text-[10px] text-slate-400">a {row.distancia}</div>}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          className="text-xs font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          onClick={() => handleOpenDetails(row)}
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
                          Ver detalles
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2" data-purpose="table-footer">
              <span>
                Mostrando <strong className="text-slate-700">{filteredDetections.length}</strong> de <strong className="text-slate-700">{aiDetectionsRaw?.length ?? 0}</strong> detecciones
                {(searchQuery.trim() || nAvanzados > 0 || filterTab !== 'todos') && ' (con filtros)'}
              </span>
              {stats.simuladas > 0 && (
                <span className="font-semibold text-violet-700">
                  Incluye {stats.simuladas} detecciones SIMULADAS (datos de prueba): no son detecciones reales
                </span>
              )}
            </div>
          </section>
          {/* END: Table Section */}
        </main>
      </div>
      {/* END: Main Area */}

      {/* BEGIN: Unified Inspection Modal (CUR 02 - P2) */}
      <GismatModal
        isOpen={inspectionModalOpen}
        onClose={() => setInspectionModalOpen(false)}
        id="inspection-modal"
        headerTheme="dark"
        icon={
          <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
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
        title={`Inspección de Foco ${selectedDetection?.id ?? ''}`}
        subtitle="Evaluación Satelital Sentinel-2 • El Índice IRH se calculará automáticamente al confirmar e incorporar en el Geoportal"
        footer={
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Detección: <span className="font-mono font-bold text-slate-700">{selectedDetection?.id ?? ''}</span>
            </span>
            <span>Operador: Lic. M. Argañaraz (Dirección Ambiental)</span>
          </div>
        }
      >
        {/* CORRECCIÓN PRINCIPAL: solo renderizar el contenido si hay una detección seleccionada */}
        {selectedDetection && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {esSimulada(selectedDetection) && (
              <div className="md:col-span-12 rounded-lg border border-dashed border-violet-400 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-800" role="note">
                SIMULADO · DATOS DE PRUEBA: esta detección fue generada por el sistema para demostración. No es una detección real ni una observación verificada en campo.
              </div>
            )}
            {/* Columna Izquierda: Visor Ortomosaico y Datos Geográficos */}
            <div className="md:col-span-7 space-y-3.5">
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner relative h-48 flex flex-col justify-between p-2.5">
                <div className="flex items-center justify-between z-10">
                  <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                    ORTOMOSAICO SENTINEL-2 &amp; DELIMITACIÓN
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 bg-black/60 px-1.5 py-0.5 rounded">Res. 10m/px</span>
                </div>

                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 220">
                  <line opacity="0.4" stroke="#334155" strokeWidth="0.8" x1="0" x2="400" y1="70" y2="70" />
                  <line opacity="0.4" stroke="#334155" strokeWidth="0.8" x1="0" x2="400" y1="140" y2="140" />
                  <line opacity="0.4" stroke="#334155" strokeWidth="0.8" x1="130" x2="130" y1="0" y2="220" />
                  <line opacity="0.4" stroke="#334155" strokeWidth="0.8" x1="260" x2="260" y1="0" y2="220" />

                  <path d="M 120,160 Q 240,140 400,180" fill="none" stroke="#0284c7" strokeLinecap="round" strokeWidth="12" />
                  <text fill="#7dd3fc" fontSize="9" fontWeight="bold" x="270" y="172">
                    {selectedDetection.cauce ?? ''}
                  </text>

                  <polygon fill="#b91c1c" fillOpacity="0.75" points="170,140 215,138 225,170 178,172" stroke="#ef4444" strokeDasharray="3 2" strokeWidth="2" />
                  <text fill="#ffffff" fontSize="7.5" fontWeight="bold" x="172" y="156">
                    {selectedDetection.id ?? ''} ({selectedDetection.area ?? ''})
                  </text>

                  <line stroke="#fbbf24" strokeDasharray="3 3" strokeWidth="1.8" x1="190" x2="185" y1="138" y2="105" />
                  <circle cx="185" cy="105" fill="#f59e0b" r="3.5" />
                  <rect fill="#eab308" height="15" rx="3" width="55" x="175" y="88" />
                  <text fill="#000000" fontSize="8" fontWeight="bold" x="180" y="99">
                    {selectedDetection.distancia ?? '-'}
                  </text>
                </svg>

                <div className="flex items-center justify-between z-10">
                  <span className="text-[9px] text-slate-400 bg-black/60 px-2 py-0.5 rounded">Banda: NDVI / SWIR Multispectral</span>
                  <span className="text-[9px] text-slate-400 bg-black/60 px-2 py-0.5 rounded">Paso: {selectedDetection.date ?? '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[9px] uppercase font-bold text-slate-500">UBICACIÓN Y GEOREFERENCIA</p>
                  <p className="font-semibold text-slate-800 text-[11px] truncate mt-0.5">{selectedDetection.location}</p>
                  <p className="text-[10px] font-mono text-slate-500 truncate">{selectedDetection.coords}</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[9px] uppercase font-bold text-slate-500">DISTANCIA CRÍTICA A DRENAJE</p>
                  <p className="font-bold text-red-600 text-xs mt-0.5">{selectedDetection.distancia ?? '-'}</p>
                  <p className="text-[10px] text-slate-500 truncate">Proximidad directa a cauce pluvial</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[9px] uppercase font-bold text-slate-500">PENDIENTE TOPOGRÁFICA</p>
                  <p className="font-semibold text-slate-800 text-[11px] mt-0.5 truncate">{selectedDetection.pendiente ?? '-'}</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[9px] uppercase font-bold text-slate-500">DENSIDAD URBANA</p>
                  <p className="font-semibold text-amber-700 text-[11px] mt-0.5 truncate">{selectedDetection.densidad ?? '-'}</p>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Detalle de IA y Acciones */}
            <div className="md:col-span-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">Detalle de la Detección IA</h4>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    Modelo IA v3.4
                  </span>
                </div>

                <div className="mt-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-blue-700 flex items-center gap-1 font-semibold text-[11px]">
                      CONFIANZA DEL MODELO IA
                    </span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                      {selectedDetection.confidence} Certeza
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-extrabold text-slate-900">{selectedDetection.id}</span>
                    <span className="text-xs text-slate-500">(Superficie: {selectedDetection.area})</span>
                  </div>
                </div>

                <div className="mt-2.5 p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[10.5px] text-amber-900">
                  <p className="font-bold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                    Cálculo de IRH: Pendiente
                  </p>
                  <p className="mt-0.5 text-slate-600 leading-tight">
                    Al confirmar, se registrará el foco en el Geoportal y se calculará el <strong>Índice de Riesgo Hídrico</strong>.
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  <span className="font-bold text-slate-700 text-[11px] block">Variables Satelitales:</span>
                  <div>
                    <div className="flex justify-between text-[10.5px] font-medium text-slate-700 mb-0.5">
                      <span>Vulnerabilidad Hídrica</span>
                      <span className="font-bold text-red-600">{selectedDetection.vulnHidrica ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${selectedDetection.vulnHidrica ?? 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10.5px] font-medium text-slate-700 mb-0.5">
                      <span>Afectación de Escurrimiento</span>
                      <span className="font-bold text-orange-600">{selectedDetection.escurrimiento ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${selectedDetection.escurrimiento ?? 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10.5px] font-medium text-slate-700 mb-0.5">
                      <span>Residuos Peligrosos</span>
                      <span className="font-bold text-amber-600">{selectedDetection.residuosPeligrosos ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${selectedDetection.residuosPeligrosos ?? 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    className="py-2 px-3 bg-[#00c853] hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                    onClick={handleConfirmDetection}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                    CONFIRMAR
                  </button>
                  <button
                    className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                    onClick={() => setInspectionModalOpen(false)}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                    DESCARTAR
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </GismatModal>

      {/* BEGIN: Success Modal Dialog (CUR 02 - P3) with Unified Width & Style */}
      <GismatModal
        isOpen={successDialogOpen}
        onClose={() => setSuccessDialogOpen(false)}
        id="success-dialog"
        headerTheme="light"
        maxWidthClass="w-[90vw] sm:w-[70vw] md:w-[50vw] lg:w-[42vw] max-w-[480px]"
        maxHeightClass="max-h-[75vh]"
      >
        <div className="p-4 text-center">
          <div className="w-13 h-13 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3.5">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </svg>
          </div>
          <h3 className="text-base font-extrabold text-slate-900">¡Foco incorporado!</h3>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            El foco <span className="font-bold text-slate-900">{selectedDetection?.id ?? ''} ({selectedDetection?.location ?? ''})</span> ha sido confirmado
            e incorporado exitosamente al Geoportal. En consecuencia, se ha procedido al cálculo del Índice de Riesgo Hídrico (
            <span className="font-bold text-red-600">IRH 0.84</span>) y a la sincronización de capas y registros de trazabilidad.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              onClick={() => setSuccessDialogOpen(false)}
            >
              Permanecer en IA
            </button>
            {/* Matches xpath: //div[@id='success-dialog']//button[contains(., 'Ir al Geoportal')] */}
            <button
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              onClick={() => {
                setSuccessDialogOpen(false);
                onNavigate('GEOPORTAL', 'push');
              }}
            >
              Ir al Geoportal
            </button>
          </div>
        </div>
      </GismatModal>
    </div>
  );
};