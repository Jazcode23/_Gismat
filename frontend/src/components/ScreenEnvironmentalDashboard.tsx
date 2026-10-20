import React from 'react';
import { ScreenId, TransitionType } from '../types';
import { getCurrentMonthAndYear, getMonthlyInterventionsEvolution, getCurrentYear } from '../utils/dynamicDateUtils';
import { useGismatStore } from '../services/gismatStore';
import { API_ENABLED, descargarArchivo } from '../services/apiClient';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Aspecto de cada fila del desglose según el nivel de riesgo de la microcuenca
const ESTILO_NIVEL = {
  critico: { irh: 'bg-rose-100 text-rose-800 border-rose-300', badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500 animate-pulse', txt: 'Mitigación Crítica' },
  intervencion: { irh: 'bg-rose-50 text-rose-700 border-rose-200', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', txt: 'En Intervención' },
  preventivo: { irh: 'bg-blue-50 text-blue-700 border-blue-200', badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', txt: 'Preventivo' },
  control: { irh: 'bg-emerald-50 text-emerald-700 border-emerald-200', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', txt: 'Control' },
};


interface ScreenEnvironmentalDashboardProps {
  onNavigate: (screen: ScreenId, transition?: TransitionType) => void;
}

export const ScreenEnvironmentalDashboard: React.FC<ScreenEnvironmentalDashboardProps> = ({ onNavigate }) => {
  const { dashboard } = useGismatStore();
  const d = API_ENABLED ? dashboard : null; // null => datos de demostración del diseño original
  const focosAbiertos = d ? d.focosActivos : 0;
  const criticos = d ? d.focosPorNivelRiesgo['Crítico'] ?? 0 : 0;
  const evolucion = d
    ? d.evolucionMensual.map((e) => ({ month: MESES[e.mes - 1], intervenciones: e.intervenciones, saneados: e.saneados, isCurrent: e.mes === new Date().getMonth() + 1 }))
    : getMonthlyInterventionsEvolution();
  const escalaEvol = Math.max(d ? 1 : 65, ...evolucion.map((m) => m.intervenciones));
  const estiloCuenca = (c: { nivelRiesgo: string; focosCriticos: number }) =>
    c.nivelRiesgo === 'Crítico' ? ESTILO_NIVEL.critico
      : c.nivelRiesgo === 'Moderado' ? (c.focosCriticos > 0 ? ESTILO_NIVEL.intervencion : ESTILO_NIVEL.preventivo)
      : ESTILO_NIVEL.control;

  const handleClose = () => {
    onNavigate('CUR_04_TRACEABILITY', 'push_back');
  };

  // Informe en PDF generado por el backend (reportlab). Sin API (modo demo) conserva la impresión del navegador.
  // Listado de focos en CSV (se abre en Excel). Lo genera el backend; requiere conexión con el servidor.
  const handleDescargarCsv = async () => {
    if (!API_ENABLED) { window.alert('La descarga en CSV requiere conexión con el servidor.'); return; }
    try {
      await descargarArchivo('/reportes/focos/?formato=csv', 'reporte-gismat.csv');
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const handleDescargarPdf = async () => {
    if (!API_ENABLED) { window.print(); return; }
    try {
      await descargarArchivo('/reportes/focos/?formato=pdf', 'reporte-gismat.pdf');
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  return (
    <div className="bg-slate-100 font-sans antialiased text-slate-800 min-h-screen w-screen overflow-hidden flex relative">
      {/* BEGIN: Blurred Background Application Frame (Visibly Framed Around Floating Modal) */}
      <div className="w-full h-full flex select-none filter blur-[3px] pointer-events-none" data-purpose="background-app-layout">
        {/* Sidebar GISMAT */}
        <aside className="w-64 bg-[#0B56A4] text-white flex flex-col justify-between shrink-0 shadow-lg">
          <div>
            <div className="h-16 flex items-center px-6 gap-3 border-b border-blue-600/30">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-lg">G</div>
              <span className="text-xl font-bold tracking-wider">GISMAT</span>
            </div>
            <nav className="mt-6 px-3 space-y-1.5 font-medium text-sm">
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-blue-100 hover:bg-white/10">
                <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Geoportal
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-blue-100 hover:bg-white/10">
                <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                Detecciones IA
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-blue-100 hover:bg-white/10">
                <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Riesgo Hídrico
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#00A854] text-white font-semibold shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                Trazabilidad
              </div>
            </nav>
          </div>
          <div className="p-4 text-xs text-blue-200 border-t border-blue-600/30">Versión 2.4.1 • SM Tucumán</div>
        </aside>

        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
            <h1 className="font-semibold text-slate-700 text-lg">Trazabilidad</h1>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-800">Municipalidad de San Miguel de Tucumán</p>
                <p className="text-[11px] text-slate-500">Secretaría de Ambiente y Desarrollo Sustentable</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-600">
                SM
              </div>
            </div>
          </header>
          <div className="flex-1 p-6 space-y-4">
            <div className="h-12 w-64 bg-orange-700/80 rounded-lg"></div>
            <div className="grid grid-cols-4 gap-4">
              <div className="h-28 bg-white rounded-xl shadow-sm border border-slate-200"></div>
              <div className="h-28 bg-white rounded-xl shadow-sm border border-slate-200"></div>
              <div className="h-28 bg-white rounded-xl shadow-sm border border-slate-200"></div>
              <div className="h-28 bg-white rounded-xl shadow-sm border border-slate-200"></div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Blurred Background Application Frame */}

      {/* BEGIN: Modal Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2.5px] flex items-center justify-center p-3 sm:p-5 md:p-6 z-50 overflow-y-auto animate-in fade-in duration-150"
        data-purpose="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        {/* BEGIN: Dashboard Floating Modal Container: 55-65% width, max-h-[84vh] */}
        <main
          className="bg-white w-[94vw] sm:w-[80vw] md:w-[68vw] lg:w-[60vw] max-w-[920px] max-h-[84vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/90 my-auto animate-in zoom-in-95 duration-150"
          data-purpose="dashboard-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* BEGIN: Modal Header */}
          <header className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 bg-white shrink-0" data-purpose="modal-header">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight truncate">
                  Dashboard de Gestión Ambiental y Análisis Territorial
                </h2>
                <p className="text-[11px] text-slate-500">Métricas consolidadas de cuencas • San Miguel de Tucumán</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              {/* CSV Button (Header) */}
              <button
                className="hidden sm:inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                data-purpose="header-csv-btn"
                onClick={handleDescargarCsv}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Descargar CSV</span>
              </button>
              {/* Print Button (Header) */}
              <button
                className="hidden sm:inline-flex items-center gap-1.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors shadow-sm tracking-wider cursor-pointer"
                data-purpose="header-print-btn"
                onClick={handleDescargarPdf}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Descargar PDF</span>
              </button>
              {/* Close Button with exact data-purpose="close-modal-btn" */}
              <button
                aria-label="Cerrar modal"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                data-purpose="close-modal-btn"
                onClick={handleClose}
                title="Cerrar modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </header>
          {/* END: Modal Header */}

          {/* BEGIN: Scrollable Modal Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 bg-white" data-purpose="modal-scrollable-body">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Métricas Clave de Desempeño Territorial</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100/80">
                Actualizado hoy • Período 2026
              </span>
            </div>

            {/* 4 KPI Cards Grid */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-purpose="kpi-metrics-grid">
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-700">Focos de Residuos</span>
                  <div className="w-7 h-7 rounded-lg bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-800 leading-none">{d ? d.focosVigentes : 34}</span>
                    <span className="text-[11px] font-medium text-slate-500">totales</span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[10.5px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="text-slate-600"><strong>{d ? d.espaciosRecuperados : 12}</strong> mitigados</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                      <span className="text-slate-600"><strong>{d ? Math.max(0, focosAbiertos - criticos) : 14}</strong> saneamiento</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                      <span className="text-slate-600"><strong>{d ? criticos : 8}</strong> riesgo crítico</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-700">Tasa Intervención</span>
                  <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-extrabold text-blue-600 leading-none">{d ? d.tasaIntervencion : 88}%</span>
                  <p className="mt-2 text-[10.5px] leading-tight text-slate-500">
                    Cobertura operativa mensual ejecutada mediante cuadrillas municipales.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-700">IRH Promedio</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-emerald-600 leading-none">{d ? Math.round(d.irhPromedio) : 48}</span>
                    <span className="text-[10px] font-semibold text-slate-400">/ 100</span>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {d ? (d.reduccionIRH > 0 ? `-${d.reduccionIRH}% reducción acumulada` : 'Sin reducción acumulada') : '-36% reducción interanual'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-700">Residuos</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-800 leading-none">{d ? Math.round(d.intervenciones.toneladasRemovidas) : 420}</span>
                    <span className="text-[10px] font-semibold text-slate-500">Ton</span>
                  </div>
                  <p className="mt-2 text-[10.5px] leading-tight text-slate-500">
                    Toneladas recolectadas en cauces y riberas urbanas.
                  </p>
                </div>
              </div>
            </section>

            {/* 2 Analytics Cards */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-purpose="charts-section">
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs">Distribución por Nivel de IRH</h4>
                    <span className="text-[10px] font-medium text-slate-500">Total: 34</span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-0.5">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                          Crítico (&gt;80 IRH)
                        </span>
                        <span className="text-rose-600 font-bold">{d ? `${d.distribucionIRH[0].cantidad} (${d.distribucionIRH[0].porcentaje}%)` : '8 (23.5%)'}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: d ? `${d.distribucionIRH[0].porcentaje}%` : '23.5%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-0.5">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                          Alto (60 – 79 IRH)
                        </span>
                        <span className="text-amber-600 font-bold">{d ? `${d.distribucionIRH[1].cantidad} (${d.distribucionIRH[1].porcentaje}%)` : '6 (17.6%)'}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: d ? `${d.distribucionIRH[1].porcentaje}%` : '17.6%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-0.5">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                          Moderado (40 – 59 IRH)
                        </span>
                        <span className="text-blue-600 font-bold">{d ? `${d.distribucionIRH[2].cantidad} (${d.distribucionIRH[2].porcentaje}%)` : '12 (35.3%)'}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: d ? `${d.distribucionIRH[2].porcentaje}%` : '35.3%' }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold mb-0.5">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                          Bajo Control (&lt;40 IRH)
                        </span>
                        <span className="text-emerald-600 font-bold">{d ? `${d.distribucionIRH[3].cantidad} (${d.distribucionIRH[3].porcentaje}%)` : '8 (23.6%)'}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: d ? `${d.distribucionIRH[3].porcentaje}%` : '23.6%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs">Evolución Mensual vs. Erradicados</h4>
                    <span className="text-[10px] font-medium text-slate-500">Tendencia {getCurrentYear()}</span>
                  </div>
                  <div className="mt-3 h-28 flex items-end justify-between px-1 border-b border-slate-200 pb-1 gap-1">
                    {evolucion.map((m) => (
                      <div
                        key={m.month}
                        className="flex flex-col items-center gap-1 flex-1"
                        title={`${m.month}: ${m.intervenciones} intervenciones, ${m.saneados} saneados 100%`}
                      >
                        <div className="flex items-end gap-0.5 sm:gap-1 h-20 relative w-full justify-center">
                          {m.isCurrent && (
                            <>
                              <span className="absolute -top-3.5 left-0 text-[8px] font-bold text-blue-600">{m.intervenciones}</span>
                              <span className="absolute -top-3.5 right-0 text-[8px] font-bold text-emerald-600">{m.saneados}</span>
                            </>
                          )}
                          <div
                            className={`w-2.5 sm:w-3.5 ${m.isCurrent ? 'bg-blue-600' : 'bg-blue-500'} rounded-t-xs`}
                            style={{ height: `${(m.intervenciones / escalaEvol) * 100}%` }}
                          ></div>
                          <div
                            className={`w-2.5 sm:w-3.5 ${m.isCurrent ? 'bg-emerald-600' : 'bg-emerald-500'} rounded-t-xs`}
                            style={{ height: `${(m.saneados / escalaEvol) * 100}%` }}
                          ></div>
                        </div>
                        <span
                          className={`text-[9.5px] sm:text-[10px] font-medium ${
                            m.isCurrent ? 'font-bold text-blue-700 bg-blue-50 px-0.5 rounded' : 'text-slate-600'
                          }`}
                        >
                          {m.month}{m.isCurrent ? '*' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-center gap-4 text-[10.5px] text-slate-600">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-xs"></span>
                    <span>Intervenciones</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs"></span>
                    <span>Saneados 100%</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Breakdown Table Section */}
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs" data-purpose="territorial-breakdown-table">
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700">
                  Desglose Operativo por Cuenca
                </span>
                <span className="text-[10.5px] font-semibold text-slate-500">{d ? d.riesgoPorMicrocuenca.length : 4} Jurisdicciones</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 text-[10px]">
                    <tr>
                      <th className="py-2 px-3" scope="col">Cuenca</th>
                      <th className="py-2 px-3" scope="col">Focos</th>
                      <th className="py-2 px-3" scope="col">IRH Prom.</th>
                      <th className="py-2 px-3" scope="col">Cuadrillas</th>
                      <th className="py-2 px-3 text-right" scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium text-[11px]">
                    {d ? (
                      d.riesgoPorMicrocuenca.map((c) => {
                        const e = estiloCuenca(c);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 font-semibold text-slate-800">{c.nombre}</td>
                            <td className="py-2 px-3">{c.focosTotales} focos</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${e.irh}`}>
                                {Math.round(c.irhPromedio)} IRH
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {c.cuadrillasActivas
                                ? `${c.cuadrillasActivas} ${c.cuadrillasActivas === 1 ? 'cuadrilla' : 'cuadrillas'}`
                                : 'Sin cuadrillas'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${e.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`}></span>
                                {e.txt}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-800">Canal Norte</td>
                      <td className="py-2 px-3">14 focos</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          78 IRH
                        </span>
                      </td>
                      <td className="py-2 px-3">3 cuadrillas (24 op.)</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          En Intervención
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-800">Río Salí (Margen Este)</td>
                      <td className="py-2 px-3">10 focos</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                          84 IRH
                        </span>
                      </td>
                      <td className="py-2 px-3">2 cuadrillas + retro</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                          Mitigación Crítica
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-800">Arroyo Medina</td>
                      <td className="py-2 px-3">6 focos</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          52 IRH
                        </span>
                      </td>
                      <td className="py-2 px-3">1 cuadrilla ligera</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          Preventivo
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-800">Canal Sur</td>
                      <td className="py-2 px-3">4 focos</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          35 IRH
                        </span>
                      </td>
                      <td className="py-2 px-3">1 cuadrilla inspectora</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Control
                        </span>
                      </td>
                    </tr>
                  </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          {/* END: Scrollable Modal Body */}

          {/* BEGIN: Modal Footer */}
          <footer
            className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0"
            data-purpose="modal-footer"
          >
            <p className="text-[10.5px] font-medium text-slate-500 text-center sm:text-left">
              Fecha de corte: <strong>{getCurrentMonthAndYear()}</strong> • Municipalidad de San Miguel de Tucumán
            </p>
            <div className="flex items-center gap-2">
              {/* Close Button with matching xpath: //footer//button[contains(., 'Cerrar')] */}
              <button
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300 cursor-pointer"
                type="button"
                onClick={handleClose}
              >
                Cerrar
              </button>
              <button
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                onClick={handleDescargarCsv}
                type="button"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Descargar CSV</span>
              </button>
              <button
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg shadow-sm transition-colors inline-flex items-center gap-1 cursor-pointer"
                onClick={handleDescargarPdf}
                type="button"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Descargar Informe PDF</span>
              </button>
            </div>
          </footer>
          {/* END: Modal Footer */}
        </main>
      </div>
      {/* END: Modal Backdrop */}
    </div>
  );
};
