import React, { useState, useRef, useEffect } from 'react';
import { ScreenId } from '../../types';
import { EnvironmentalAlert } from '../../types/geoportal';
import { SearchResultItem } from '../../services/geoportalService';

interface GeoportalHeaderProps {
  onNavigate: (screen: ScreenId) => void;
  alertas: EnvironmentalAlert[];
  onOpenAlertas: () => void;
  onOpenStats: () => void;
  onSearchSelect: (item: SearchResultItem) => void;
  mostrarRiesgoHidrico: boolean;
  onToggleRiesgoHidrico: () => void;
}

export const GeoportalHeader: React.FC<GeoportalHeaderProps> = ({
  onNavigate,
  alertas,
  onOpenAlertas,
  onOpenStats,
  onSearchSelect,
  mostrarRiesgoHidrico,
  onToggleRiesgoHidrico,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Alertas críticas count
  const alertasCriticas = alertas.filter((a) => a.nivel === 'critica').length;

  // Search autocomplete
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { geoportalService } = await import('../../services/geoportalService');
        const results = await geoportalService.buscarLugares(searchQuery);
        setSearchResults(results);
        setShowSearchDropdown(results.length > 0);
      } catch (err) {
        console.error('Error en búsqueda:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between z-30 shadow-xs select-none">
      {/* Brand & Module Identification */}
      <div className="flex items-center gap-3.5">
        {/* Interactive GISMAT Floating Emblem */}
        <div
          className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => onNavigate('GEOPORTAL')}
          title="GISMAT - Inicio Geoportal"
        >
          <div className="gismat-logo-float transition-transform duration-300 group-hover:scale-105 shrink-0">
            <svg className="w-8 h-9" fill="none" viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">
              <path d="M30 4C17 4 7 14 7 27C7 44 30 70 30 70C30 70 53 44 53 27C53 14 43 4 30 4Z" fill="#15803d" />
              <path d="M30 7C19 7 10 16 10 27C10 42 30 65 30 65C30 65 50 42 50 27C50 16 41 7 30 7Z" fill="#86efac" />
              <path d="M26 12C28 20 20 28 24 38C26 43 23 52 23 55" fill="none" stroke="#0284c7" strokeLinecap="round" strokeWidth="4.5" />
              <path d="M30 50C30 50 44 46 44 30C44 20 34 22 30 29C28 35 30 50 30 50Z" fill="#166534" />
              <path d="M31 30C36 34 40 40 40 40" stroke="#bbf7d0" strokeLinecap="round" strokeWidth="2" />
              <ellipse cx="30" cy="73" fill="none" rx="22" ry="4" stroke="#0369a1" strokeWidth="2.5" />
              <ellipse cx="30" cy="74" fill="none" rx="14" ry="2.5" stroke="#0284c7" strokeWidth="2" />
            </svg>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-[#0060a9]">GISMAT</span>
              <span className="bg-emerald-50 text-emerald-700 font-bold text-[11px] px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Geoportal
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
              Gestión y Monitoreo Ambiental Territorial • San Miguel de Tucumán
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

        {/* Navigation Tabs to Other GISMAT Modules */}
        <nav className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => onNavigate('GEOPORTAL')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-[#0060a9] border border-blue-200/80 shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-map-location-dot"></i>
            Geoportal
          </button>
          <button
            onClick={() => onNavigate('CUR_02_AI_DETECTIONS')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-satellite-dish"></i>
            Detecciones IA
          </button>
          <button
            onClick={() => onNavigate('CUR_03_HYDROLOGICAL_RISK')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-water"></i>
            Riesgo Hídrico
          </button>
          <button
            onClick={() => onNavigate('CUR_04_TRACEABILITY')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-route"></i>
            Trazabilidad
          </button>
        </nav>
      </div>

      {/* Center Search Bar with Predictive Autocomplete */}
      <div className="relative flex-1 max-w-md mx-3 sm:mx-6" ref={searchContainerRef}>
        <div className="relative flex items-center">
          <i className="fa-solid fa-magnifying-glass absolute left-3 text-slate-400 text-xs"></i>
          <input
            type="text"
            className="w-full bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-xs text-slate-800 placeholder-slate-400 rounded-xl pl-8 pr-8 py-2 border border-slate-200/90 focus:border-[#0060a9] focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all shadow-inner"
            placeholder="Buscar por ID de foco, dirección, microcuenca o río..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchDropdown(true);
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowSearchDropdown(false);
              }}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              title="Borrar búsqueda"
            >
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          )}
          {isSearching && (
            <div className="absolute right-3">
              <i className="fa-solid fa-circle-notch fa-spin text-xs text-[#0060a9]"></i>
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Resultados geoespaciales</span>
              <span>{searchResults.length} encontrados</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSearchSelect(item);
                    setShowSearchDropdown(false);
                    setSearchQuery(item.titulo);
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors flex items-start gap-2.5 group cursor-pointer"
                >
                  <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-[#0060a9] group-hover:text-white transition-colors shrink-0">
                    {item.categoria === 'foco' && <i className="fa-solid fa-trash-can text-xs"></i>}
                    {item.categoria === 'microcuenca' && <i className="fa-solid fa-water text-xs"></i>}
                    {item.categoria === 'curso' && <i className="fa-solid fa-droplet text-xs"></i>}
                    {item.categoria === 'direccion' && <i className="fa-solid fa-location-dot text-xs"></i>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-[#0060a9]">
                      {item.titulo}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{item.subtitulo}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Tools & User Info */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Toggle IRH Heat Map button */}
        <button
          onClick={onToggleRiesgoHidrico}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
            mostrarRiesgoHidrico
              ? 'bg-red-50 text-red-700 border-red-200 shadow-xs ring-2 ring-red-100'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
          }`}
          title="Activar visualización de simbología graduada de riesgo hídrico (IRH)"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              mostrarRiesgoHidrico ? 'bg-red-500 animate-ping' : 'bg-slate-400'
            }`}
          ></span>
          <span className="hidden sm:inline">Mostrar Riesgo Hídrico</span>
          <span className="sm:hidden">IRH</span>
        </button>

        {/* Statistics button */}
        <button
          onClick={onOpenStats}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 relative cursor-pointer"
          title="Ver indicadores y estadísticas ambientales"
        >
          <i className="fa-solid fa-chart-pie text-sm"></i>
        </button>

        {/* Notifications / Alerts button */}
        <button
          onClick={onOpenAlertas}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 relative cursor-pointer"
          title="Ver alertas de riesgo ambiental"
        >
          <i className="fa-solid fa-bell text-sm"></i>
          {alertas.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
              {alertas.length}
            </span>
          )}
        </button>

        {/* User profile menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl hover:bg-slate-100 border border-slate-200/80 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-[#0060a9] to-blue-700 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              KF
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-800 leading-tight">Lic. Kiyoshi Fortuna</span>
              <span className="text-[10px] text-slate-500 leading-tight">Medio Ambiente SMT</span>
            </div>
            <i className="fa-solid fa-chevron-down text-[10px] text-slate-400 hidden md:block"></i>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-800">Lic. Kiyoshi Fortuna</p>
                <p className="text-[11px] text-slate-500">kiyoshi.fortuna@smt.gob.ar</p>
                <span className="inline-block mt-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Rol: Administrador SIG / Cuadrillas
                </span>
              </div>

              <div className="py-1 text-xs text-slate-700">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onOpenStats();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <i className="fa-solid fa-chart-column text-slate-400 w-4"></i>
                  Panel de Estadísticas SMT
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigate('CUR_04_TRACEABILITY');
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <i className="fa-solid fa-clipboard-check text-slate-400 w-4"></i>
                  Panel de Trazabilidad
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onNavigate('CUR_01_AUTH');
                  }}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer mt-1 border-t border-slate-100"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket text-red-500 w-4"></i>
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
