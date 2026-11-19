import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BBOX } from '../services/basuralesService';

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  /** Se llama con las coordenadas (6 decimales) del punto donde se hizo clic. */
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
  height?: number;
}

const CENTRO: L.LatLngExpression = [-26.8241, -65.2226]; // San Miguel de Tucumán

/**
 * Mapa para indicar la ubicación de un foco (CU005, paso 3): un clic coloca el punto y completa latitud y longitud.
 * Se limita al área de San Miguel de Tucumán (la misma caja que valida el servidor).
 */
export const MapPicker: React.FC<MapPickerProps> = ({ lat, lng, onPick, disabled = false, height = 240 }) => {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const punto = useRef<L.CircleMarker | null>(null);
  const alPick = useRef(onPick);
  alPick.current = onPick;
  const bloqueado = useRef(disabled);
  bloqueado.current = disabled;

  useEffect(() => {
    if (!el.current || mapa.current) return;
    const m = L.map(el.current, {
      center: CENTRO,
      zoom: 13,
      minZoom: 11,
      maxBounds: L.latLngBounds([BBOX.latMin - 0.05, BBOX.lngMin - 0.05], [BBOX.latMax + 0.05, BBOX.lngMax + 0.05]),
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (bloqueado.current) return;
      alPick.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    });
    mapa.current = m;
    // El mapa vive dentro de un modal con animación: se recalcula el tamaño cuando termina de abrirse
    const t = setTimeout(() => m.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      punto.current = null;
    };
  }, []);

  // El punto sigue a los campos de latitud/longitud (se pueden escribir o elegir en el mapa)
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const valido = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
    if (!valido) {
      punto.current?.remove();
      punto.current = null;
      return;
    }
    const pos: L.LatLngExpression = [lat as number, lng as number];
    if (!punto.current) {
      punto.current = L.circleMarker(pos, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#e53935', fillOpacity: 1 }).addTo(m);
    } else {
      punto.current.setLatLng(pos);
    }
    if (!m.getBounds().contains(pos)) m.panTo(pos);
  }, [lat, lng]);

  return (
    <div
      ref={el}
      role="application"
      aria-label="Mapa para indicar la ubicación del foco: hacé clic en el punto donde está el basural"
      data-testid="map-picker"
      style={{ height }}
      className={`w-full rounded-lg border border-slate-300 overflow-hidden ${disabled ? 'opacity-60' : 'cursor-crosshair'}`}
    />
  );
};
