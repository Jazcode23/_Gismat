import React, { useState, useEffect, useCallback } from 'react';
import { ScreenId } from '../../types';
import {
  FocoAmbiente,
  CursoAgua,
  Microcuenca,
  ZonaRiesgo,
  PuntoMonitoreo,
  BarrioSector,
  LayerConfig,
  GeoportalFilters,
  EnvironmentalAlert,
  GeoportalStats,
} from '../../types/geoportal';
import { geoportalService, SearchResultItem } from '../../services/geoportalService';
import { GeoportalHeader } from './GeoportalHeader';
import { GeoportalMap } from './GeoportalMap';
import { LayerControlPanel } from './LayerControlPanel';
import { FilterDrawer } from './FilterDrawer';
import { FocoDetailModal } from './FocoDetailModal';
import { MicrocuencaDetailModal } from './MicrocuencaDetailModal';
import { AlertsDrawer } from './AlertsDrawer';
import { StatsModal } from './StatsModal';

interface ScreenGeoportalProps {
  onNavigate: (screen: ScreenId) => void;
}

const DEFAULT_FILTERS: GeoportalFilters = {
  tipoFoco: 'todos',
  estado: 'todos',
  nivelRiesgo: 'todos',
  irhMin: 0,
  irhMax: 100,
  microcuenca: 'todas',
  proximidadMax: 0,
  searchQuery: '',
  soloAlertas: false,
};

export const ScreenGeoportal: React.FC<ScreenGeoportalProps> = ({ onNavigate }) => {
  // Spatial Data States
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [allFocos, setAllFocos] = useState<FocoAmbiente[]>([]);
  const [filteredFocos, setFilteredFocos] = useState<FocoAmbiente[]>([]);
  const [cursos, setCursos] = useState<CursoAgua[]>([]);
  const [microcuencas, setMicrocuencas] = useState<Microcuenca[]>([]);
  const [zonasRiesgo, setZonasRiesgo] = useState<ZonaRiesgo[]>([]);
  const [monitoreo, setMonitoreo] = useState<PuntoMonitoreo[]>([]);
  const [barrios, setBarrios] = useState<BarrioSector[]>([]);
  const [alertas, setAlertas] = useState<EnvironmentalAlert[]>([]);
  const [stats, setStats] = useState<GeoportalStats | null>(null);

  // UI Interactive States
  const [filters, setFilters] = useState<GeoportalFilters>(DEFAULT_FILTERS);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [mostrarRiesgoHidrico, setMostrarRiesgoHidrico] = useState(false);

  // Selected Entities for Modals
  const [selectedFoco, setSelectedFoco] = useState<FocoAmbiente | null>(null);
  const [selectedMicrocuenca, setSelectedMicrocuenca] = useState<Microcuenca | null>(null);
  const [centerTarget, setCenterTarget] = useState<{ coords: [number, number]; zoom?: number; focoId?: string } | null>(null);

  // Toast Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Initial Data Fetching from Service Layer
  useEffect(() => {
    const loadGeoportalData = async () => {
      try {
        const [
          capasData,
          focosData,
          cursosData,
          cuencasData,
          zonasData,
          monData,
          barriosData,
          alertasData,
          statsData,
        ] = await Promise.all([
          geoportalService.getCapas(),
          geoportalService.getFocos(),
          geoportalService.getCursosAgua(),
          geoportalService.getMicrocuencas(),
          geoportalService.getZonasRiesgo(),
          geoportalService.getPuntosMonitoreo(),
          geoportalService.getBarrios(),
          geoportalService.getAlertas(),
          geoportalService.getEstadisticas(),
        ]);

        setLayers(capasData);
        setAllFocos(focosData);
        setFilteredFocos(focosData);
        setCursos(cursosData);
        setMicrocuencas(cuencasData);
        setZonasRiesgo(zonasData);
        setMonitoreo(monData);
        setBarrios(barriosData);
        setAlertas(alertasData);
        setStats(statsData);
      } catch (err) {
        console.error('Error cargando datos del Geoportal:', err);
      }
    };

    loadGeoportalData();
  }, []);

  // Filter Focos when filters change
  useEffect(() => {
    let isMounted = true;
    const applyFilters = async () => {
      const results = await geoportalService.getFocos(filters);
      if (isMounted) {
        setFilteredFocos(results);
      }
    };

    applyFilters();
    return () => {
      isMounted = false;
    };
  }, [filters]);

  // Toggle Layer Visibility
  const handleToggleLayer = (layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  // Change Layer Opacity
  const handleChangeOpacity = (layerId: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, opacidad: opacity } : l))
    );
  };

  // Toggle IRH Heat Visualization
  const handleToggleRiesgoHidrico = () => {
    const next = !mostrarRiesgoHidrico;
    setMostrarRiesgoHidrico(next);
    showToast(
      next
        ? 'Simbología graduada de Riesgo Hídrico (IRH) activada'
        : 'Simbología graduada desactivada'
    );
  };

  // Search Item Selection Handler
  const handleSearchSelect = (item: SearchResultItem) => {
    setCenterTarget({ coords: item.coordenadas, zoom: 16 });

    if (item.categoria === 'foco') {
      const foco = allFocos.find((f) => f.id === item.id);
      if (foco) setSelectedFoco(foco);
    } else if (item.categoria === 'microcuenca') {
      const mc = microcuencas.find((c) => c.id === item.id);
      if (mc) setSelectedMicrocuenca(mc);
    }
  };

  // Crew Dispatch from Modal
  const handleAssignCrew = (foco: FocoAmbiente) => {
    setAllFocos((prev) =>
      prev.map((f) => (f.id === foco.id ? { ...f, estado: 'pendiente' } : f))
    );
    setFilteredFocos((prev) =>
      prev.map((f) => (f.id === foco.id ? { ...f, estado: 'pendiente' } : f))
    );
    showToast(`Cuadrilla municipal despachada para foco ${foco.id}`);
  };

  const handleSelectFoco = useCallback((foco: FocoAmbiente) => {
    setSelectedFoco(foco);
  }, []);

  const handleSelectMicrocuenca = useCallback((mc: Microcuenca) => {
    setSelectedMicrocuenca(mc);
  }, []);

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-100 text-slate-800">
      {/* 1. Header institucional */}
      <GeoportalHeader
        onNavigate={onNavigate}
        alertas={alertas}
        onOpenAlertas={() => setAlertsDrawerOpen(true)}
        onOpenStats={() => setStatsModalOpen(true)}
        onSearchSelect={handleSearchSelect}
        mostrarRiesgoHidrico={mostrarRiesgoHidrico}
        onToggleRiesgoHidrico={handleToggleRiesgoHidrico}
      />

      {/* 2. Main GIS Viewport Container */}
      <div className="relative flex-1 w-full h-[calc(100vh-64px)] overflow-hidden">
        {/* Leaflet Interactive Map */}
        <GeoportalMap
          focos={filteredFocos}
          cursos={cursos}
          microcuencas={microcuencas}
          zonasRiesgo={zonasRiesgo}
          monitoreo={monitoreo}
          barrios={barrios}
          layers={layers}
          mostrarRiesgoHidrico={mostrarRiesgoHidrico}
          selectedFoco={selectedFoco}
          onSelectFoco={handleSelectFoco}
          onSelectMicrocuenca={handleSelectMicrocuenca}
          centerTarget={centerTarget}
        />

        {/* Layer Control Panel & Dynamic Legend */}
        <LayerControlPanel
          layers={layers}
          onToggleLayer={handleToggleLayer}
          onChangeOpacity={handleChangeOpacity}
          isOpen={layersPanelOpen}
          onToggleOpen={() => setLayersPanelOpen(!layersPanelOpen)}
          mostrarRiesgoHidrico={mostrarRiesgoHidrico}
        />

        {/* Floating Bottom Filter Trigger Button */}
        <div className="absolute bottom-5 left-4 z-20 flex items-center gap-2">
          <button
            onClick={() => setFilterDrawerOpen(true)}
            className={`px-3.5 py-2 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 transition-all hover:scale-102 cursor-pointer ${
              filters.tipoFoco !== 'todos' ||
              filters.estado !== 'todos' ||
              filters.nivelRiesgo !== 'todos' ||
              filters.irhMin > 0 ||
              filters.microcuenca !== 'todas' ||
              filters.proximidadMax > 0 ||
              filters.soloAlertas
                ? 'bg-[#0060a9] text-white border-[#0060a9]'
                : 'bg-white/95 text-slate-800 border-slate-200/90 hover:bg-white'
            }`}
            title="Abrir panel de filtros espaciales"
          >
            <i className="fa-solid fa-filter"></i>
            <span>Filtros Espaciales</span>
            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
              {filteredFocos.length}/{allFocos.length}
            </span>
          </button>
        </div>

        {/* Interactive Toast Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2 rounded-xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <i className="fa-solid fa-circle-check text-emerald-400"></i>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* 3. Filter Drawer */}
      <FilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onChangeFilters={setFilters}
        onResetFilters={() => {
          setFilters(DEFAULT_FILTERS);
          showToast('Filtros restablecidos a valores por defecto');
        }}
        microcuencas={microcuencas}
        totalFiltered={filteredFocos.length}
        totalAvailable={allFocos.length}
      />

      {/* 4. Unified Technical Foco Modal */}
      <FocoDetailModal
        isOpen={!!selectedFoco}
        onClose={() => setSelectedFoco(null)}
        foco={selectedFoco}
        onCenterInMap={(f) => {
          setCenterTarget({ coords: f.coordenadas, zoom: 16 });
          showToast(`Mapa centrado en foco ${f.id}`);
        }}
        onAssignCrew={handleAssignCrew}
      />

      {/* 5. Unified Microcuenca Detail Modal */}
      <MicrocuencaDetailModal
        isOpen={!!selectedMicrocuenca}
        onClose={() => setSelectedMicrocuenca(null)}
        microcuenca={selectedMicrocuenca}
        onFilterByThisCuenca={(cuencaId) => {
          setFilters({ ...filters, microcuenca: cuencaId });
          showToast('Filtro aplicado por microcuenca seleccionada');
        }}
      />

      {/* 6. Environmental Alerts Drawer */}
      <AlertsDrawer
        isOpen={alertsDrawerOpen}
        onClose={() => setAlertsDrawerOpen(false)}
        alertas={alertas}
        onSelectAlertaFoco={(focoId, coords) => {
          if (coords) {
            setCenterTarget({ coords, zoom: 16 });
          }
          if (focoId) {
            const f = allFocos.find((item) => item.id === focoId);
            if (f) setSelectedFoco(f);
          }
        }}
      />

      {/* 7. Municipal Environmental Stats Modal */}
      {stats && (
        <StatsModal
          isOpen={statsModalOpen}
          onClose={() => setStatsModalOpen(false)}
          stats={stats}
          focos={allFocos}
        />
      )}
    </div>
  );
};
