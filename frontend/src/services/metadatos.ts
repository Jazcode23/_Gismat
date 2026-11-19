/**
 * Metadatos para interpretar datos y gráficos. La fuente es GET /api/metadatos/ (umbrales de IRH, unidades,
 * definiciones, guías de lectura), así el frontend nunca repite números que viven en el backend.
 * Sin API (modo demo) o si el pedido falla se usa metadatosFallback.json, generado desde el mismo backend con
 * `python scripts/exportar_metadatos_frontend.py`.
 */
import { useEffect, useState } from 'react';
import { api, API_ENABLED, session } from './apiClient';
import fallback from '../data/metadatosFallback.json';

export interface NivelIRH { nivel: 'Crítico' | 'Moderado' | 'Bajo'; desde: number; hasta: number; color: string; rango: string }
export interface MetaGrafico { mide: string; unidad: string; periodo: string; fuente: string; comoLeer: string[] }
export interface VariableSatelital { nombre: string; unidad: string; descripcion: string }

export interface Metadatos {
  irh: {
    nombre: string; sigla: string;
    escala: { min: number; max: number; unidad: string };
    umbrales: { moderado: number; critico: number };
    niveles: NivelIRH[];
    leyenda: string;
    pesos: { variable: string; etiqueta: string; peso: number }[];
    provisorio: string;
  };
  detecciones: {
    confianza: { unidad: string; descripcion: string; rangos: { etiqueta: string; desde: number; nivel: string; color: string }[] };
    precision: { formula: string; descripcion: string };
    variablesSatelitales: { vulnHidrica: VariableSatelital; escurrimiento: VariableSatelital; residuosPeligrosos: VariableSatelital; nota: string };
  };
  graficos: Record<string, MetaGrafico>;
}

let actual: Metadatos = fallback as unknown as Metadatos;
let cargado = false;
const oyentes = new Set<() => void>();

async function cargar() {
  if (cargado || !API_ENABLED || !session.getToken()) return;
  cargado = true;
  try {
    actual = await api<Metadatos>('/metadatos/');
    oyentes.forEach((f) => f());
  } catch {
    cargado = false; // se reintenta en el próximo montaje; mientras tanto rige el respaldo
  }
}

export function useMetadatos(): Metadatos {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    oyentes.add(f);
    cargar();
    return () => { oyentes.delete(f); };
  }, []);
  return actual;
}

/** Reemplaza marcadores {clave} de los textos de metadatos con valores de contexto (año, mes actual...). */
export const rellenar = (texto: string, ctx: Record<string, string | number> = {}) =>
  texto.replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? String(ctx[k]) : m));

/** Nivel de IRH según los umbrales vigentes. */
export function nivelDeIRH(irh: number, m: Metadatos): NivelIRH {
  const n = m.irh.niveles;
  return irh >= m.irh.umbrales.critico ? n[0] : irh >= m.irh.umbrales.moderado ? n[1] : n[2];
}
