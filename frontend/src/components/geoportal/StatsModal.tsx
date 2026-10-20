import React from 'react';
import { GismatModal } from '../GismatModal';
import { GeoportalStats, FocoAmbiente } from '../../types/geoportal';
import { getCurrentMonthAndYear } from '../../utils/dynamicDateUtils';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GeoportalStats;
  focos: FocoAmbiente[];
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  focos,
}) => {
  const activos = focos.filter((f) => f.estado === 'activo').length;
  const pendientes = focos.filter((f) => f.estado === 'pendiente').length;
  const limpiados = focos.filter((f) => f.estado === 'limpiado').length;
  const criticos = focos.filter((f) => f.nivelRiesgo === 'Crítico').length;

  return (
    <GismatModal
      isOpen={isOpen}
      onClose={onClose}
      title="Indicadores y Estadísticas Ambientales"
      subtitle={`San Miguel de Tucumán • Consolidado Territorial ${getCurrentMonthAndYear()}`}
      badge={
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
          Geoprocesamiento SIG
        </span>
      }
      icon={
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0060a9] flex items-center justify-center text-lg shadow-xs">
          <i className="fa-solid fa-chart-pie"></i>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-slate-500">
            Fuente: GISMAT • Dirección de Medio Ambiente y Cuadrillas SMT
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Top 4 KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Focos Totales</span>
            <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">{focos.length}</span>
            <span className="text-[10px] text-slate-500 mt-1 block">Relevados por sensor IA</span>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 shadow-2xs">
            <span className="text-[10px] text-red-700 uppercase font-bold block">Focos Críticos</span>
            <span className="text-xl font-extrabold text-red-800 mt-0.5 block">{criticos}</span>
            <span className="text-[10px] text-red-600 mt-1 block">IRH ≥ 70 puntos</span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 shadow-2xs">
            <span className="text-[10px] text-amber-700 uppercase font-bold block">Focos Activos</span>
            <span className="text-xl font-extrabold text-amber-800 mt-0.5 block">{activos}</span>
            <span className="text-[10px] text-amber-600 mt-1 block">En proceso de remediación</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-2xs">
            <span className="text-[10px] text-emerald-700 uppercase font-bold block">Focos Saneados</span>
            <span className="text-xl font-extrabold text-emerald-800 mt-0.5 block">{limpiados}</span>
            <span className="text-[10px] text-emerald-600 mt-1 block">Con revegetación nativa</span>
          </div>
        </div>

        {/* IRH City Average & Volume */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="font-bold text-slate-800 block text-[11px] mb-1">
              <i className="fa-solid fa-water text-blue-600 mr-1.5"></i>
              IRH Promedio Municipal
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-[#0060a9]">{stats.irhPromedioSMT}</span>
              <span className="text-xs text-slate-500 font-medium">/ 100</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Nivel general: Moderado a Crítico</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="font-bold text-slate-800 block text-[11px] mb-1">
              <i className="fa-solid fa-dumpster text-amber-600 mr-1.5"></i>
              Residuos Estimados
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-slate-900">{stats.residuosEstimadosM3.toLocaleString()}</span>
              <span className="text-xs text-slate-500 font-medium">m³</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">~1,860 Toneladas equivalentes</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="font-bold text-slate-800 block text-[11px] mb-1">
              <i className="fa-solid fa-ruler-combined text-teal-600 mr-1.5"></i>
              Distancia Media a Cauce
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-slate-900">{stats.distanciaPromedioCauce}</span>
              <span className="text-xs text-slate-500 font-medium">metros</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Proximidad de alto riesgo de arrastre</p>
          </div>
        </div>

        {/* Distribution by Status Bar */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span className="font-bold text-slate-800 block text-[11px] mb-2">
            Estado de los focos identificados
          </span>
          <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${(activos / (focos.length || 1)) * 100}%` }}
              className="bg-red-500 h-full"
              title={`Activos: ${activos}`}
            ></div>
            <div
              style={{ width: `${(pendientes / (focos.length || 1)) * 100}%` }}
              className="bg-amber-500 h-full"
              title={`Pendientes: ${pendientes}`}
            ></div>
            <div
              style={{ width: `${(limpiados / (focos.length || 1)) * 100}%` }}
              className="bg-emerald-500 h-full"
              title={`Limpiados: ${limpiados}`}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 mt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Activos ({activos})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Pendientes ({pendientes})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Saneados ({limpiados})
            </span>
          </div>
        </div>
      </div>
    </GismatModal>
  );
};
