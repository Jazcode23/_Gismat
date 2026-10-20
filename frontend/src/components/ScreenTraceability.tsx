import React, { useState } from 'react';
import { ScreenId, TransitionType } from '../types';
import { GismatModal } from './GismatModal';

interface ScreenTraceabilityProps {
  onNavigate: (screen: ScreenId, transition?: TransitionType) => void;
}

import { useGismatStore, FocoTraceItem } from '../services/gismatStore';
import { getRelativeDateFormatted } from '../utils/dynamicDateUtils';

export type FocoRecord = FocoTraceItem;

export const ScreenTraceability: React.FC<ScreenTraceabilityProps> = ({ onNavigate }) => {
  const {
    traceFocos,
    totalInterventions,
    recoveredSpaces,
    previousMonthName,
    addIntervention,
  } = useGismatStore();

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('Av. Mate de Luna - Canal Norte');
  const [zoneFilter, setZoneFilter] = useState('Zona Norte (Canal Norte)');
  const [statusFilter, setStatusFilter] = useState('En Intervención (12)');
  const [riskFilter, setRiskFilter] = useState('Moderado (40–79)');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [selectedFocoId, setSelectedFocoId] = useState<string>('#FOC-2026-088');

  // CORRECCIÓN: el store puede devolver undefined/[] antes de cargar los datos
  const focosList: FocoRecord[] = traceFocos ?? [];
  // CORRECCIÓN: selectedFoco puede ser null si la lista está vacía
  const selectedFoco: FocoRecord | null =
    focosList.find((f) => f.id === selectedFocoId) ?? focosList[0] ?? null;
  const intervenciones = selectedFoco?.intervencionesList ?? [];

  const [selectedPhoto, setSelectedPhoto] = useState<{
    src: string;
    label: string;
    date: string;
    desc: string;
  } | null>(null);

  // Form states for new intervention with dynamic date
  const [selectedActions, setSelectedActions] = useState<string[]>([
    'Relleno y nivelación',
    'Plantación Nativa',
  ]);
  const [interventionDate, setInterventionDate] = useState(getRelativeDateFormatted(0));
  const [crewAssigned, setCrewAssigned] = useState('Cuadrilla Espacios Verdes - Brigada 02');
  const [volumeObra, setVolumeObra] = useState(
    '8 m³ de tierra negra fértil y 15 plantines autóctonos (Lapachos rosados y Tarcos)'
  );
  const [observations, setObservations] = useState(
    'Se completó la nivelación del terreno con aporte de suelo compactado para evitar anegamientos en banquina. Inicio de plantación comunitaria con vecinos del barrio para consolidar espacio verde recuperado.'
  );

  const toggleAction = (actionName: string) => {
    setSelectedActions((prev) =>
      prev.includes(actionName) ? prev.filter((a) => a !== actionName) : [...prev, actionName]
    );
  };

  const handleOpenDetailModal = (foco: FocoRecord) => {
    setSelectedFocoId(foco.id);
    setDetailModalOpen(true);
  };

  const handleIntervencionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // CORRECCIÓN: no hacer nada si no hay foco seleccionado
    if (!selectedFoco) return;
    try {
      await addIntervention(selectedFoco.id, {
        title: selectedActions.join(', ') || 'Intervención de Saneamiento',
        desc: observations,
        tags: selectedActions,
        cuadrilla: crewAssigned,
        date: interventionDate,
      });
    } catch (err) {
      window.alert((err as Error).message); // p. ej. rol sin permiso o datos inválidos
      return;
    }
    setRegisterModalOpen(false);
    setSuccessModalOpen(true);
  };

  const returnToFocoDetails = () => {
    setSuccessModalOpen(false);
    setDetailModalOpen(true);
  };

  return (
    <div className="bg-[#F6F9FD] text-slate-800 font-sans antialiased min-h-screen flex flex-col md:flex-row overflow-x-hidden">
      {/* BEGIN: MainSidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-full md:w-64'
        } bg-[#1B6BC9] text-white flex-shrink-0 flex flex-col justify-between py-6 px-4 z-20 transition-all duration-200 select-none`}
        data-purpose="sidebar-navigation"
      >
        <div>
          <div className="flex items-center space-x-3 px-3 mb-8">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-leaf text-[#00A854] text-xl"></i>
            </div>
            {!sidebarCollapsed && <span className="text-2xl font-black tracking-wide">GISMAT</span>}
          </div>

          <nav className="space-y-2">
            <a
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('GEOPORTAL', 'none');
              }}
              href="#geoportal"
            >
              <i className="fa-solid fa-map-location-dot text-lg w-5"></i>
              {!sidebarCollapsed && <span>Geoportal</span>}
            </a>

            {/* Detecciones IA */}
            <a
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_02_AI_DETECTIONS', 'none');
              }}
              href="#detecciones-ia"
            >
              <i className="fa-solid fa-desktop text-lg w-5"></i>
              {!sidebarCollapsed && <span>Detecciones IA</span>}
            </a>

            {/* Riesgo Hídrico */}
            <a
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-white/90 hover:bg-white/10 transition text-sm font-medium cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('CUR_03_HYDROLOGICAL_RISK', 'none');
              }}
              href="#riesgo-hidrico"
            >
              <i className="fa-solid fa-droplet text-lg w-5"></i>
              {!sidebarCollapsed && <span>Riesgo Hídrico</span>}
            </a>

            {/* Trazabilidad (Active) */}
            <a
              className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-[#00B050] text-white font-semibold shadow-md transition text-sm cursor-pointer"
              href="#trazabilidad"
              onClick={(e) => e.preventDefault()}
            >
              <i className="fa-solid fa-file-waveform text-lg w-5"></i>
              {!sidebarCollapsed && <span>Trazabilidad</span>}
            </a>
          </nav>
        </div>

        <div className="pt-6 border-t border-white/20 flex items-center justify-between text-xs text-white/75 px-2">
          <button
            className="flex items-center space-x-2 hover:text-white transition cursor-pointer"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <i className="fa-solid fa-bars-staggered"></i>
            {!sidebarCollapsed && <span>Contraer</span>}
          </button>
          {!sidebarCollapsed && <span>v2.4</span>}
        </div>
      </aside>
      {/* END: MainSidebar */}

      {/* BEGIN: MainContentArea */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10" data-purpose="top-navigation-header">
          <div className="flex items-center space-x-4">
            <h1 className="text-slate-800 font-semibold text-base">Trazabilidad</h1>
          </div>
          <div className="flex items-center space-x-6">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-800 tracking-tight leading-tight">Municipalidad de San Miguel de Tucumán</p>
              <p className="text-[11px] text-slate-400">Sistema de Gestión Ambiental</p>
            </div>
            <div className="relative cursor-pointer text-slate-500 hover:text-slate-700">
              <i className="fa-regular fa-bell text-lg"></i>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#0E5199] text-white flex items-center justify-center font-bold text-xs shadow-sm cursor-pointer">
              OP
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Panel de Trazabilidad y Gestión de Intervenciones</h2>
            <button
              className="inline-flex items-center space-x-2 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer transition"
              onClick={() => onNavigate('CUR_04_P7_DASHBOARD', 'slide_up')}
            >
              <i className="fa-solid fa-chart-line text-blue-600"></i>
              <span>Panel de Indicadores</span>
            </button>
          </div>

          {/* BEGIN: KPICardsGrid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-purpose="kpi-metrics-grid">
            <div className="bg-gradient-to-br from-[#6A39CA] to-[#5926BD] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-40">
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <i className="fa-solid fa-calendar-check text-white"></i>
                </div>
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-medium">Mes en Curso</span>
              </div>
              <div>
                <div className="text-3xl font-extrabold tracking-tight mb-1" id="kpi-total-intervenciones">
                  {totalInterventions}
                </div>
                <div className="text-sm font-semibold tracking-wide text-white/95">Intervenciones Registradas</div>
                <div className="text-xs text-white/80 flex items-center space-x-1 mt-0.5">
                  <i className="fa-solid fa-arrow-trend-up text-[11px]"></i>
                  <span>+18% vs. mes anterior ({previousMonthName})</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#0288D1] to-[#0277BD] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-40">
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <i className="fa-solid fa-wrench text-white"></i>
                </div>
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-medium">En Operación</span>
              </div>
              <div>
                <div className="text-3xl font-extrabold tracking-tight mb-1">12</div>
                <div className="text-sm font-semibold tracking-wide text-white/95">Focos en Recuperación</div>
                <div className="text-xs text-white/80 flex items-center space-x-1 mt-0.5">
                  <i className="fa-regular fa-clock text-[11px]"></i>
                  <span>4 cuadrillas activas hoy</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#00897B] to-[#00796B] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-40">
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <i className="fa-solid fa-tint text-white"></i>
                </div>
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-medium">Mitigación</span>
              </div>
              <div>
                <div className="text-3xl font-extrabold tracking-tight mb-1">-64%</div>
                <div className="text-sm font-semibold tracking-wide text-white/95">Reducción IRH post-obra</div>
                <div className="text-xs text-white/80 flex items-center space-x-1 mt-0.5">
                  <i className="fa-solid fa-arrow-down text-[11px]"></i>
                  <span>Disminución acumulada cuencas</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#D84315] to-[#BF360C] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-40">
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <i className="fa-solid fa-tree text-white"></i>
                </div>
                <span className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-medium">Consolidados</span>
              </div>
              <div>
                <div className="text-3xl font-extrabold tracking-tight mb-1">{recoveredSpaces}</div>
                <div className="text-sm font-semibold tracking-wide text-white/95">Focos Saneados 100%</div>
                <div className="text-xs text-white/80 flex items-center space-x-1 mt-0.5">
                  <i className="fa-solid fa-shield-halved text-[11px]"></i>
                  <span>Erradicación definitiva verificada</span>
                </div>
              </div>
            </div>
          </section>
          {/* END: KPICardsGrid */}

          {/* BEGIN: FilterBar */}
          <section className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl border border-slate-200 shadow-sm" data-purpose="filters-bar">
            <div className="relative flex-1 min-w-[260px]">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Buscar por foco, cuenca o calle..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg py-2 pl-3 pr-8 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
              >
                <option>Zona Norte (Canal Norte)</option>
                <option>Zona Sur (Canal Sur)</option>
                <option>Zona Este (Río Salí)</option>
              </select>
              <select
                className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg py-2 pl-3 pr-8 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option>En Intervención (12)</option>
                <option>Pendiente de Acción</option>
                <option>Saneados</option>
              </select>
              <select
                className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg py-2 pl-3 pr-8 focus:bg-white focus:ring-1 focus:ring-blue-500"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
              >
                <option>Moderado (40–79)</option>
                <option>Crítico (80–100)</option>
                <option>Bajo (0–39)</option>
              </select>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 bg-slate-50 cursor-pointer"
                title="Reiniciar filtros"
                onClick={() => {
                  setSearchQuery('');
                  setZoneFilter('Zona Norte (Canal Norte)');
                  setStatusFilter('En Intervención (12)');
                  setRiskFilter('Moderado (40–79)');
                }}
              >
                <i className="fa-solid fa-rotate-right text-xs"></i>
              </button>
            </div>
          </section>
          {/* END: FilterBar */}

          {/* BEGIN: TableCard */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-purpose="territorial-focus-registry">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <i className="fa-solid fa-list-check text-blue-600"></i>
                <h3 className="font-bold text-slate-800 text-base">Registro Territorial de Focos</h3>
              </div>
              <span className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded-full text-xs font-bold tracking-tight">
                Tucumán Capital
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-6">ID Foco</th>
                    <th className="py-3 px-6">Ubicación y Cuenca</th>
                    <th className="py-3 px-6">IRH Actual</th>
                    <th className="py-3 px-6">Última Acción</th>
                    <th className="py-3 px-6 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {focosList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 px-6 text-center text-slate-400 text-xs">
                        No hay focos para mostrar.
                      </td>
                    </tr>
                  )}
                  {focosList.map((foco) => (
                    <tr key={foco.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${foco.dotClass}`}></span>
                          <div>
                            <span className="font-bold text-blue-600 text-sm">{foco.id}</span>
                            <p className="text-[11px] text-slate-400">{foco.cuenca}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-800">{foco.location}</div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${foco.statusBadgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${foco.dotClass}`}></span>
                            <span>{foco.statusBadge}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className={`h-full ${foco.irhBarClass} rounded-full`} style={{ width: foco.irhWidth }}></div>
                          </div>
                          <span className="font-bold text-slate-800 text-sm">{foco.irhActual}</span>
                        </div>
                        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{foco.irhInitial}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-800">{foco.lastDate}</div>
                        <div className="text-slate-400 text-[11px]">{foco.lastAction}</div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          className="inline-flex items-center space-x-1.5 bg-[#007A33] hover:bg-[#006028] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm transition cursor-pointer"
                          onClick={() => handleOpenDetailModal(foco)}
                        >
                          <i className="fa-regular fa-eye"></i>
                          <span>Ver detalle</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Intervenciones registradas en 2026: <strong className="text-slate-700">143</strong>
              </span>
              <div className="flex items-center space-x-1">
                <button className="w-7 h-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-400">
                  <i className="fa-solid fa-chevron-left text-[10px]"></i>
                </button>
                <button className="w-7 h-7 rounded bg-blue-600 text-white font-bold flex items-center justify-center text-xs">1</button>
                <button className="w-7 h-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-400">
                  <i className="fa-solid fa-chevron-right text-[10px]"></i>
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: DETALLE DE FOCO (FIEL A IMAGEN DE REFERENCIA) */}
      {/* ======================================================== */}
      {detailModalOpen && selectedFoco && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setDetailModalOpen(false)}
          ></div>

          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-10 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Encabezado */}
            <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 flex items-start justify-between bg-white shrink-0">
              <div>
                {/* Badges: ESPACIO RECUPERADO + Canal Norte */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-[#E7F6EC] text-[#007A33] border border-[#BDE8CD] text-[10.5px] font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1">
                    <i className="fa-solid fa-check text-[9px]"></i>
                    ESPACIO RECUPERADO
                  </span>
                  <span className="bg-blue-50 text-[#0060a9] border border-blue-200 text-[10.5px] font-bold px-2.5 py-0.5 rounded inline-flex items-center gap-1">
                    <i className="fa-solid fa-water text-[9px]"></i>
                    {selectedFoco.cuenca || 'Canal Norte'}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                  Detalle de Foco {selectedFoco.id}
                </h2>
                <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                  <i className="fa-solid fa-location-dot text-slate-400"></i>
                  <span>{selectedFoco.location} • San Miguel de Tucumán</span>
                </p>
              </div>

              {/* Botones de acción del encabezado */}
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
                  title="Compartir ficha"
                  onClick={() => alert('Enlace copiado al portapapeles.')}
                >
                  <i className="fa-solid fa-share-nodes text-xs"></i>
                </button>
                <button
                  className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
                  title="Imprimir ficha técnica"
                  onClick={() => window.print()}
                >
                  <i className="fa-solid fa-print text-xs"></i>
                </button>
                <button
                  className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-400 flex items-center justify-center transition cursor-pointer"
                  title="Cerrar modal"
                  onClick={() => setDetailModalOpen(false)}
                >
                  <i className="fa-solid fa-xmark text-sm font-bold"></i>
                </button>
              </div>
            </div>

            {/* Cuerpo desplazable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-slate-800">
              {/* 1. Mapa REAL de Tucumán (Google Maps Centrado en Canal Norte / Mate de Luna) */}
              <div className="relative w-full h-36 sm:h-40 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                <iframe
                  src="https://maps.google.com/maps?q=-26.8151,-65.2096&hl=es&z=15&output=embed"
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Google Maps - Canal Norte y Mate de Luna, San Miguel de Tucumán"
                />

                {/* Badges superpuestos sobre el mapa real */}
                <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-xs text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-xs border border-slate-200 flex items-center gap-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Google Maps • San Miguel de Tucumán (Canal Norte)</span>
                </div>

                <div className="absolute bottom-2 left-2 bg-slate-900/85 backdrop-blur-xs text-white text-[9.5px] font-mono px-2 py-0.5 rounded shadow-xs border border-slate-700 pointer-events-none">
                  {selectedFoco.coords}
                </div>

                <div className="absolute bottom-2 right-2 bg-blue-900/85 backdrop-blur-xs text-white text-[9.5px] font-bold px-2 py-0.5 rounded shadow-xs border border-blue-700 flex items-center gap-1 pointer-events-none">
                  <i className="fa-solid fa-ruler-horizontal text-cyan-300"></i>
                  <span>Dist. Cuenca: {selectedFoco.distCuenca}</span>
                </div>
              </div>

              {/* 2. Tarjeta con datos del foco en dos columnas + IRH integrado */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 sm:p-3.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {/* Columna Izquierda */}
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Tipo de Foco
                      </span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block">
                        {selectedFoco.tipoFoco}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Superficie Afectada
                      </span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                        {selectedFoco.superficie}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Cuadrilla Asignada
                      </span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                        {selectedFoco.cuadrilla}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Fecha de Detección
                      </span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                        {getRelativeDateFormatted(-14)} (Detección IA Satelital)
                      </span>
                    </div>
                  </div>

                  {/* Columna Derecha */}
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Distancia al Cauce
                      </span>
                      <span className="font-extrabold text-[#0060a9] text-xs mt-0.5 block">
                        {selectedFoco.distCuenca} (Canal Norte)
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Estado Operativo
                      </span>
                      <span className="font-bold text-[#007A33] text-xs flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00A854]"></span>
                        {selectedFoco.statusBadge}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Residuos Removidos
                      </span>
                      <span className="font-semibold text-slate-800 text-xs mt-0.5 block">
                        {selectedFoco.volumenRemovidoTon ? `${selectedFoco.volumenRemovidoTon} Toneladas acumuladas` : '14 Toneladas acumuladas'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                        Coordenadas Georeferenciadas
                      </span>
                      <span className="font-mono text-slate-700 text-[11.5px] mt-0.5 block">
                        {selectedFoco.coords}
                      </span>
                    </div>
                  </div>
                </div>

                {/* IRH Indicator Strip integrado */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-water text-blue-600 text-xs"></i>
                    <span className="text-[10px] uppercase font-bold text-slate-500">
                      Índice de Riesgo Hídrico (IRH):
                    </span>
                    <span className="text-[11px] text-slate-400 line-through">
                      Inicial: 91
                    </span>
                    <i className="fa-solid fa-arrow-right text-[9px] text-emerald-600"></i>
                    <span className="text-xs font-black text-[#007A33] bg-[#E7F6EC] border border-[#BDE8CD] px-2 py-0.2 rounded-full">
                      Actual: {selectedFoco.irhActual} pts (-67%)
                    </span>
                  </div>

                  <span className="text-[10.5px] text-emerald-800 font-semibold flex items-center gap-1">
                    <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                    Riesgo Mitigado / Saneamiento Exitoso
                  </span>
                </div>
              </div>

              {/* 3. Sección "Historial de Acciones" */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left text-[#0060a9]"></i>
                    <span>Historial de Acciones</span>
                  </h3>
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    4 intervenciones (1 hoy)
                  </span>
                </div>

                {/* Línea de tiempo vertical compacta */}
                <div className="relative pl-5 sm:pl-6 border-l-2 border-emerald-500 space-y-2.5">
                  {/* Intervención 1 (MÁS RECIENTE / HOY - RESALTADA EN VERDE Y COMPACTA) */}
                  <div className="relative">
                    {/* Hito en la línea vertical */}
                    <div className="absolute -left-[27px] sm:-left-[31px] top-2.5 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px] border-2 border-white ring-2 ring-emerald-200 shadow-2xs">
                      <i className="fa-solid fa-check"></i>
                    </div>

                    {/* Tarjeta verde compacta */}
                    <div className="bg-[#F0FAF3] border border-[#00A854] rounded-xl p-3 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#007A33] text-white text-[9.5px] font-black px-1.5 py-0.2 rounded uppercase">
                            RECIENTE
                          </span>
                          <h4 className="font-bold text-slate-900 text-xs sm:text-[13px]">
                            {intervenciones[0]?.title || 'Relleno, Nivelación y Plantación Nativa'}
                          </h4>
                        </div>
                        <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.2 rounded-full border border-emerald-200">
                          {intervenciones[0]?.date || `${getRelativeDateFormatted(0)} - Hoy`}
                        </span>
                      </div>

                      {/* Texto que ocupa la mayor parte del espacio */}
                      <p className="text-[11.5px] text-slate-700 leading-snug mb-2">
                        {intervenciones[0]?.desc ||
                          'Realizado por Cuadrilla Espacios Verdes – Brigada 02. Insumos: 8 m³ de tierra negra fértil, 15 plantines autóctonos (Lapachos rosados y Tarcos). Estado actualizado a Espacio Recuperado.'}
                      </p>

                      {/* Etiquetas compactas */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span className="px-2 py-0.5 bg-white text-emerald-900 border border-emerald-200 rounded text-[10px] font-bold shadow-2xs">
                          8 m³ Tierra Negra
                        </span>
                        <span className="px-2 py-0.5 bg-white text-emerald-900 border border-emerald-200 rounded text-[10px] font-bold shadow-2xs">
                          15 Árboles
                        </span>
                        <span className="px-2 py-0.5 bg-[#007A33] text-white rounded text-[10px] font-extrabold shadow-2xs">
                          Saneado 100%
                        </span>
                        <span className="px-2 py-0.5 bg-white text-blue-900 border border-blue-200 rounded text-[10px] font-bold shadow-2xs">
                          IRH: 30 (-67%)
                        </span>
                      </div>

                      {/* Miniaturas de evidencia "Antes" y "Después" - FOTOGRAFÍAS REALES DE CAMPO */}
                      <div className="pt-1.5 border-t border-emerald-200/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9.5px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-1.5">
                            <i className="fa-solid fa-camera text-slate-500 text-[10px]"></i>
                            <span>Evidencia Fotográfica de Campo:</span>
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">
                            Registro del inspector municipal (Click para ampliar)
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Fotografía Real Antes */}
                          <div
                            className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-300 shadow-2xs hover:border-slate-400 hover:shadow-xs transition-all cursor-pointer group"
                            onClick={() =>
                              setSelectedPhoto({
                                src: '/src/assets/images/evidencia_antes_1791152391374.jpg',
                                label: 'ANTES DE LA INTERVENCIÓN',
                                date: getRelativeDateFormatted(-14),
                                desc: 'Basural clandestino a cielo abierto sobre talud de Canal Norte: acumulación de escombros de obra, bolsas plásticas y vegetación deteriorada.',
                              })
                            }
                            title="Ver fotografía de campo Antes en tamaño completo"
                          >
                            <div className="w-20 sm:w-24 h-14 rounded-md bg-slate-900 overflow-hidden relative shrink-0">
                              <img
                                src="/src/assets/images/evidencia_antes_1791152391374.jpg"
                                alt="Fotografía real de campo Antes: basural en Canal Norte"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <span className="absolute bottom-0.5 left-0.5 bg-red-600 text-white text-[8px] font-black px-1 rounded-xs shadow-xs">
                                ANTES
                              </span>
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                                <i className="fa-solid fa-magnifying-glass-plus"></i>
                              </div>
                            </div>
                            <div className="text-[9.5px] leading-tight text-slate-600 pr-1 min-w-0">
                              <span className="font-bold text-red-700 block truncate">{getRelativeDateFormatted(-14)}</span>
                              <span className="text-slate-700 block text-[9px] truncate">Basural previo</span>
                              <span className="text-[8.5px] text-slate-400 block truncate">Canal Norte</span>
                            </div>
                          </div>

                          {/* Fotografía Real Después */}
                          <div
                            className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-emerald-300 shadow-2xs hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer group"
                            onClick={() =>
                              setSelectedPhoto({
                                src: '/src/assets/images/evidencia_despues_1791152402588.jpg',
                                label: 'DESPUÉS DE LA INTERVENCIÓN',
                                date: selectedFoco.lastDate || getRelativeDateFormatted(0),
                                desc: 'Mismo encuadre tras la intervención municipal: residuos y escombros completamente retirados, suelo nivelado con tierra fértil y plantación de especies nativas.',
                              })
                            }
                            title="Ver fotografía de campo Después en tamaño completo"
                          >
                            <div className="w-20 sm:w-24 h-14 rounded-md bg-slate-900 overflow-hidden relative shrink-0">
                              <img
                                src="/src/assets/images/evidencia_despues_1791152402588.jpg"
                                alt="Fotografía real de campo Después: terreno saneado y recuperado"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <span className="absolute bottom-0.5 left-0.5 bg-[#007A33] text-white text-[8px] font-black px-1 rounded-xs shadow-xs">
                                DESPUÉS
                              </span>
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                                <i className="fa-solid fa-magnifying-glass-plus"></i>
                              </div>
                            </div>
                            <div className="text-[9.5px] leading-tight text-emerald-950 pr-1 min-w-0">
                              <span className="font-bold text-emerald-700 block truncate">
                                {selectedFoco.lastDate || getRelativeDateFormatted(0)}
                              </span>
                              <span className="text-emerald-800 font-semibold block text-[9px] truncate">Saneado y verde</span>
                              <span className="text-[8.5px] text-emerald-600 block truncate">Recuperado</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Intervención 2 */}
                  {intervenciones[1] && (
                    <div className="relative">
                      <div className="absolute -left-[25px] sm:-left-[29px] top-2.5 w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[7px] border-2 border-white shadow-2xs">
                        <i className="fa-solid fa-truck"></i>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:p-3 shadow-2xs hover:border-slate-300 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                          <h4 className="font-bold text-slate-800 text-xs">
                            {intervenciones[1].title}
                          </h4>
                          <span className="text-[10.5px] text-slate-500 font-medium">
                            {intervenciones[1].date}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug mb-1.5">
                          {intervenciones[1].desc}
                        </p>
                        {intervenciones[1].tags && (
                          <div className="flex flex-wrap items-center gap-1 mb-2">
                            {intervenciones[1].tags.map((t, tidx) => (
                              <span
                                key={tidx}
                                className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9.5px] font-semibold"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Evidencia Fotográfica Intervención 2 (Retiro de Residuos Pesados) */}
                        <div className="pt-1.5 border-t border-slate-200">
                          <span className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wider block mb-1 flex items-center gap-1.5">
                            <i className="fa-solid fa-camera text-slate-400 text-[10px]"></i>
                            <span>Evidencia Fotográfica de Maquinaria Pesada:</span>
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {/* Antes 2 */}
                            <div
                              className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-md border border-slate-200 hover:border-slate-300 transition-all cursor-pointer group"
                              onClick={() =>
                                setSelectedPhoto({
                                  src: '/src/assets/images/evidencia_pesada_antes_1791152414625.jpg',
                                  label: 'ANTES - RETIRO DE ESCOMBROS',
                                  date: intervenciones[1]?.date ?? '',
                                  desc: 'Registro fotográfico de campo: 14 toneladas de escombros de demolición y residuos pesados acopiados de forma ilegal antes de la intervención de la retroexcavadora.',
                                })
                              }
                              title="Ver fotografía de campo en tamaño completo"
                            >
                              <div className="w-16 h-11 rounded bg-slate-900 overflow-hidden relative shrink-0">
                                <img
                                  src="/src/assets/images/evidencia_pesada_antes_1791152414625.jpg"
                                  alt="Antes: escombros y residuos pesados"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <span className="absolute bottom-0.5 left-0.5 bg-red-600 text-white text-[7.5px] font-black px-1 rounded-xs">
                                  ANTES
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-600 min-w-0">
                                <span className="font-bold text-red-700 block truncate">14 Tn escombros</span>
                                <span className="text-slate-400 block truncate">Previo a pala</span>
                              </div>
                            </div>

                            {/* Después 2 */}
                            <div
                              className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-md border border-slate-200 hover:border-slate-300 transition-all cursor-pointer group"
                              onClick={() =>
                                setSelectedPhoto({
                                  src: '/src/assets/images/evidencia_pesada_despues_1791152426299.jpg',
                                  label: 'DESPUÉS - RETIRO DE ESCOMBROS',
                                  date: intervenciones[1]?.date ?? '',
                                  desc: 'Mismo encuadre tras la operación: despeje total con pala retroexcavadora municipal y suelo nivelado para posterior forestación comunitaria.',
                                })
                              }
                              title="Ver fotografía de campo en tamaño completo"
                            >
                              <div className="w-16 h-11 rounded bg-slate-900 overflow-hidden relative shrink-0">
                                <img
                                  src="/src/assets/images/evidencia_pesada_despues_1791152426299.jpg"
                                  alt="Después: terreno despejado por retroexcavadora"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <span className="absolute bottom-0.5 left-0.5 bg-emerald-700 text-white text-[7.5px] font-black px-1 rounded-xs">
                                  DESPUÉS
                                </span>
                              </div>
                              <div className="text-[9px] text-emerald-900 min-w-0">
                                <span className="font-bold text-emerald-700 block truncate">Despeje 100%</span>
                                <span className="text-slate-400 block truncate">IRH -27 pts</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Intervención 3 */}
                  {intervenciones[2] && (
                    <div className="relative">
                      <div className="absolute -left-[25px] sm:-left-[29px] top-2.5 w-3.5 h-3.5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[7px] border-2 border-white shadow-2xs">
                        <i className="fa-solid fa-broom"></i>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:p-3 shadow-2xs hover:border-slate-300 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                          <h4 className="font-bold text-slate-800 text-xs">
                            {intervenciones[2].title}
                          </h4>
                          <span className="text-[10.5px] text-slate-500 font-medium">
                            {intervenciones[2].date}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug mb-1.5">
                          {intervenciones[2].desc}
                        </p>
                        {intervenciones[2].tags && (
                          <div className="flex flex-wrap items-center gap-1">
                            {intervenciones[2].tags.map((t, tidx) => (
                              <span
                                key={tidx}
                                className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9.5px] font-semibold"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Intervención 4 */}
                  {intervenciones[3] && (
                    <div className="relative">
                      <div className="absolute -left-[25px] sm:-left-[29px] top-2.5 w-3.5 h-3.5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[7px] border-2 border-white shadow-2xs">
                        <i className="fa-solid fa-location-crosshairs"></i>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:p-3 shadow-2xs hover:border-slate-300 transition-colors opacity-90">
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                          <h4 className="font-bold text-slate-800 text-xs">
                            {intervenciones[3].title}
                          </h4>
                          <span className="text-[10.5px] text-slate-500 font-medium">
                            {intervenciones[3].date}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug mb-1.5">
                          {intervenciones[3].desc}
                        </p>
                        {intervenciones[3].tags && (
                          <div className="flex flex-wrap items-center gap-1">
                            {intervenciones[3].tags.map((t, tidx) => (
                              <span
                                key={tidx}
                                className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9.5px] font-semibold"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pie del modal fijo con botones abajo a la izquierda y derecha */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                className="px-5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                onClick={() => setDetailModalOpen(false)}
              >
                Cerrar
              </button>
              <button
                className="inline-flex items-center space-x-2 bg-[#007A33] hover:bg-[#006028] text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer"
                onClick={() => {
                  setDetailModalOpen(false);
                  setRegisterModalOpen(true);
                }}
              >
                <i className="fa-solid fa-circle-plus"></i>
                <span>Nueva Intervención</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: REGISTRAR INTERVENCIÓN UNIFICADA  */}
      {/* ========================================== */}
      <GismatModal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        id="modal-registrar-intervencion"
        headerTheme="light"
        icon={
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-pen-to-square text-base"></i>
          </div>
        }
        title="Registrar Nueva Intervención Ambiental"
        subtitle={`Foco ${selectedFoco?.id ?? ''} • ${selectedFoco?.cuenca ?? ''}`}
      >
        <form className="space-y-4" id="form-intervencion" onSubmit={handleIntervencionSubmit}>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-600 leading-relaxed">
            Complete las acciones ejecutadas por el equipo territorial para actualizar el historial de trazabilidad, recalcular el IRH y realizar el seguimiento.
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Tipo de Acción Realizada (Seleccione una o varias)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { name: 'Limpieza y desmalezado', icon: 'fa-scissors' },
                { name: 'Retiro de residuos', icon: 'fa-trash-can' },
                { name: 'Relleno y nivelación', icon: 'fa-mountain' },
                { name: 'Plantación Nativa', icon: 'fa-seedling' },
                { name: 'Mural comunitario', icon: 'fa-palette' },
                { name: 'Concientización barrial', icon: 'fa-bullhorn' },
              ].map((act) => {
                const isSelected = selectedActions.includes(act.name);
                return (
                  <label
                    key={act.name}
                    onClick={() => toggleAction(act.name)}
                    className={`flex items-center space-x-1.5 p-2 rounded-lg border cursor-pointer text-xs font-medium transition ${
                      isSelected
                        ? 'border-2 border-emerald-500 bg-emerald-50/60 font-bold text-emerald-900'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      type="checkbox"
                    />
                    <i className={`fa-solid ${act.icon} ${isSelected ? 'text-emerald-700' : 'text-slate-400'} text-[11px]`}></i>
                    <span className="text-[11px] truncate">{act.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Fecha de Realización
              </label>
              <input
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                type="text"
                value={interventionDate}
                onChange={(e) => setInterventionDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Cuadrilla Encargada
              </label>
              <select
                className="w-full py-1.5 px-2.5 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                value={crewAssigned}
                onChange={(e) => setCrewAssigned(e.target.value)}
              >
                <option>Cuadrilla Espacios Verdes - Brigada 02</option>
                <option>Cuadrilla Zona Norte - Unidad 04</option>
                <option>Brigada Ambiental Sanitaria</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Volumen de Obra / Insumos Aportados
            </label>
            <input
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
              type="text"
              value={volumeObra}
              onChange={(e) => setVolumeObra(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Descripción y Observaciones de Campo
            </label>
            <textarea
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-slate-700 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 leading-relaxed"
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              onClick={() => setRegisterModalOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="inline-flex items-center space-x-1.5 bg-[#007A33] hover:bg-[#006028] text-white px-5 py-2 rounded-lg text-xs font-bold shadow-md transition cursor-pointer"
              type="submit"
            >
              <i className="fa-solid fa-check"></i>
              <span>Registrar intervención</span>
            </button>
          </div>
        </form>
      </GismatModal>

      {/* ========================================== */}
      {/* MODAL 3: ÉXITO DE CONFIRMACIÓN UNIFICADO    */}
      {/* ========================================== */}
      <GismatModal
        isOpen={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        id="modal-confirmacion-exito"
        headerTheme="light"
        maxWidthClass="w-[90vw] sm:w-[70vw] md:w-[50vw] lg:w-[42vw] max-w-[480px]"
        maxHeightClass="max-h-[75vh]"
      >
        <div className="p-3 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 text-xl ring-6 ring-emerald-50">
            <i className="fa-solid fa-check"></i>
          </div>
          <span className="inline-block bg-emerald-100 text-emerald-800 text-[9.5px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1.5">
            OPERACIÓN EXITOSA
          </span>
          <h3 className="text-base font-bold text-slate-900 mb-1.5">¡Intervención Registrada con Éxito!</h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            La intervención para el foco <strong className="text-blue-600 font-bold">{selectedFoco?.id ?? ''}</strong> ({selectedFoco?.location ?? ''})
            fue registrada y validada en el sistema.
          </p>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-left text-xs space-y-2 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Estado:</span>
              <span className="font-bold text-emerald-700">Espacio Recuperado / En Seguimiento</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Cuadrilla:</span>
              <span className="font-semibold text-slate-800">{crewAssigned}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Fecha:</span>
              <span className="font-semibold text-slate-800">{interventionDate}</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              className="w-full inline-flex items-center justify-center space-x-1.5 bg-[#007A33] hover:bg-[#006028] text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
              onClick={returnToFocoDetails}
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>Regresar a la ventana de información del foco</span>
            </button>
            <button
              className="text-xs text-slate-400 hover:text-slate-600 font-medium block mx-auto cursor-pointer"
              onClick={() => setSuccessModalOpen(false)}
            >
              Volver a la vista general de la tabla
            </button>
          </div>
        </div>
      </GismatModal>

      {/* ========================================================= */}
      {/* MODAL LIGHTBOX: VISOR DE EVIDENCIA FOTOGRÁFICA DE CAMPO   */}
      {/* ========================================================= */}
      {selectedPhoto && selectedFoco && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in"
          onClick={() => setSelectedPhoto(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col my-auto relative animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Visor */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                    selectedPhoto.label.includes('ANTES') ? 'bg-red-600 text-white' : 'bg-[#007A33] text-white'
                  }`}
                >
                  {selectedPhoto.label}
                </span>
                <span className="text-xs text-slate-300 font-medium truncate">
                  Registro fotográfico municipal • {selectedPhoto.date}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title="Cerrar visor"
              >
                <i className="fa-solid fa-xmark text-sm font-bold"></i>
              </button>
            </div>

            {/* Fotografía de Campo en Alta Resolución */}
            <div className="bg-slate-950 flex items-center justify-center p-1 overflow-hidden relative">
              <img
                src={selectedPhoto.src}
                alt={selectedPhoto.desc}
                referrerPolicy="no-referrer"
                className="max-h-[62vh] w-auto max-w-full object-contain rounded-md"
              />
              <div className="absolute bottom-3 right-3 bg-black/75 backdrop-blur-xs text-white text-[9.5px] font-mono px-2 py-0.5 rounded border border-white/20 pointer-events-none">
                {selectedFoco.coords} • Tucumán
              </div>
            </div>

            {/* Ficha descriptiva de la toma */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-circle-info text-blue-600 mt-0.5 shrink-0"></i>
                <div className="flex-1">
                  <p className="text-slate-800 font-medium leading-relaxed">{selectedPhoto.desc}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10.5px] text-slate-500">
                    <span>
                      <strong className="text-slate-700">Lugar:</strong> {selectedFoco.location} ({selectedFoco.cuenca})
                    </span>
                    <span>
                      <strong className="text-slate-700">Cuadrilla:</strong> {selectedFoco.cuadrilla}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Dispositivo móvil en campo • Toma directa sin filtros
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};