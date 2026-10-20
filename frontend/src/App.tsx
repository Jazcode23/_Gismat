import { useState } from 'react';
import { ScreenId, TransitionType, NavigationState } from './types';
import { ScreenAuth } from './components/ScreenAuth';
import { ScreenAIDetections } from './components/ScreenAIDetections';
import { ScreenTraceability } from './components/ScreenTraceability';
import { ScreenHydrologicalRisk } from './components/ScreenHydrologicalRisk';
import { ScreenEnvironmentalDashboard } from './components/ScreenEnvironmentalDashboard';
import { ScreenGeoportal } from './components/geoportal/ScreenGeoportal';

export default function App() {
  const [navState, setNavState] = useState<NavigationState>({
    currentScreen: 'CUR_01_AUTH',
    transitionType: 'none',
  });

  const navigateTo = (screen: ScreenId, transition: TransitionType = 'none') => {
    setNavState({
      currentScreen: screen,
      previousScreen: navState.currentScreen,
      transitionType: transition,
    });
  };

  // Compute CSS transition animation class based on transitionType
  const getAnimationClass = () => {
    switch (navState.transitionType) {
      case 'slide_up':
        return 'animate-in fade-in slide-in-from-bottom duration-300';
      case 'push':
        return 'animate-in fade-in slide-in-from-right duration-250';
      case 'push_back':
        return 'animate-in fade-in slide-in-from-left duration-250';
      case 'fade':
        return 'animate-in fade-in duration-200';
      case 'none':
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-slate-100 overflow-x-hidden">
      <div className={`min-h-screen w-full ${getAnimationClass()}`}>
        {/* Screen 1: CUR 01 - Acceso y Autenticación */}
        {navState.currentScreen === 'CUR_01_AUTH' && (
          <ScreenAuth onLoginSuccess={() => navigateTo('CUR_02_AI_DETECTIONS', 'push')} />
        )}

        {/* Screen 2: CUR 02 - Detecciones IA Satelital */}
        {navState.currentScreen === 'CUR_02_AI_DETECTIONS' && (
          <ScreenAIDetections onNavigate={navigateTo} />
        )}

        {/* Screen 3: CUR 04 - Panel de Trazabilidad */}
        {navState.currentScreen === 'CUR_04_TRACEABILITY' && (
          <ScreenTraceability onNavigate={navigateTo} />
        )}

        {/* Screen 4: CUR 03 - Riesgo Hídrico y Cuadrillas */}
        {navState.currentScreen === 'CUR_03_HYDROLOGICAL_RISK' && (
          <ScreenHydrologicalRisk onNavigate={navigateTo} />
        )}

        {/* Screen 5: CUR 04 - P7 - Dashboard de Gestión Ambiental */}
        {navState.currentScreen === 'CUR_04_P7_DASHBOARD' && (
          <ScreenEnvironmentalDashboard onNavigate={navigateTo} />
        )}

        {/* Screen 6: Módulo Geoportal Municipal San Miguel de Tucumán */}
        {navState.currentScreen === 'GEOPORTAL' && (
          <ScreenGeoportal onNavigate={navigateTo} />
        )}
      </div>
    </div>
  );
}
