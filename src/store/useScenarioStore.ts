import { create } from 'zustand';
import { useAppStore } from './useAppStore';
import { fetchThreats } from '../services/mapDataAccess';

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low' | 'safe';

export interface LocalityMetrics {
  population: string;
  sheltersNearby: string;
  healthFacilities: string;
  roadAccess: string;
}

export interface LocalityScoreBreakdown {
  hazardSeverity: number;
  exposedPopulation: number;
  assetExposure: number;
  shelterGap: number;
  vulnerability: number;
}

export interface Locality {
  id: string;
  name: string;
  score: number;
  severity: SeverityLevel;
  reason: string;
  metrics: LocalityMetrics;
  breakdown: LocalityScoreBreakdown;
  recommendedAction: string;
}

// ─── Live Event Interface from Backend ───
export interface LiveEvent {
  id: string;
  title: string;
  category: string;
  center: [number, number];
  impactRadius_km: number;
  bufferGeometry?: any;
  affectedDistricts: { name: string }[];
  nasaSource?: { id: string; url: string };
  verified: boolean;
  validationNote: string;
}

// ─── Static Baseline Data for Districts ───
const BASE_LOCALITIES: Locality[] = [
  {
    id: 'teknaf', name: 'Teknaf Sadar', score: 0, severity: 'safe', reason: '',
    metrics: { population: '12,400', sheltersNearby: '3', healthFacilities: '1 at risk', roadAccess: 'Disrupted' },
    breakdown: { hazardSeverity: 0, exposedPopulation: 85, assetExposure: 78, shelterGap: 60, vulnerability: 70 },
    recommendedAction: ''
  },
  {
    id: 'ukhiya', name: 'Ukhia', score: 0, severity: 'safe', reason: '',
    metrics: { population: '34,200', sheltersNearby: '5', healthFacilities: '2 at risk', roadAccess: 'High risk' },
    breakdown: { hazardSeverity: 0, exposedPopulation: 90, assetExposure: 65, shelterGap: 80, vulnerability: 60 },
    recommendedAction: ''
  },
  {
    id: 'moheshkhali', name: 'Moheshkhali', score: 0, severity: 'safe', reason: '',
    metrics: { population: '22,100', sheltersNearby: '4', healthFacilities: 'None nearby', roadAccess: 'Cut off likely' },
    breakdown: { hazardSeverity: 0, exposedPopulation: 60, assetExposure: 55, shelterGap: 90, vulnerability: 65 },
    recommendedAction: ''
  },
  {
    id: 'cox-sadar', name: "Cox's Bazar Sadar", score: 0, severity: 'safe', reason: '',
    metrics: { population: '150,000', sheltersNearby: '12', healthFacilities: 'Fully operational', roadAccess: 'Clear' },
    breakdown: { hazardSeverity: 0, exposedPopulation: 75, assetExposure: 80, shelterGap: 30, vulnerability: 25 },
    recommendedAction: ''
  },
  {
    id: 'kutubdia', name: 'Kutubdia', score: 0, severity: 'safe', reason: '',
    metrics: { population: '18,500', sheltersNearby: '2', healthFacilities: '1 operational', roadAccess: 'Ferry only' },
    breakdown: { hazardSeverity: 0, exposedPopulation: 45, assetExposure: 35, shelterGap: 50, vulnerability: 45 },
    recommendedAction: ''
  }
];

export interface ScenarioState {
  liveEvents: LiveEvent[];
  localities: Locality[];
  selectedLocalityId: string | null;
  isCalculating: boolean;
  lastRefreshTime: Date | null;
  
  fetchLiveThreats: () => Promise<void>;
  setSelectedLocalityId: (id: string | null) => void;
  recalculateImpact: () => void;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  liveEvents: [],
  localities: [...BASE_LOCALITIES],
  selectedLocalityId: null,
  isCalculating: false,
  lastRefreshTime: null,
  
  setSelectedLocalityId: (id) => set({ selectedLocalityId: id }),

  fetchLiveThreats: async () => {
    set({ isCalculating: true });
    try {
      const data = await fetchThreats();
      
      set({ 
        liveEvents: data.threats || [], 
        lastRefreshTime: new Date() 
      });
      // Recalculate district rankings based on live data
      try {
        get().recalculateImpact();
      } catch (calcErr) {
        console.error('recalculateImpact crashed:', calcErr);
      }
    } catch (err) {
      console.error('Failed to fetch live threats:', err);
    } finally {
      // Always clear the calculating flag so the map never stays frozen
      set({ isCalculating: false });
    }
  },

  recalculateImpact: () => {
    const { liveEvents } = get();
    
    const recalculated = BASE_LOCALITIES.map(loc => {
      // Find if this specific locality is affected by any live events
      const affectingEvents = liveEvents.filter(event => 
        event.affectedDistricts.some(d => d.name.toLowerCase().includes(loc.name.toLowerCase()))
      );

      // Base hazard severity based on the type of events impacting it
      let hazardSev = 0;
      let primaryThreat = '';

      if (affectingEvents.length > 0) {
        affectingEvents.forEach(evt => {
          if (evt.category === 'severeStorms') hazardSev += 90;
          else if (evt.category === 'floods') hazardSev += 70;
          else if (evt.category === 'wildfires') hazardSev += 85;
          else if (evt.category === 'landslides') hazardSev += 80;
          else hazardSev += 50; // generic
        });
        primaryThreat = affectingEvents[0].title;
        // Cap hazard at 100
        hazardSev = Math.min(100, hazardSev);
      }

      // Step 7 Fix: When no threats affect this locality, score should be 0 (Safe)
      // Only compute full weighted score when hazardSeverity > 0
      const breakdown = { ...loc.breakdown, hazardSeverity: Math.round(hazardSev) };
      let score: number;
      if (hazardSev === 0) {
        // No active threats → locality is safe
        score = 0;
      } else {
        score = Math.round(
          breakdown.hazardSeverity * 0.35 +
          breakdown.exposedPopulation * 0.25 +
          breakdown.assetExposure * 0.20 +
          breakdown.shelterGap * 0.10 +
          breakdown.vulnerability * 0.10
        );
      }

      // Determine Actionable Categorical Severity
      let severity: SeverityLevel = 'safe';
      if (score >= 80) severity = 'critical';
      else if (score >= 65) severity = 'high';
      else if (score >= 45) severity = 'moderate';
      else if (score >= 30) severity = 'low';

      // Smart Reason Generator — Step 8 Fix: const instead of let
      const reason = affectingEvents.length > 0 
        ? `Impacted by ${primaryThreat}` 
        : 'Outside current danger zones.';
      
      let recommendedAction = '';
      if (severity === 'critical') recommendedAction = 'Immediate evacuation advisory. Activate shelters.';
      else if (severity === 'high') recommendedAction = 'Prepare evacuation transports. Issue warnings.';
      else if (severity === 'moderate') recommendedAction = 'Standard monitoring. Clear urban drainage.';
      else recommendedAction = 'No immediate action required.';

      return {
        ...loc,
        score,
        severity,
        breakdown,
        reason,
        recommendedAction
      };
    }).sort((a, b) => b.score - a.score); // Highest severity first

    // Step 3 Fix: Sync communitySeverity to the highest active threat severity
    const severityRank: SeverityLevel[] = ['critical', 'high', 'moderate', 'low', 'safe'];
    const highestSeverity = recalculated.length > 0
      ? severityRank.find(s => recalculated.some(l => l.severity === s)) ?? 'safe'
      : 'safe';
    useAppStore.getState().setCommunitySeverity(highestSeverity);

    set({ localities: recalculated, isCalculating: false });
  }
}));
