import React from 'react';
import { GismatModal } from '../GismatModal';
import { FocoAmbiente } from '../../types/geoportal';

interface FocoDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  foco: FocoAmbiente | null;
  onCenterInMap?: (foco: FocoAmbiente) => void;
  onAssignCrew?: (foco: FocoAmbiente) => void;
}

export const FocoDetailModal: React.FC<FocoDetailModalProps> = ({
  isOpen,
  onClose,
  foco,
  onCenterInMap,
  onAssignCrew,
}) => {
  if (!foco) return null;

  const getIRHColor = (irh: number) => {
    if (irh >= 70) return { bg: 'bg-red-500', text: 'text-red-700', badge: 'bg-red-50 border-red-200 text-red-700', label: 'Crítico' };
    if (irh >= 40) return { bg: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-50 border-amber-200 text-amber-700', label: 'Moderado' };
    return { bg: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: 'Bajo' };
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'activo':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-red-100 text-red-800 border border-red-200">Activo</span>;
      case 'pendiente':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">Pendiente</span>;
      case 'limpiado':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">Saneado / Limpiado</span>;
      case 'inactivo':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">Inactivo</span>;
      default:
        return null;
    }
  };

  const irhInfo = getIRHColor(foco.irh);

  return (
    <GismatModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-slate-900 tracking-tight">Ficha Técnica: {foco.id}</span>
          {getEstadoBadge(foco.estado)}
        </div>
      }
      subtitle={`${foco.ubicacion} • ${foco.barrio}`}
      badge={
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${irhInfo.badge} flex items-center gap-1.5`}>
          <span className={`w-2 h-2 rounded-full ${irhInfo.bg} animate-pulse`}></span>
          IRH: {foco.irh}/100 ({irhInfo.label})
        </span>
      }
      icon={
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0060a9] flex items-center justify-center text-lg shadow-xs">
          <i className="fa-solid fa-layer-group"></i>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>Registrado el {foco.fechaRegistro} por sensor satelital IA</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onCenterInMap) onCenterInMap(foco);
                onClose();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-crosshairs"></i>
              Centrar en Mapa
            </button>
            {onAssignCrew && (
              <button
                onClick={() => {
                  onAssignCrew(foco);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0060a9] hover:bg-blue-800 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <i className="fa-solid fa-truck-pickup"></i>
                Despachar Cuadrilla
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* IRH Gauge and Proximity Banner */}
        <div className="p-4 rounded-2xl bg-linear-to-r from-slate-50 to-blue-50/40 border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-water text-blue-600"></i>
              Índice de Riesgo Hídrico (IRH)
            </span>
            <span className="font-extrabold text-sm text-slate-900">{foco.irh} / 100</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className={`h-full ${irhInfo.bg} transition-all duration-500 rounded-full`}
              style={{ width: `${foco.irh}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>0 (Bajo)</span>
            <span>40 (Moderado)</span>
            <span>70 (Crítico)</span>
            <span>100</span>
          </div>
        </div>

        {/* 4 Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Tipo de foco</span>
            <span className="text-xs font-bold text-slate-800 capitalize mt-0.5 block flex items-center gap-1">
              <i className="fa-solid fa-trash text-slate-400"></i>
              {foco.tipo}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Distancia al agua</span>
            <span className="text-xs font-extrabold text-blue-700 mt-0.5 block flex items-center gap-1">
              <i className="fa-solid fa-ruler-horizontal text-blue-500"></i>
              {foco.distanciaCursoAgua} metros
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Volumen estimado</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">
              {foco.volumenEstimado}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Superficie</span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block">
              ~{foco.superficieM2} m²
            </span>
          </div>
        </div>

        {/* Environmental & Soil Attributes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200">
            <span className="font-bold text-slate-700 block mb-1 text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-droplet text-cyan-600"></i>
              Curso de agua más cercano
            </span>
            <p className="text-slate-800 font-semibold">{foco.cursoAguaCercano}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Pendiente hidráulica orientada hacia el talud con arrastre directo en caso de anegamiento.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200">
            <span className="font-bold text-slate-700 block mb-1 text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-mountain text-amber-700"></i>
              Permeabilidad del suelo
            </span>
            <p className="text-slate-800 font-semibold">{foco.permeabilidadSuelo}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Coordenadas: <span className="font-mono text-[10px] text-slate-600">{foco.coordenadas[0].toFixed(4)}° S, {foco.coordenadas[1].toFixed(4)}° O</span>
            </p>
          </div>
        </div>

        {/* Observations */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200">
          <span className="font-bold text-slate-800 block mb-1 text-[11px] flex items-center gap-1.5">
            <i className="fa-solid fa-clipboard-list text-slate-500"></i>
            Observaciones de relevamiento territorial
          </span>
          <p className="text-slate-600 leading-relaxed">{foco.observaciones}</p>
        </div>

        {/* Interventions & Next Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {foco.ultimaIntervencion ? (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="font-bold text-emerald-900 block mb-1 text-[11px] flex items-center gap-1.5">
                <i className="fa-solid fa-check-circle text-emerald-600"></i>
                Última intervención ({foco.ultimaIntervencion.fecha})
              </span>
              <p className="text-emerald-800 font-semibold">{foco.ultimaIntervencion.cuadrilla}</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">{foco.ultimaIntervencion.descripcion}</p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-slate-500">
              <span className="font-bold block mb-1 text-[11px]">Última intervención</span>
              <p className="text-[11px] italic">Sin intervenciones operativas previas registradas en el sistema.</p>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <span className="font-bold text-blue-900 block mb-1 text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-bullseye text-[#0060a9]"></i>
              Próxima acción recomendada
            </span>
            <p className="text-blue-950 font-medium leading-snug">{foco.proximaAccionRecomendada}</p>
          </div>
        </div>
      </div>
    </GismatModal>
  );
};
