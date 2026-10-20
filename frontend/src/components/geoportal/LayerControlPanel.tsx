import React, { useState } from 'react';
import { LayerConfig } from '../../types/geoportal';

interface LayerControlPanelProps {
  layers: LayerConfig[];
  onToggleLayer: (layerId: string) => void;
  onChangeOpacity: (layerId: string, opacity: number) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  mostrarRiesgoHidrico: boolean;
}

export const LayerControlPanel: React.FC<LayerControlPanelProps> = ({
  layers,
  onToggleLayer,
  onChangeOpacity,
  isOpen,
  onToggleOpen,
  mostrarRiesgoHidrico,
}) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'legend'>('layers');
  const [layerSettingsOpen, setLayerSettingsOpen] = useState<string | null>(null);

  const getLayerIcon = (id: string) => {
    switch (id) {
      case 'layer_focos':
        return <i className="fa-solid fa-trash-can text-red-500"></i>;
      case 'layer_cursos':
        return <i className="fa-solid fa-droplet text-blue-500"></i>;
      case 'layer_microcuencas':
        return <i className="fa-solid fa-water text-teal-500"></i>;
      case 'layer_zonas_riesgo':
        return <i className="fa-solid fa-triangle-exclamation text-amber-500"></i>;
      case 'layer_monitoreo':
        return <i className="fa-solid fa-satellite-dish text-indigo-500"></i>;
      case 'layer_barrios':
        return <i className="fa-solid fa-city text-slate-500"></i>;
      case 'layer_riesgo_calor':
        return <i className="fa-solid fa-fire-flame-curved text-rose-500"></i>;
      default:
        return <i className="fa-solid fa-layer-group text-slate-400"></i>;
    }
  };

  return (
    <div
      className={`absolute top-4 left-4 z-20 transition-all duration-300 select-none ${
        isOpen ? 'w-80' : 'w-auto'
      }`}
    >
      {/* Collapsed Button */}
      {!isOpen && (
        <button
          onClick={onToggleOpen}
          className="bg-white/95 hover:bg-white text-slate-800 font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-lg border border-slate-200/90 backdrop-blur-md flex items-center gap-2 transition-all hover:scale-102 cursor-pointer"
          title="Abrir panel de capas y leyenda"
        >
          <div className="w-5 h-5 rounded-md bg-[#0060a9] text-white flex items-center justify-center text-[10px]">
            <i className="fa-solid fa-layer-group"></i>
          </div>
          <span>Capas y Leyenda</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        </button>
      )}

      {/* Expanded Floating Box */}
      {isOpen && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[82vh] animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#0060a9] text-white flex items-center justify-center text-xs">
                <i className="fa-solid fa-layer-group"></i>
              </div>
              <h3 className="font-bold text-xs text-slate-800 tracking-tight">Capas del Sistema</h3>
            </div>
            <button
              onClick={onToggleOpen}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors cursor-pointer"
              title="Minimizar panel"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
          </div>

          {/* Tabs: Capas vs Leyenda */}
          <div className="flex border-b border-slate-200 bg-slate-100/60 p-1 gap-1 text-xs">
            <button
              onClick={() => setActiveTab('layers')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'layers'
                  ? 'bg-white text-[#0060a9] shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-list-check mr-1.5 text-[11px]"></i>
              Capas SIG
            </button>
            <button
              onClick={() => setActiveTab('legend')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'legend'
                  ? 'bg-white text-[#0060a9] shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="fa-solid fa-palette mr-1.5 text-[11px]"></i>
              Leyenda Dinámica
            </button>
          </div>

          {/* Tab 1: Layer Switches */}
          {activeTab === 'layers' && (
            <div className="p-3 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
              {layers.map((layer) => (
                <div key={layer.id} className="pt-1.5 first:pt-0">
                  <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-xs shrink-0">
                        {getLayerIcon(layer.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">
                          {layer.nombre}
                        </span>
                        {layer.conteo !== undefined && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {layer.conteo} entidades
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Opacity settings toggler */}
                      <button
                        onClick={() =>
                          setLayerSettingsOpen(layerSettingsOpen === layer.id ? null : layer.id)
                        }
                        className={`p-1 rounded-md text-xs cursor-pointer ${
                          layerSettingsOpen === layer.id
                            ? 'text-[#0060a9] bg-blue-50'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title="Ajustar opacidad de capa"
                      >
                        <i className="fa-solid fa-sliders text-[11px]"></i>
                      </button>

                      {/* Switch Checkbox */}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={layer.visible}
                          onChange={() => onToggleLayer(layer.id)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#0060a9]"></div>
                      </label>
                    </div>
                  </div>

                  {/* Opacity slider accordion */}
                  {layerSettingsOpen === layer.id && (
                    <div className="mt-1 px-3 py-2 bg-slate-50/80 rounded-lg border border-slate-200/80 text-[11px] animate-in fade-in duration-150">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-600 font-medium">Opacidad de capa</span>
                        <span className="font-bold text-slate-800">
                          {Math.round(layer.opacidad * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={layer.opacidad}
                        onChange={(e) =>
                          onChangeOpacity(layer.id, parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0060a9]"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Dynamic Legend */}
          {activeTab === 'legend' && (
            <div className="p-3.5 overflow-y-auto space-y-3 text-xs">
              {/* IRH Scale Legend */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block mb-2 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-water text-blue-600"></i>
                  Índice de Riesgo Hídrico (IRH)
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500 border border-red-600 shadow-2xs"></span>
                    <div className="flex-1 flex justify-between">
                      <span className="font-semibold text-slate-800">70 – 100</span>
                      <span className="text-red-700 font-bold">Riesgo Crítico</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-amber-600 shadow-2xs"></span>
                    <div className="flex-1 flex justify-between">
                      <span className="font-semibold text-slate-800">40 – 69</span>
                      <span className="text-amber-700 font-bold">Riesgo Moderado</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-emerald-600 shadow-2xs"></span>
                    <div className="flex-1 flex justify-between">
                      <span className="font-semibold text-slate-800">0 – 39</span>
                      <span className="text-emerald-700 font-bold">Riesgo Bajo</span>
                    </div>
                  </div>
                </div>
                {mostrarRiesgoHidrico && (
                  <p className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-red-600 font-semibold flex items-center gap-1">
                    <i className="fa-solid fa-circle-dot animate-ping"></i>
                    Simbología graduada y buffer de calor activados en el mapa
                  </p>
                )}
              </div>

              {/* Tipos de foco: forma del marcador */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200" data-purpose="legend-tipos-foco">
                <span className="font-bold text-slate-800 block mb-2 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-trash-can text-red-500"></i>
                  Tipos de foco (forma del marcador)
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center text-white shrink-0" style={{ width: 20, height: 20, background: '#64748b', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', fontSize: 9, boxSizing: 'border-box', borderRadius: '50%' }}><i className="fa-solid fa-trash-can"></i></span>
                    <span><strong>Basural</strong>: acumulación de gran extensión</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center text-white shrink-0" style={{ width: 16, height: 16, background: '#64748b', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', fontSize: 9, boxSizing: 'border-box', borderRadius: 6 }}><i className="fa-solid fa-trash"></i></span>
                    <span><strong>Microbasural</strong>: foco chico y disperso</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center text-white shrink-0" style={{ width: 18, height: 18, background: '#64748b', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', fontSize: 9, boxSizing: 'border-box', borderRadius: 4, transform: 'rotate(45deg)' }}><i className="fa-solid fa-dumpster" style={{ transform: 'rotate(-45deg)' }}></i></span>
                    <span><strong>Volcadero clandestino</strong>: acumulación grande, a menudo recurrente</span>
                  </div>
                  <p className="text-[10px] text-slate-500 pt-0.5">El color de cada marcador indica su nivel de riesgo (IRH).</p>
                </div>
              </div>

              {/* Watercourses */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block mb-2 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <i className="fa-solid fa-droplet text-blue-500"></i>
                  Cursos de Agua Receptores
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-1.5 bg-[#0284c7] rounded-full"></span>
                    <span className="text-slate-700 font-medium">Río Salí (Cauce Principal)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-1.5 bg-[#06b6d4] rounded-full"></span>
                    <span className="text-slate-700 font-medium">Canal Norte / Canal Sur (Desagües Troncales)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-1.5 bg-[#38bdf8] rounded-full"></span>
                    <span className="text-slate-700 font-medium">Arroyo Medina (Aliviador)</span>
                  </div>
                </div>
              </div>

              {/* Monitoring Stations & Risk Zones */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block mb-2 text-[11px] uppercase tracking-wider">
                  Otras Referencias
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-indigo-500 text-white text-[8px] flex items-center justify-center">
                      <i className="fa-solid fa-satellite-dish"></i>
                    </span>
                    <span className="text-slate-700 font-medium">Estación de Telemetría Pluvial</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-3 bg-amber-400/40 border border-amber-500 border-dashed rounded-xs"></span>
                    <span className="text-slate-700 font-medium">Franja Aluvial de Anegamiento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-3 bg-teal-400/30 border border-teal-600 rounded-xs"></span>
                    <span className="text-slate-700 font-medium">Límite de Microcuenca Hidrográfica</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Footer indicator */}
          <div className="px-3 py-2 bg-slate-100/70 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Sistema Geodésico: WGS84 / EPSG:4326</span>
            <span className="font-semibold text-emerald-700">En línea</span>
          </div>
        </div>
      )}
    </div>
  );
};
