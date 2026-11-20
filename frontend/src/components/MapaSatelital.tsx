import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapaSatelitalProps {
  lat: number;
  lng: number;
  /** Superficie detectada (m²): se dibuja como círculo de área equivalente alrededor de la ubicación sugerida. */
  areaM2?: number;
  height?: number | string;
  zoom?: number;
  testId?: string;
}

/**
 * Imagen satelital de la ubicación sugerida por la IA (CU015, pasos 3-4): imagen aérea de referencia con el punto
 * sugerido marcado. Se puede acercar/alejar y desplazar para revisar el entorno antes de decidir.
 */
export const MapaSatelital: React.FC<MapaSatelitalProps> = ({ lat, lng, areaM2 = 0, height = 192, zoom = 17, testId }) => {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: [lat, lng], zoom, minZoom: 12, maxZoom: 19, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagen: Esri, Maxar, Earthstar Geographics',
    }).addTo(m);
    if (areaM2 > 0) {
      L.circle([lat, lng], { radius: Math.sqrt(areaM2 / Math.PI), color: '#ef4444', weight: 2, dashArray: '4 3', fillColor: '#b91c1c', fillOpacity: 0.35 }).addTo(m);
    }
    L.circleMarker([lat, lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }).addTo(m);
    // El mapa vive dentro de un modal con animación: se recalcula el tamaño cuando termina de abrirse
    const t = setTimeout(() => m.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      m.remove();
    };
  }, [lat, lng, areaM2, zoom]);

  return <div ref={el} data-testid={testId} style={{ height }} className="w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900" />;
};
