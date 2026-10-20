import React from 'react';
import { EnvironmentalAlert } from '../../types/geoportal';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alertas: EnvironmentalAlert[];
  onSelectAlertaFoco: (focoId?: string, coords?: [number, number]) => void;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  isOpen,
  onClose,
  alertas,
  onSelectAlertaFoco,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      ></div>

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300 border-l border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Alertas Ambientales y de Riesgo</h2>
              <p className="text-[11px] text-slate-500">Sistema predictivo hidrológico GISMAT</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar panel de alertas"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Technical Disclaimer Notice */}
        <div className="p-3 bg-amber-50/90 border-b border-amber-200/90 text-[11px] text-amber-900 flex items-start gap-2.5">
          <i className="fa-solid fa-circle-info text-amber-600 mt-0.5 shrink-0 text-xs"></i>
          <p className="leading-snug">
            <strong>Aviso de rigor metodológico:</strong> Las alertas de GISMAT corresponden a situaciones de{' '}
            <em>riesgo hidrológico o posibilidad de afectación física por arrastre aluvial y lixiviados</em> basadas
            en proximidad geoespacial y pronósticos climáticos. No constituyen determinación de contaminación
            química efectiva sin muestreo de laboratorio en cauce.
          </p>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {alertas.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <i className="fa-solid fa-shield-halved text-3xl mb-2 text-emerald-500"></i>
              <p className="text-xs font-semibold text-slate-600">No hay alertas críticas activas</p>
              <p className="text-[11px]">Los parámetros de cuenca se encuentran en rangos de estabilidad.</p>
            </div>
          ) : (
            alertas.map((alerta) => (
              <div
                key={alerta.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  alerta.nivel === 'critica'
                    ? 'bg-red-50/60 border-red-200 hover:bg-red-50'
                    : alerta.nivel === 'advertencia'
                    ? 'bg-amber-50/60 border-amber-200 hover:bg-amber-50'
                    : 'bg-blue-50/60 border-blue-200 hover:bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      alerta.nivel === 'critica'
                        ? 'bg-red-100 text-red-800'
                        : alerta.nivel === 'advertencia'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {alerta.nivel === 'critica' ? 'Prioridad Alta' : alerta.nivel === 'advertencia' ? 'Advertencia' : 'Informativa'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{alerta.fecha}</span>
                </div>

                <h3 className="text-xs font-bold text-slate-800 leading-snug mb-1">
                  {alerta.titulo}
                </h3>
                <p className="text-[11px] text-slate-600 leading-relaxed mb-2.5">
                  {alerta.descripcion}
                </p>

                {alerta.focoId && (
                  <button
                    onClick={() => {
                      onSelectAlertaFoco(alerta.focoId, alerta.coordenadas);
                      onClose();
                    }}
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <i className="fa-solid fa-location-crosshairs text-[#0060a9]"></i>
                    Localizar foco {alerta.focoId} en el visor
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
