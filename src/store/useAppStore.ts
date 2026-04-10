import { create } from 'zustand';

export type AppMode = 'operations' | 'community';
export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low' | 'safe';
export type CycloneVisMode = 'full' | 'reduced' | 'off';

interface AppState {
  /* Mode */
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  /* Scenario */
  activeScenarioId: string;
  setActiveScenario: (id: string) => void;

  /* Locality */
  selectedLocalityId: string | null;
  setSelectedLocality: (id: string | null) => void;

  /* Community alert severity — drives safe vs danger view */
  communitySeverity: SeverityLevel;
  setCommunitySeverity: (level: SeverityLevel) => void;

  /* Focus Mode - controls the world mask filter on the map */
  isFocusMode: boolean;
  setFocusMode: (focus: boolean) => void;

  /* Toggle Features */
  showPrecipitation: boolean;
  setShowPrecipitation: (val: boolean) => void;
  showClouds: boolean;
  setShowClouds: (val: boolean) => void;
  showDangerZones: boolean;
  setShowDangerZones: (val: boolean) => void;

  /* Infrastructure Layers */
  showSchools: boolean;
  setShowSchools: (val: boolean) => void;
  showHealth: boolean;
  setShowHealth: (val: boolean) => void;
  showShelters: boolean;
  setShowShelters: (val: boolean) => void;
  showReligiousPlaces: boolean;
  setShowReligiousPlaces: (val: boolean) => void;
  showRoads: boolean;
  setShowRoads: (val: boolean) => void;
  showAllRoads: boolean;
  setShowAllRoads: (val: boolean) => void;
  showHoneycomb: boolean;
  setShowHoneycomb: (val: boolean) => void;
  showControlStations: boolean;
  setShowControlStations: (val: boolean) => void;
  showCopilotForecastLayer: boolean;
  setShowCopilotForecastLayer: (val: boolean) => void;
  showWarningGapLayer: boolean;
  setShowWarningGapLayer: (val: boolean) => void;

  /* Telemetry Layer */
  showTelemetry: boolean;
  setShowTelemetry: (val: boolean) => void;

  /* Routing Mode */
  showRouting: boolean;
  setShowRouting: (val: boolean) => void;

  /* Cyclone Visualization Mode */
  cycloneVisMode: CycloneVisMode;
  setCycloneVisMode: (mode: CycloneVisMode) => void;

  /* Map Style */
  mapStyle: 'dark' | 'satellite' | 'street' | 'light';
  setMapStyle: (style: 'dark' | 'satellite' | 'street' | 'light') => void;

  /* LoRa Specific Layers & Compact Access */
  layers: {
    nodes: boolean;
    range: boolean;
    infrastructure: boolean;
    schools: boolean;
    health: boolean;
    shelters: boolean;
    religious: boolean;
    roads: boolean;
    evacuation: boolean;
    households: boolean;
    cyclone: boolean;
    copilotForecast: boolean;
    warningGap: boolean;
  };
  toggleLayer: (layer: keyof AppState['layers']) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'operations',
  setMode: (mode) => set({ mode }),

  activeScenarioId: 'default',
  setActiveScenario: (id) => set({ activeScenarioId: id }),

  selectedLocalityId: null,
  setSelectedLocality: (id) => set({ selectedLocalityId: id }),

  communitySeverity: 'safe',
  setCommunitySeverity: (level) => set({ communitySeverity: level }),

  isFocusMode: true,
  setFocusMode: (focus) => set({ isFocusMode: focus }),

  showPrecipitation: false,
  setShowPrecipitation: (val) => set({ showPrecipitation: val }),

  showClouds: false,
  setShowClouds: (val) => set({ showClouds: val }),

  showDangerZones: true,
  setShowDangerZones: (val) => set({ showDangerZones: val }),

  showSchools: false,
  setShowSchools: (val) => set({ showSchools: val }),

  showHealth: false,
  setShowHealth: (val) => set({ showHealth: val }),

  showShelters: false,
  setShowShelters: (val) => set({ showShelters: val }),

  showReligiousPlaces: false,
  setShowReligiousPlaces: (val) => set({ showReligiousPlaces: val }),

  showRoads: false,
  setShowRoads: (val) => set({ showRoads: val, ...(val ? { showAllRoads: false } : {}) }),

  showAllRoads: true,
  setShowAllRoads: (val) => set({ showAllRoads: val, ...(val ? { showRoads: false } : {}) }),

  showHoneycomb: false,
  setShowHoneycomb: (val) => set({ showHoneycomb: val }),

  showControlStations: false,
  setShowControlStations: (val) => set({ showControlStations: val }),

  showCopilotForecastLayer: true,
  setShowCopilotForecastLayer: (val) => set({ showCopilotForecastLayer: val }),

  showWarningGapLayer: false,
  setShowWarningGapLayer: (val) => set({ showWarningGapLayer: val }),

  showTelemetry: true,
  setShowTelemetry: (val) => set({ showTelemetry: val }),

  showRouting: false,
  setShowRouting: (val) => set({ showRouting: val }),

  cycloneVisMode: 'reduced',
  setCycloneVisMode: (mode) => set({ cycloneVisMode: mode }),

  mapStyle: 'dark',
  setMapStyle: (style) => set({ mapStyle: style }),

  layers: {
    nodes: true,
    range: true,
    infrastructure: false,
    schools: false,
    health: false,
    shelters: false,
    religious: false,
    roads: false,
    evacuation: false,
    households: false,
    cyclone: true,
    copilotForecast: true,
    warningGap: false,
  },

  toggleLayer: (layer) => set((state) => {
    const newVal = !state.layers[layer];
    const update: any = {
      layers: { ...state.layers, [layer]: newVal }
    };

    // Reflect to flat properties for MapView compatibility
    if (layer === 'schools')    update.showSchools = newVal;
    if (layer === 'health')     update.showHealth = newVal;
    if (layer === 'shelters')   update.showShelters = newVal;
    if (layer === 'religious')  update.showReligiousPlaces = newVal;
    if (layer === 'roads')      update.showRoads = newVal;
    if (layer === 'evacuation') update.showRouting = newVal;
    if (layer === 'infrastructure') update.showControlStations = newVal;
    if (layer === 'copilotForecast') update.showCopilotForecastLayer = newVal;
    if (layer === 'warningGap') update.showWarningGapLayer = newVal;

    return update;
  }),
}));
