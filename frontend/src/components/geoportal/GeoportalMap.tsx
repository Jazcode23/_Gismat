import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  FocoAmbiente,
  CursoAgua,
  Microcuenca,
  ZonaRiesgo,
  PuntoMonitoreo,
  BarrioSector,
  LayerConfig,
  BaseMapId,
  MapTool,
} from '../../types/geoportal';
import { SMT_INITIAL_CENTER, SMT_INITIAL_ZOOM } from '../../data/mockGeoportalData';
import { API_ENABLED, descargarArchivo } from '../../services/apiClient';
import { chipTipoPopup, construirPin, tamanoPin } from '../../utils/focoMarker';

interface GeoportalMapProps {
  focos: FocoAmbiente[];
  cursos: CursoAgua[];
  microcuencas: Microcuenca[];
  zonasRiesgo: ZonaRiesgo[];
  monitoreo: PuntoMonitoreo[];
  barrios: BarrioSector[];
  layers: LayerConfig[];
  mostrarRiesgoHidrico: boolean;
  selectedFoco: FocoAmbiente | null;
  onSelectFoco: (foco: FocoAmbiente) => void;
  onSelectMicrocuenca: (mc: Microcuenca) => void;
  centerTarget?: { coords: [number, number]; zoom?: number; focoId?: string } | null;
}

const BASE_MAP_URLS: Record<BaseMapId, { url: string; attribution: string; name: string; icon: string }> = {
  osm: {
    name: 'OpenStreetMap (Estándar)',
    icon: 'fa-map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  esri_satellite: {
    name: 'Satélite Alta Resolución (ESRI)',
    icon: 'fa-satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
  },
  carto_light: {
    name: 'CartoDB Positron (Gris Claro SIG)',
    icon: 'fa-square-check',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  carto_dark: {
    name: 'CartoDB Dark (Modo Noche)',
    icon: 'fa-moon',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  topo: {
    name: 'OpenTopoMap (Topográfico)',
    icon: 'fa-mountain-sun',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
};

export const GeoportalMap: React.FC<GeoportalMapProps> = ({
  focos,
  cursos,
  microcuencas,
  zonasRiesgo,
  monitoreo,
  barrios,
  layers,
  mostrarRiesgoHidrico,
  selectedFoco,
  onSelectFoco,
  onSelectMicrocuenca,
  centerTarget,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer groups refs
  const layerGroupsRef = useRef<{
    focos: L.LayerGroup;
    cursos: L.LayerGroup;
    microcuencas: L.LayerGroup;
    zonasRiesgo: L.LayerGroup;
    monitoreo: L.LayerGroup;
    barrios: L.LayerGroup;
    riesgoCalor: L.LayerGroup;
    measuring: L.LayerGroup;
  }>({
    focos: L.layerGroup(),
    cursos: L.layerGroup(),
    microcuencas: L.layerGroup(),
    zonasRiesgo: L.layerGroup(),
    monitoreo: L.layerGroup(),
    barrios: L.layerGroup(),
    riesgoCalor: L.layerGroup(),
    measuring: L.layerGroup(),
  });

  const [activeBaseMap, setActiveBaseMap] = useState<BaseMapId>('osm');
  const [showBaseMapMenu, setShowBaseMapMenu] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: SMT_INITIAL_CENTER[0],
    lng: SMT_INITIAL_CENTER[1],
    zoom: SMT_INITIAL_ZOOM,
  });

  // GIS Tools State
  const [activeTool, setActiveTool] = useState<MapTool>('none');
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureResult, setMeasureResult] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SMT_INITIAL_CENTER,
      zoom: SMT_INITIAL_ZOOM,
      zoomControl: false, // We use custom styled zoom buttons
      attributionControl: true,
    });

    // Initial Base Tile Layer
    const baseTile = L.tileLayer(BASE_MAP_URLS.osm.url, {
      attribution: BASE_MAP_URLS.osm.attribution,
      maxZoom: 19,
    }).addTo(map);
    baseTileLayerRef.current = baseTile;

    // Native graphical scale control
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // Add Layer Groups to Map
    Object.values(layerGroupsRef.current).forEach((group) => {
      group.addTo(map);
    });

    // Track mouse coordinates
    map.on('mousemove', (e) => {
      setCurrentCoords({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        zoom: map.getZoom(),
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Change Base Map
  const handleSelectBaseMap = (baseId: BaseMapId) => {
    if (!mapRef.current) return;
    setActiveBaseMap(baseId);
    setShowBaseMapMenu(false);

    if (baseTileLayerRef.current) {
      mapRef.current.removeLayer(baseTileLayerRef.current);
    }

    const cfg = BASE_MAP_URLS[baseId];
    const newBase = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
    }).addTo(mapRef.current);

    baseTileLayerRef.current = newBase;
    newBase.bringToBack();
  };

  // Center / FlyTo target when requested (from search or detail)
  useEffect(() => {
    if (!mapRef.current || !centerTarget) return;
    mapRef.current.flyTo(centerTarget.coords, centerTarget.zoom || 15, {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [centerTarget]);

  // Reset to initial extent
  const handleResetExtent = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo(SMT_INITIAL_CENTER, SMT_INITIAL_ZOOM, {
      duration: 1,
    });
  }, []);

  // Update Cursos de Agua Layer
  useEffect(() => {
    const group = layerGroupsRef.current.cursos;
    group.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_cursos');
    if (!layerCfg || !layerCfg.visible) return;

    cursos.forEach((curso) => {
      const isRioSali = curso.id === 'curso_rio_sali';
      const color = isRioSali ? '#0284c7' : '#0ea5e9';
      const weight = isRioSali ? 5.5 : 4;

      const polyline = L.polyline(curso.coordenadas, {
        color: color,
        weight: weight,
        opacity: layerCfg.opacidad,
        lineCap: 'round',
        lineJoin: 'round',
      });

      // Interactive popup
      polyline.bindPopup(`
        <div style="font-family: inherit; padding: 12px; min-width: 200px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #0284c7;"></span>
            <strong style="color: #0f172a; font-size: 13px;">${curso.nombre}</strong>
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 4px;">
            <p><strong>Tipo:</strong> ${curso.tipo}</p>
            <p><strong>Longitud tramo SMT:</strong> ${curso.longitudKm} km</p>
            <p><strong>Estado de Conservación:</strong> <span style="font-weight: 700; color: ${curso.estadoConservacion === 'Crítico' ? '#dc2626' : '#d97706'}">${curso.estadoConservacion}</span></p>
          </div>
        </div>
      `);

      group.addLayer(polyline);
    });
  }, [cursos, layers]);

  // Update Microcuencas Layer
  useEffect(() => {
    const group = layerGroupsRef.current.microcuencas;
    group.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_microcuencas');
    if (!layerCfg || !layerCfg.visible) return;

    microcuencas.forEach((mc) => {
      const polygon = L.polygon(mc.coordenadas, {
        color: mc.color,
        fillColor: mc.color,
        fillOpacity: 0.18 * layerCfg.opacidad,
        weight: 2,
        dashArray: '4, 4',
      });

      polygon.on('mouseover', function () {
        polygon.setStyle({
          weight: 3.5,
          fillOpacity: 0.35 * layerCfg.opacidad,
        });
      });

      polygon.on('mouseout', function () {
        polygon.setStyle({
          weight: 2,
          fillOpacity: 0.18 * layerCfg.opacidad,
        });
      });

      polygon.on('click', () => {
        onSelectMicrocuenca(mc);
      });

      polygon.bindTooltip(
        `<strong>${mc.nombre}</strong><br/>IRH Prom: ${mc.irhPromedio}/100 (${mc.nivelRiesgo})`,
        { sticky: true, opacity: 0.9 }
      );

      group.addLayer(polygon);
    });
  }, [microcuencas, layers, onSelectMicrocuenca]);

  // Update Zonas de Riesgo Layer
  useEffect(() => {
    const group = layerGroupsRef.current.zonasRiesgo;
    group.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_zonas_riesgo');
    if (!layerCfg || !layerCfg.visible) return;

    zonasRiesgo.forEach((zr) => {
      const polygon = L.polygon(zr.coordenadas, {
        color: '#f59e0b',
        fillColor: '#fbbf24',
        fillOpacity: 0.22 * layerCfg.opacidad,
        weight: 1.8,
        dashArray: '3, 6',
      });

      polygon.bindPopup(`
        <div style="font-family: inherit; padding: 10px; max-width: 240px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="color: #b45309; font-size: 13px;">⚠️</span>
            <strong style="color: #0f172a; font-size: 12px;">${zr.nombre}</strong>
          </div>
          <p style="font-size: 11px; color: #475569; margin-top: 4px; line-height: 1.35;">${zr.descripcion}</p>
        </div>
      `);

      group.addLayer(polygon);
    });
  }, [zonasRiesgo, layers]);

  // Update Puntos de Monitoreo Layer
  useEffect(() => {
    const group = layerGroupsRef.current.monitoreo;
    group.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_monitoreo');
    if (!layerCfg || !layerCfg.visible) return;

    monitoreo.forEach((mon) => {
      const sensorHtml = `
        <div style="
          width: 24px;
          height: 24px;
          border-radius: 8px;
          background: #4f46e5;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
          border: 2px solid white;
        ">
          📡
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-sensor-icon',
        html: sensorHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker(mon.coordenadas, { icon: customIcon });

      marker.bindPopup(`
        <div style="font-family: inherit; padding: 10px; min-width: 200px;">
          <strong style="color: #0f172a; font-size: 12px; display: block; margin-bottom: 4px;">${mon.nombre}</strong>
          <span style="font-size: 10px; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 9999px; font-weight: 700;">${mon.tipo}</span>
          <p style="font-size: 11px; color: #334155; margin-top: 6px;"><strong>Última lectura:</strong> ${mon.ultimoDato}</p>
          <p style="font-size: 10px; color: #16a34a; font-weight: 600; margin-top: 2px;">Estado: ${mon.estado}</p>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [monitoreo, layers]);

  // Update Barrios Layer
  useEffect(() => {
    const group = layerGroupsRef.current.barrios;
    group.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_barrios');
    if (!layerCfg || !layerCfg.visible) return;

    barrios.forEach((b) => {
      const polygon = L.polygon(b.coordenadas, {
        color: '#64748b',
        fillColor: '#94a3b8',
        fillOpacity: 0.12 * layerCfg.opacidad,
        weight: 1.2,
      });

      polygon.bindTooltip(`<strong>${b.nombre}</strong><br/>~${b.habitantesAprox.toLocaleString()} hab.`, {
        sticky: true,
      });

      group.addLayer(polygon);
    });
  }, [barrios, layers]);

  // Update Focos y Graduated IRH Heat Layer
  useEffect(() => {
    const groupFocos = layerGroupsRef.current.focos;
    const groupCalor = layerGroupsRef.current.riesgoCalor;

    groupFocos.clearLayers();
    groupCalor.clearLayers();

    const layerCfg = layers.find((l) => l.id === 'layer_focos');
    const focosVisible = layerCfg ? layerCfg.visible : true;
    const opacity = layerCfg ? layerCfg.opacidad : 1;

    // Heat layer toggle
    const calorLayerCfg = layers.find((l) => l.id === 'layer_riesgo_calor');
    const calorVisible = mostrarRiesgoHidrico || (calorLayerCfg ? calorLayerCfg.visible : false);

    focos.forEach((foco) => {
      const isCritical = foco.irh >= 70;
      const isModerate = foco.irh >= 40 && foco.irh < 70;
      const color = isCritical ? '#dc2626' : isModerate ? '#d97706' : '#16a34a';

      // 1. Heat / Graduated IRH Buffer Circle
      if (calorVisible) {
        const radius = Math.max(120, (foco.volumenM3 / 2) + (foco.irh * 3.5));
        const circle = L.circle(foco.coordenadas, {
          radius: radius,
          color: color,
          fillColor: color,
          fillOpacity: isCritical ? 0.35 : 0.22,
          weight: 1.5,
          dashArray: '2, 4',
        });
        circle.bindTooltip(`Buffer IRH: ${foco.irh}/100 (${foco.id})`, { sticky: true });
        groupCalor.addLayer(circle);
      }

      // 2. Foco Marker Pin
      if (focosVisible) {
        const isSelected = selectedFoco?.id === foco.id;
        const size = tamanoPin(foco.tipo, isSelected);

        const pinHtml = construirPin(foco.tipo, { color, size, isSelected, isCritical, opacity });

        const customPin = L.divIcon({
          className: 'custom-foco-pin',
          html: pinHtml,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker(foco.coordenadas, { icon: customPin });

        // Popup with rich information and "Ver detalle" button
        const popupContent = document.createElement('div');
        popupContent.style.fontFamily = 'inherit';
        popupContent.style.padding = '12px 14px';
        popupContent.style.minWidth = '230px';
        popupContent.style.maxWidth = '280px';

        popupContent.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="color: #0f172a; font-size: 13px;">${foco.id}</strong>
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${color}20; color: ${color}; padding: 2px 6px; border-radius: 9999px;">
              ${foco.estado}
            </span>
          </div>

          <div style="font-size: 11px; color: #334155; line-height: 1.45;">
            ${chipTipoPopup(foco.tipo)}<p style="font-weight: 600; color: #0f172a; margin-bottom: 2px;">${foco.ubicacion}</p>
            <p style="color: #64748b; font-size: 10px; margin-bottom: 6px;">${foco.barrio}</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; margin: 6px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 11px;">
                <span><strong>IRH:</strong> ${foco.irh}/100</span>
                <span style="font-weight: 700; color: ${color};">${foco.nivelRiesgo}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 10px; color: #0284c7; margin-top: 3px;">
                <span><strong>Distancia al agua:</strong></span>
                <strong>${foco.distanciaCursoAgua} m</strong>
              </div>
            </div>

            <p style="font-size: 10px; color: #64748b;"><strong>Volumen est.:</strong> ${foco.volumenEstimado}</p>
          </div>

          <button id="btn-ver-detalle-${foco.id}" style="
            width: 100%;
            margin-top: 10px;
            padding: 6px 10px;
            background: #0060a9;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          ">
            <span>Ver Ficha Completa</span>
            <span>&rarr;</span>
          </button>
        `;

        // Wire popup click event safely without reloads
        marker.bindPopup(popupContent);
        marker.on('popupopen', () => {
          const btn = document.getElementById(`btn-ver-detalle-${foco.id}`);
          if (btn) {
            btn.onclick = (e) => {
              e.preventDefault();
              onSelectFoco(foco);
            };
          }
        });

        marker.on('click', () => {
          onSelectFoco(foco);
        });

        groupFocos.addLayer(marker);
      }
    });
  }, [focos, layers, mostrarRiesgoHidrico, selectedFoco, onSelectFoco]);

  // Handle Map Tools: Measuring Distance and Area
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const measuringGroup = layerGroupsRef.current.measuring;

    if (activeTool === 'none') {
      measuringGroup.clearLayers();
      setMeasurePoints([]);
      setMeasureResult(null);
      return;
    }

    const handleClickMap = (e: L.LeafletMouseEvent) => {
      if (activeTool === 'query_coords') {
        const { lat, lng } = e.latlng;
        L.popup()
          .setLatLng(e.latlng)
          .setContent(`
            <div style="font-family: inherit; padding: 8px; font-size: 11px;">
              <strong style="color: #0060a9; font-size: 12px; display: block; margin-bottom: 4px;">Coordenadas Geográficas</strong>
              <p><strong>Latitud:</strong> ${lat.toFixed(6)}° S</p>
              <p><strong>Longitud:</strong> ${lng.toFixed(6)}° O</p>
              <p style="font-size: 9px; color: #64748b; margin-top: 4px;">WGS84 • San Miguel de Tucumán</p>
            </div>
          `)
          .openOn(map);
        return;
      }

      if (activeTool === 'measure_distance') {
        const nextPoints = [...measurePoints, e.latlng];
        setMeasurePoints(nextPoints);

        measuringGroup.clearLayers();

        // Draw points markers
        nextPoints.forEach((pt, i) => {
          const ptMarker = L.circleMarker(pt, { radius: 5, color: '#0060a9', fillColor: '#fff', fillOpacity: 1 });
          measuringGroup.addLayer(ptMarker);
        });

        // Draw connecting polyline
        if (nextPoints.length > 1) {
          const line = L.polyline(nextPoints, { color: '#0060a9', weight: 3, dashArray: '5, 5' });
          measuringGroup.addLayer(line);

          // Calculate total distance
          let totalMeters = 0;
          for (let i = 1; i < nextPoints.length; i++) {
            totalMeters += nextPoints[i - 1].distanceTo(nextPoints[i]);
          }

          const formatted =
            totalMeters >= 1000
              ? `${(totalMeters / 1000).toFixed(2)} km`
              : `${Math.round(totalMeters)} metros`;
          setMeasureResult(`Distancia total: ${formatted}`);
        }
      }

      if (activeTool === 'measure_area') {
        const nextPoints = [...measurePoints, e.latlng];
        setMeasurePoints(nextPoints);

        measuringGroup.clearLayers();

        nextPoints.forEach((pt) => {
          measuringGroup.addLayer(L.circleMarker(pt, { radius: 5, color: '#16a34a', fillColor: '#fff', fillOpacity: 1 }));
        });

        if (nextPoints.length >= 3) {
          const polygon = L.polygon(nextPoints, { color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.25 });
          measuringGroup.addLayer(polygon);

          // Polygon area approximation
          // Using shoelace on approximate meters
          const origin = nextPoints[0];
          let area = 0;
          const coordsMeters = nextPoints.map((p) => {
            const y = (p.lat - origin.lat) * 111139;
            const x = (p.lng - origin.lng) * 111139 * Math.cos((origin.lat * Math.PI) / 180);
            return [x, y];
          });

          for (let i = 0; i < coordsMeters.length; i++) {
            const j = (i + 1) % coordsMeters.length;
            area += coordsMeters[i][0] * coordsMeters[j][1];
            area -= coordsMeters[j][0] * coordsMeters[i][1];
          }
          area = Math.abs(area) / 2;

          const formatted =
            area >= 10000
              ? `${(area / 10000).toFixed(2)} hectáreas (~${Math.round(area).toLocaleString()} m²)`
              : `${Math.round(area).toLocaleString()} m²`;
          setMeasureResult(`Superficie estimada: ${formatted}`);
        }
      }
    };

    map.on('click', handleClickMap);
    return () => {
      map.off('click', handleClickMap);
    };
  }, [activeTool, measurePoints]);

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden select-none bg-slate-100">
      {/* Real Interactive Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0 cursor-crosshair" />

      {/* Floating Top-Right Tools Bar */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
        {/* Base Map Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowBaseMapMenu(!showBaseMapMenu)}
            className="bg-white/95 hover:bg-white text-slate-800 font-semibold text-xs px-3 py-2 rounded-xl shadow-md border border-slate-200/90 backdrop-blur-md flex items-center gap-2 transition-all hover:scale-102 cursor-pointer"
            title="Cambiar mapa base"
          >
            <i className="fa-solid fa-map text-[#0060a9]"></i>
            <span className="hidden sm:inline">Mapa Base</span>
            <i className="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>
          </button>

          {showBaseMapMenu && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                Seleccionar Mapa Base
              </div>
              {Object.entries(BASE_MAP_URLS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => handleSelectBaseMap(key as BaseMapId)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                    activeBaseMap === key ? 'font-bold text-[#0060a9] bg-blue-50/60' : 'text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <i className={`fa-solid ${val.icon} text-slate-400`}></i>
                    {val.name}
                  </span>
                  {activeBaseMap === key && <i className="fa-solid fa-check text-[#0060a9] text-xs"></i>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GIS Action Tools Toolbar */}
        <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200/90 p-1 flex flex-col gap-1">
          <button
            onClick={() => {
              if (!mapRef.current) return;
              mapRef.current.zoomIn();
            }}
            className="w-8 h-8 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center text-xs transition-colors cursor-pointer"
            title="Acercar mapa (Zoom In)"
          >
            <i className="fa-solid fa-plus font-bold"></i>
          </button>
          <button
            onClick={() => {
              if (!mapRef.current) return;
              mapRef.current.zoomOut();
            }}
            className="w-8 h-8 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center text-xs transition-colors cursor-pointer"
            title="Alejar mapa (Zoom Out)"
          >
            <i className="fa-solid fa-minus font-bold"></i>
          </button>
          <div className="w-full h-px bg-slate-200 my-0.5"></div>
          <button
            onClick={handleResetExtent}
            className="w-8 h-8 rounded-lg text-slate-700 hover:text-[#0060a9] hover:bg-slate-100 flex items-center justify-center text-xs transition-colors cursor-pointer"
            title="Volver a la extensión inicial (San Miguel de Tucumán)"
          >
            <i className="fa-solid fa-house"></i>
          </button>
          <button
            onClick={() => {
              setActiveTool(activeTool === 'query_coords' ? 'none' : 'query_coords');
              setMeasureResult(null);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer ${
              activeTool === 'query_coords'
                ? 'bg-[#0060a9] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Obtener coordenadas de un punto (clic en mapa)"
          >
            <i className="fa-solid fa-location-crosshairs"></i>
          </button>
          <button
            onClick={() => {
              setActiveTool(activeTool === 'measure_distance' ? 'none' : 'measure_distance');
              setMeasurePoints([]);
              setMeasureResult(null);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer ${
              activeTool === 'measure_distance'
                ? 'bg-[#0060a9] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Medir distancia en línea"
          >
            <i className="fa-solid fa-ruler"></i>
          </button>
          <button
            onClick={() => {
              setActiveTool(activeTool === 'measure_area' ? 'none' : 'measure_area');
              setMeasurePoints([]);
              setMeasureResult(null);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer ${
              activeTool === 'measure_area'
                ? 'bg-[#0060a9] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Medir área y superficie poligonal"
          >
            <i className="fa-solid fa-draw-polygon"></i>
          </button>
          <div className="w-full h-px bg-slate-200 my-0.5"></div>
          <button
            onClick={() => setShowPrintModal(true)}
            className="w-8 h-8 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center text-xs transition-colors cursor-pointer"
            title="Imprimir / Exportar vista actual del Geoportal"
          >
            <i className="fa-solid fa-print"></i>
          </button>
        </div>
      </div>

      {/* Floating Active Measure Bar Indicator */}
      {activeTool !== 'none' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 px-4 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
            <span className="text-xs font-bold text-slate-800">
              {activeTool === 'measure_distance' && 'Medición de Distancia (Haz clic en el mapa para sumar puntos)'}
              {activeTool === 'measure_area' && 'Medición de Área (Haz clic para definir el polígono)'}
              {activeTool === 'query_coords' && 'Haz clic en cualquier punto para inspeccionar coordenadas'}
            </span>
          </div>

          {measureResult && (
            <span className="bg-blue-50 text-[#0060a9] font-extrabold text-xs px-2.5 py-1 rounded-lg border border-blue-200">
              {measureResult}
            </span>
          )}

          <button
            onClick={() => {
              setActiveTool('none');
              setMeasurePoints([]);
              setMeasureResult(null);
            }}
            className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded-md transition-colors cursor-pointer ml-1"
          >
            Finalizar
          </button>
        </div>
      )}

      {/* Bottom Coordinates & Scale Bar */}
      <div className="absolute bottom-2 right-2 z-20 bg-white/90 backdrop-blur-md rounded-lg shadow-sm border border-slate-200/90 px-3 py-1 text-[11px] text-slate-600 font-mono flex items-center gap-3">
        <span>
          <strong>Lat:</strong> {currentCoords.lat.toFixed(5)}° S
        </span>
        <span className="text-slate-300">|</span>
        <span>
          <strong>Lng:</strong> {currentCoords.lng.toFixed(5)}° O
        </span>
        <span className="text-slate-300 hidden sm:inline">|</span>
        <span className="hidden sm:inline">
          <strong>Zoom:</strong> {currentCoords.zoom}
        </span>
        <span className="text-slate-300 hidden md:inline">|</span>
        <span className="hidden md:inline text-slate-400">EPSG:4326 (WGS84)</span>
      </div>

      {/* Print / Export Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-file-export text-[#0060a9]"></i>
                <h3 className="font-bold text-sm text-slate-800">Exportar Vista de Mapa</h3>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Exporta la vista cartográfica actual de San Miguel de Tucumán con capas activas, coordenadas e indicadores del IRH.
            </p>

            <div className="space-y-2 text-xs">
              <button
                onClick={async () => {
                  if (!API_ENABLED) { window.print(); setShowPrintModal(false); return; }
                  try {
                    await descargarArchivo('/reportes/focos/?formato=pdf', 'reporte-gismat.pdf');
                    setShowPrintModal(false);
                  } catch (err) {
                    window.alert((err as Error).message);
                  }
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-[#0060a9] hover:bg-blue-800 text-white font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-print"></i>
                Descargar informe PDF
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
