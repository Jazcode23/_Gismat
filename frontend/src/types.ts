export type ScreenId =
  | 'CUR_01_AUTH'
  | 'CUR_02_AI_DETECTIONS'
  | 'CUR_04_TRACEABILITY'
  | 'CUR_03_HYDROLOGICAL_RISK'
  | 'CUR_04_P7_DASHBOARD'
  | 'GEOPORTAL';

export type TransitionType = 'none' | 'push' | 'push_back' | 'slide_up' | 'fade';

export interface NavigationState {
  currentScreen: ScreenId;
  previousScreen?: ScreenId;
  transitionType: TransitionType;
}
