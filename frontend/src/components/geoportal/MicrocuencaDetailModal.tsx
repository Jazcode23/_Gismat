import React from 'react';
import { GismatModal } from '../GismatModal';
import { Microcuenca } from '../../types/geoportal';

interface MicrocuencaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  microcuenca: Microcuenca | null;
  onFilterByThisCuenca?: (cuencaId: string) => void;
}

export const MicrocuencaDetailModal: React.FC<MicrocuencaDetailModalProps> = ({
  isOpen,
  onClose,
  microcuenca,
  onFilterByThisCuenca,
}) => {
  if (!microcuenca) return null;

  const getRiesgoStyle = (nivel: string) => {
    switch (nivel) {
      case 'Crítico':
        return { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
      case 'Moderado':
        return { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
      default:
        return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    }
  };

  const style = getRiesgoStyle(microcuenca.nivelRiesgo);

  return (
    <GismatModal
      isOpen={isOpen}
      onClose={onClose}
      title={microcuenca.nombre}
      subtitle={`Superficie de captación pluvial: ${microcuenca.superficieKm2} km²`}
      badge={
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${style.badge} flex items-center gap-1.5`}>
          <span className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`}></span>
          IRH Promedio: {microcuenca.irhPromedio}/100 ({microcuenca.nivelRiesgo})
        </span>
      }
      icon={
        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg shadow-xs">
          <i className="fa-solid fa-water"></i>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-slate-500">
            Delimitación hidrográfica oficial • San Miguel de Tucumán
          </span>
          <button
            onClick={() => {
              if (onFilterByThisCuenca) onFilterByThisCuenca(microcuenca.id);
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0060a9] hover:bg-blue-800 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <i className="fa-solid fa-filter"></i>
            Filtrar focos de esta microcuenca
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">IRH Promedio</span>
            <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">{microcuenca.irhPromedio} / 100</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Focos Totales</span>
            <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">{microcuenca.focosTotales}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 shadow-2xs">
            <span className="text-[10px] text-amber-800 uppercase font-bold block">Focos Activos</span>
            <span className="text-lg font-extrabold text-amber-900 mt-0.5 block">{microcuenca.focosActivos}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 shadow-2xs">
            <span className="text-[10px] text-red-800 uppercase font-bold block">Focos Críticos</span>
            <span className="text-lg font-extrabold text-red-900 mt-0.5 block">{microcuenca.focosCriticos}</span>
          </div>
        </div>

        {/* Associated Watercourses */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span className="font-bold text-slate-800 block mb-1 text-[11px] flex items-center gap-1.5">
            <i className="fa-solid fa-droplet text-blue-600"></i>
            Cursos de agua receptores asociados
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {microcuenca.cursosAsociados.map((curso, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs"
              >
                <i className="fa-solid fa-water text-cyan-600 text-[10px]"></i>
                {curso}
              </span>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200">
          <span className="font-bold text-teal-900 block mb-1.5 text-[11px] flex items-center gap-1.5">
            <i className="fa-solid fa-clipboard-check text-teal-700"></i>
            Recomendaciones de intervención y saneamiento
          </span>
          <p className="text-teal-950 font-medium leading-relaxed">{microcuenca.recomendaciones}</p>
        </div>
      </div>
    </GismatModal>
  );
};
