import React, { useState } from 'react';
import { rellenar, useMetadatos } from '../services/metadatos';

/**
 * Metadatos para interpretar un gráfico: qué mide, unidad, período, fuente y cómo se lee (colores, ejes, marcas).
 * Los textos vienen del backend (GET /api/metadatos/ -> graficos[id]); ver services/metadatos.ts.
 */
export interface ChartMetaProps {
  /** Clave del gráfico en los metadatos (ej. "riesgo_mensual"). */
  id: string;
  /** Valores para los marcadores {anio}, {mes_actual}, etc. de los textos. */
  contexto?: Record<string, string | number>;
}

export const ChartMeta: React.FC<ChartMetaProps> = ({ id, contexto }) => {
  const [abierto, setAbierto] = useState(false);
  const meta = useMetadatos().graficos[id];
  if (!meta) return null;
  const t = (s: string) => rellenar(s, contexto);
  const mide = t(meta.mide), unidad = t(meta.unidad), periodo = t(meta.periodo), fuente = t(meta.fuente), comoLeer = meta.comoLeer.map(t);
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 text-[10.5px] text-slate-500">
      <dl className="space-y-1">
        <div>
          <dt className="font-bold text-slate-600 inline">Unidad: </dt>
          <dd className="inline">{unidad}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-600 inline">Período: </dt>
          <dd className="inline">{periodo}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-600 inline">Fuente: </dt>
          <dd className="inline">{fuente}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1.5 font-semibold text-[#1565c0] hover:underline cursor-pointer"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <i className={`fa-solid ${abierto ? 'fa-chevron-up' : 'fa-circle-info'} text-[10px]`}></i>
        {abierto ? 'Ocultar guía de lectura' : '¿Cómo se lee este gráfico?'}
      </button>
      {abierto && (
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-600 leading-snug">
          <p className="mb-1.5"><strong className="text-slate-700">Qué muestra:</strong> {mide}</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {comoLeer.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** Etiqueta de eje (texto corto rotulando qué mide un eje). */
export const EjeTitulo: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`text-[10px] font-semibold text-slate-500 uppercase tracking-wide ${className}`}>{children}</span>
);
