import React from 'react';
import { GeoportalFilters, Microcuenca } from '../../types/geoportal';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: GeoportalFilters;
  onChangeFilters: (newFilters: GeoportalFilters) => void;
  onResetFilters: () => void;
  microcuencas: Microcuenca[];
  totalFiltered: number;
  totalAvailable: number;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onChangeFilters,
  onResetFilters,
  microcuencas,
  totalFiltered,
  totalAvailable,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-xs"
        onClick={onClose}
      ></div>

      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300 border-l border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-sliders text-[#0060a9]"></i>
            <h2 className="text-sm font-bold text-slate-800">Filtros Espaciales</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Counter Header */}
        <div className="px-4 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">Elementos visibles:</span>
          <span className="font-bold text-[#0060a9]">
            {totalFiltered} de {totalAvailable} focos
          </span>
        </div>

        {/* Filter Controls Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Tipo de Foco */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
              Tipo de Foco
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'basural', label: 'Basural' },
                { id: 'microbasural', label: 'Microbasural' },
                { id: 'volcadero', label: 'Volcadero' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onChangeFilters({ ...filters, tipoFoco: opt.id })}
                  className={`py-1.5 px-2.5 rounded-lg font-medium text-xs border text-left transition-colors cursor-pointer ${
                    filters.tipoFoco === opt.id
                      ? 'bg-[#0060a9] text-white border-[#0060a9] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
              Estado de Gestión
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'activo', label: 'Activo' },
                { id: 'pendiente', label: 'Pendiente' },
                { id: 'limpiado', label: 'Saneado' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onChangeFilters({ ...filters, estado: opt.id })}
                  className={`py-1.5 px-2.5 rounded-lg font-medium text-xs border text-left transition-colors cursor-pointer ${
                    filters.estado === opt.id
                      ? 'bg-[#0060a9] text-white border-[#0060a9] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nivel de Riesgo */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
              Nivel de Riesgo
            </label>
            <div className="flex gap-1.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'Crítico', label: 'Crítico', color: 'text-red-700' },
                { id: 'Moderado', label: 'Moderado', color: 'text-amber-700' },
                { id: 'Bajo', label: 'Bajo', color: 'text-emerald-700' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onChangeFilters({ ...filters, nivelRiesgo: opt.id })}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-semibold text-xs border text-center transition-colors cursor-pointer ${
                    filters.nivelRiesgo === opt.id
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rango de IRH Slider */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                Rango Mínimo IRH
              </label>
              <span className="font-extrabold text-[#0060a9] bg-white px-2 py-0.5 rounded border border-slate-200">
                ≥ {filters.irhMin}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={filters.irhMin}
              onChange={(e) =>
                onChangeFilters({ ...filters, irhMin: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0060a9]"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
              <span>0 (Todos)</span>
              <span>40 (Moderados)</span>
              <span>70 (Críticos)</span>
            </div>
          </div>

          {/* Microcuenca */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
              Microcuenca de Drenaje
            </label>
            <select
              value={filters.microcuenca}
              onChange={(e) => onChangeFilters({ ...filters, microcuenca: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl p-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="todas">Todas las microcuencas</option>
              {microcuencas.map((mc) => (
                <option key={mc.id} value={mc.id}>
                  {mc.nombre} (IRH: {mc.irhPromedio})
                </option>
              ))}
            </select>
          </div>

          {/* Proximidad a Cursos de Agua */}
          <div>
            <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
              Proximidad al Curso de Agua
            </label>
            <select
              value={filters.proximidadMax}
              onChange={(e) =>
                onChangeFilters({ ...filters, proximidadMax: parseInt(e.target.value, 10) })
              }
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl p-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
            >
              <option value="0">Cualquier distancia</option>
              <option value="25">Menos de 25 metros (Riesgo Inmediato)</option>
              <option value="50">Menos de 50 metros (Buffer Estival)</option>
              <option value="100">Menos de 100 metros (Franja Aluvial)</option>
            </select>
          </div>

          {/* Solo con alertas */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-red-50/60 border border-red-200 hover:bg-red-50 transition-colors">
              <input
                type="checkbox"
                checked={filters.soloAlertas}
                onChange={(e) => onChangeFilters({ ...filters, soloAlertas: e.target.checked })}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-red-900">
                Mostrar solo focos con alertas activas
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
          <button
            onClick={onResetFilters}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Limpiar filtros
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-[#0060a9] hover:bg-blue-800 transition-colors shadow-sm cursor-pointer"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};
