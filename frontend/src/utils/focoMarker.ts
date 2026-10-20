import type { FocoTipo } from '../types/geoportal';

/**
 * Marcadores del mapa según el tipo de foco.
 *   basural       círculo con tacho (el de siempre; sin ningún cambio)
 *   microbasural  cuadrado redondeado y chico, con tacho simple
 *   volcadero     rombo grande, con contenedor
 * El color sigue indicando el nivel de riesgo (IRH) en los tres casos.
 */

export interface OpcionesPin {
  color: string;
  size: number;
  isSelected: boolean;
  isCritical: boolean;
  opacity: number | string;
}

export const ETIQUETA_TIPO_FOCO: Record<FocoTipo, string> = {
  basural: 'Basural',
  microbasural: 'Microbasural',
  volcadero: 'Volcadero clandestino',
};

export const tamanoPin = (tipo: FocoTipo | undefined, seleccionado: boolean): number =>
  tipo === 'volcadero' ? (seleccionado ? 38 : 32) : tipo === 'microbasural' ? (seleccionado ? 30 : 22) : seleccionado ? 36 : 28;

const puntoCritico =
  '<span style="position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; border: 1px solid white;"></span>';

/** Marcador del basural: texto idéntico al que ya usaba el mapa. */
function pinBasural({ color, size, isSelected, isCritical, opacity }: OpcionesPin): string {
  return `
          <div style="
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid white;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${isSelected ? 14 : 11}px;
            font-weight: 800;
            cursor: pointer;
            transition: transform 0.2s ease;
            position: relative;
            opacity: ${opacity};
          ">
            ${isCritical ? '<span style="position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; border: 1px solid white;"></span>' : ''}
            <i class="fa-solid fa-trash-can"></i>
          </div>
        `;
}

const baseForma = (color: string, extra: string) =>
  `width: 100%; height: 100%; background: ${color}; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; cursor: pointer; transition: transform 0.2s ease; box-sizing: border-box; ${extra}`;

export function construirPin(tipo: FocoTipo | undefined, o: OpcionesPin): string {
  if (tipo === 'microbasural') {
    return `<div data-tipo-foco="microbasural" style="position: relative; width: ${o.size}px; height: ${o.size}px; opacity: ${o.opacity};">
      <div style="${baseForma(o.color, `border-radius: 6px; font-size: ${o.isSelected ? 13 : 10}px;`)}"><i class="fa-solid fa-trash"></i></div>
      ${o.isCritical ? puntoCritico : ''}
    </div>`;
  }
  if (tipo === 'volcadero') {
    return `<div data-tipo-foco="volcadero" style="position: relative; width: ${o.size}px; height: ${o.size}px; opacity: ${o.opacity};">
      <div style="${baseForma(o.color, `border-radius: 5px; transform: rotate(45deg); font-size: ${o.isSelected ? 15 : 12}px;`)}"><i class="fa-solid fa-dumpster" style="transform: rotate(-45deg);"></i></div>
      ${o.isCritical ? puntoCritico : ''}
    </div>`;
  }
  return pinBasural(o);
}

/** Etiqueta del tipo para el popup. Vacía para el basural, así su popup queda exactamente como estaba. */
export function chipTipoPopup(tipo: FocoTipo | undefined): string {
  if (tipo !== 'microbasural' && tipo !== 'volcadero') return '';
  return `<span style="display: inline-block; font-size: 10px; font-weight: 700; background: #eef2ff; color: #3730a3; padding: 2px 8px; border-radius: 9999px; margin-bottom: 4px;">${ETIQUETA_TIPO_FOCO[tipo]}</span>`;
}
