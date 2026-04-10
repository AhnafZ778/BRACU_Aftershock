import { create } from 'zustand';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * v4 5-State Escalation Protocol
 * CLEAR → ADVISORY → WATCH → WARNING → CRITICAL
 *
 * Transitions follow monotonic escalation within a single event:
 * - Forward transitions are automatic based on EventHazard thresholds
 * - Backward transitions only happen via explicit de-escalation (post-event)
 * - Each state can be "acknowledged" to silence buzzers without changing level
 */
export type EscalationState = 'CLEAR' | 'ADVISORY' | 'WATCH' | 'WARNING' | 'CRITICAL';

/** Backward-compatible alias */
export type ZoneStatus = EscalationState | 'SAFE' | 'STANDBY';

export interface ZoneTimelineStep {
  timestamp?: string;
  iso_time?: string;
  hour_offset: number;
  phase: string;
  step_index?: number;
  impact_active?: boolean;
  storm_center?: [number, number];
  storm_wind_kt?: number;
  storm_pres_hpa?: number;
  storm_heading_deg?: number;
  storm_dist2land_km?: number;
  // Legacy zone-level support
  zones?: {
    zone: string;
    level: number;
    wind_kmh: number;
    rain_mm: number;
    flood_risk: number;
    landslide_risk: number;
    stations_total: number;
    stations_offline: number;
  }[];
  // v4 locality impacts (directly from replay JSON)
  locality_impacts?: Record<string, LocalityImpact>;
  // Backward-compat: processed localities array
  localities?: ProcessedLocality[];
  // ML predictions (from enhanced simulation engine)
  ml_predictions?: {
    lstm_pressure_hpa: number;
    lstm_wind_kt: number;
    blended_pressure_hpa: number;
    blended_wind_kt: number;
    confidence: number;
    model_version: string;
    blend_alpha: number;
    forecast_steps: number[];
    forecast_wind_kt: number[];
  };
}

/** Raw per-locality impact from v4 replay JSON */
export interface LocalityImpact {
  dynamic_boost: number;
  wind_pulse: number;
  surge_pulse: number;
  flood_pulse: number;
  event_hazard?: number;
  combined_hazard?: number;
  live_dzi?: number;
  exposure?: number;
  vulnerability?: number;
  coast_factor?: number;
  baseline_hazard?: number;
  dist_to_eye_km: number;
  local_wind_kt: number;
}

/** Processed locality for UI consumption */
export interface ProcessedLocality {
  name: string;
  district: string;
  severity: string;
  escalation: EscalationState;
  distance_to_eye_km: number;
  wind_max_kmh: number;
  rain_mm: number;
  surge_m: number;
  risk_index: number;
  event_hazard: number;
  live_dzi: number;
  smoothed_hazard: number;
  metrics: LocalityImpact;
}

/** Cached escalation state at a given step — used to avoid replaying from 0 */
interface EscalationSnapshot {
  zoneStatuses: Record<number | string, EscalationState>;
  acknowledged: Record<number | string, boolean>;
  buzzerActive: Record<number | string, boolean>;
  smoothedHazards: Record<string, number>;
}

export interface SimulationState {
  // Timeline
  isLoaded: boolean;
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  timeline: ZoneTimelineStep[];
  eventName: string;
  modelVersion: string;

  // Zone Statuses (v4: 5-state escalation)
  zoneStatuses: Record<number | string, EscalationState>;
  acknowledged: Record<number | string, boolean>;
  buzzerActive: Record<number | string, boolean>;
  // Backward compat
  pendingApprovals: Record<number | string, boolean>;

  // Per-locality EMA smoothed hazard state
  smoothedHazards: Record<string, number>;

  // Actions
  loadTimeline: (data: any) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setStep: (step: number) => void;
  tick: () => void;
  approveZone: (level: number | string) => void;
  acknowledgeZone: (level: number | string) => void;
  silenceBuzzer: (level: number | string) => void;

  // Realtime visuals sync
  activeZones: { critical: any[]; warning: any[] };
  setActiveZones: (zones: { critical: any[]; warning: any[] }) => void;
  allHoneycombZones: any[];
  setAllHoneycombZones: (zones: any[]) => void;
  /** P4: Batch-set both zone arrays in a single store update to avoid double re-render */
  setBatchedZones: (activeZones: { critical: any[]; warning: any[] }, allZones: any[]) => void;
}

/* ------------------------------------------------------------------ */
/*  v4 Escalation Thresholds (EventHazard-based)                       */
/* ------------------------------------------------------------------ */
const ESCALATION_THRESHOLDS: { state: EscalationState; minHazard: number }[] = [
  { state: 'CRITICAL', minHazard: 0.70 },
  { state: 'WARNING',  minHazard: 0.45 },
  { state: 'WATCH',    minHazard: 0.25 },
  { state: 'ADVISORY', minHazard: 0.10 },
  { state: 'CLEAR',    minHazard: 0.00 },
];

/** Escalation state ordering for monotonic forward comparison */
const STATE_ORDER: Record<EscalationState, number> = {
  'CLEAR': 0,
  'ADVISORY': 1,
  'WATCH': 2,
  'WARNING': 3,
  'CRITICAL': 4,
};

function escalationFromHazard(hazard: number): EscalationState {
  for (const t of ESCALATION_THRESHOLDS) {
    if (hazard >= t.minHazard) return t.state;
  }
  return 'CLEAR';
}

/** Monotonic forward: can only escalate UP, never down during an event */
function forwardEscalate(current: EscalationState, proposed: EscalationState): EscalationState {
  return STATE_ORDER[proposed] > STATE_ORDER[current] ? proposed : current;
}

/* ------------------------------------------------------------------ */
/*  EMA Temporal Smoothing                                             */
/* ------------------------------------------------------------------ */
const EMA_ALPHA = 0.82; // Faster cyclone responsiveness: 82% new value, 18% old

function emaSmooth(prev: number, current: number): number {
  return EMA_ALPHA * current + (1 - EMA_ALPHA) * prev;
}

/* ------------------------------------------------------------------ */
/*  Escalation computation per step                                    */
/* ------------------------------------------------------------------ */
function computeEscalationV4(
  currentStatuses: Record<number | string, EscalationState>,
  currentAcknowledged: Record<number | string, boolean>,
  currentBuzzers: Record<number | string, boolean>,
  prevSmoothed: Record<string, number>,
  stepData: ZoneTimelineStep,
): {
  zoneStatuses: Record<number | string, EscalationState>;
  acknowledged: Record<number | string, boolean>;
  buzzerActive: Record<number | string, boolean>;
  smoothedHazards: Record<string, number>;
  processedLocalities: ProcessedLocality[];
  liveCounts: { critical: number; warning: number };
} {
  const statuses = { ...currentStatuses };
  const acked = { ...currentAcknowledged };
  const buzzers = { ...currentBuzzers };
  const smoothed = { ...prevSmoothed };
  const processedLocalities: ProcessedLocality[] = [];

  let liveCriticalCount = 0;
  let liveWarningCount = 0;

  // v4: Process locality_impacts from replay JSON
  if (stepData.locality_impacts) {
    for (const [code, impact] of Object.entries(stepData.locality_impacts)) {
      const eventHazard = impact.event_hazard ?? impact.dynamic_boost ?? 0;
      const liveDzi = impact.live_dzi ?? 0;

      // EMA smooth the hazard (prevents jitter between steps)
      const prevH = smoothed[code] ?? 0;
      const smoothedH = emaSmooth(prevH, eventHazard);
      smoothed[code] = smoothedH;

      // Determine escalation state from smoothed hazard
      const proposedState = escalationFromHazard(smoothedH);

      if (proposedState === 'CRITICAL') liveCriticalCount++;
      else if (proposedState === 'WARNING') liveWarningCount++;

      // Monotonic forward escalation per-locality
      const currentLocState = (statuses[code] as EscalationState) || 'CLEAR';
      const newState = forwardEscalate(currentLocState, proposedState);

      if (STATE_ORDER[newState] > STATE_ORDER[currentLocState]) {
        statuses[code] = newState;
        // New escalation → buzzer rings, needs acknowledgment
        if (newState === 'WARNING' || newState === 'CRITICAL') {
          buzzers[code] = true;
          acked[code] = false;
        }
      }

      const wind_kmh = Math.round((impact.local_wind_kt || 0) * 1.852);

      processedLocalities.push({
        name: code,
        district: code,
        severity: newState === 'CRITICAL' ? 'CRITICAL'
          : newState === 'WARNING' ? 'DANGER'
          : newState === 'WATCH' ? 'WARNING'
          : newState === 'ADVISORY' ? 'WARNING'
          : 'NORMAL',
        escalation: newState,
        distance_to_eye_km: impact.dist_to_eye_km,
        wind_max_kmh: wind_kmh,
        rain_mm: 0,
        surge_m: impact.surge_pulse ?? 0,
        risk_index: smoothedH,
        event_hazard: eventHazard,
        live_dzi: liveDzi,
        smoothed_hazard: smoothedH,
        metrics: impact,
      });
    }
  }

  // Legacy zone-level escalation (backward compat with v3)
  if (stepData.zones) {
    for (const zoneData of stepData.zones) {
      const level = zoneData.level;
      const windSpeed = zoneData.wind_kmh;
      const currentStatus = statuses[level] || 'CLEAR';

      if (windSpeed >= 120) {
        statuses[level] = forwardEscalate(currentStatus as EscalationState, 'CRITICAL');
        buzzers[level] = true;
        acked[level] = false;
      } else if (windSpeed >= 80) {
        statuses[level] = forwardEscalate(currentStatus as EscalationState, 'WARNING');
        buzzers[level] = true;
        acked[level] = false;
      } else if (windSpeed >= 40) {
        statuses[level] = forwardEscalate(currentStatus as EscalationState, 'WATCH');
      } else if (windSpeed >= 20) {
        statuses[level] = forwardEscalate(currentStatus as EscalationState, 'ADVISORY');
      }
    }
  }

  // Also handle v3-style pre-processed localities
  if (stepData.localities && !stepData.locality_impacts) {
    for (const loc of stepData.localities) {
      const district = loc.district;
      const currentStatus = (statuses[district] as EscalationState) || 'CLEAR';

      let proposed: EscalationState = 'CLEAR';
      const sev = (loc as any).severity;
      if (sev === 'CRITICAL') proposed = 'CRITICAL';
      else if (sev === 'DANGER') proposed = 'WARNING';
      else if (sev === 'WARNING') proposed = 'WATCH';

      const newState = forwardEscalate(currentStatus, proposed);
      if (STATE_ORDER[newState] > STATE_ORDER[currentStatus]) {
        statuses[district] = newState;
        if (newState === 'WARNING' || newState === 'CRITICAL') {
          buzzers[district] = true;
          acked[district] = false;
        }
      }
    }
  }

  return {
    zoneStatuses: statuses,
    acknowledged: acked,
    buzzerActive: buzzers,
    smoothedHazards: smoothed,
    processedLocalities,
    liveCounts: { critical: liveCriticalCount, warning: liveWarningCount }
  };
}

/* ------------------------------------------------------------------ */
/*  Default state factory                                              */
/* ------------------------------------------------------------------ */
function defaultZoneStatuses(): Record<number, EscalationState> {
  return { 1: 'CLEAR', 2: 'CLEAR', 3: 'CLEAR', 4: 'CLEAR', 5: 'CLEAR' };
}

function defaultBoolRecord(): Record<number, boolean> {
  return { 1: false, 2: false, 3: false, 4: false, 5: false };
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */
// P0: Snapshot cache lives outside React state to avoid triggering renders on cache writes.
let escalationSnapshotCache = new Map<number, EscalationSnapshot>();

export const useSimulationStore = create<SimulationState>((set, get) => ({
  isLoaded: false,
  isPlaying: false,
  currentStep: 0,
  totalSteps: 0,
  timeline: [],
  eventName: '',
  modelVersion: 'v4',

  zoneStatuses: defaultZoneStatuses(),
  acknowledged: defaultBoolRecord(),
  buzzerActive: defaultBoolRecord(),
  pendingApprovals: defaultBoolRecord(),

  smoothedHazards: {},

  activeZones: { critical: [], warning: [] },
  setActiveZones: (zones) => set({ activeZones: zones }),
  allHoneycombZones: [],
  setAllHoneycombZones: (zones) => set({ allHoneycombZones: zones }),
  setBatchedZones: (activeZones, allZones) => set({ activeZones, allHoneycombZones: allZones }),

  loadTimeline: (data) => {
    const isV4 = data.version === 'v4' || data.metadata?.model_version === 'v4';

    const timeline = (data.timeline || []).map((step: any) => {
      // v4 format: locality_impacts already contain event_hazard, live_dzi etc.
      // No cumulative-max needed — the engine handles decaying storage.
      if (isV4 && step.locality_impacts) {
        return {
          ...step,
          timestamp: step.iso_time,
        } as ZoneTimelineStep;
      }

      // v3 backward compat: convert locality_impacts to localities array
      // WITHOUT cumulative-max (v4 principle: let data flow through as-is)
      let localities = step.localities;
      if (!localities && step.locality_impacts) {
        localities = Object.entries(step.locality_impacts).map(([code, impact]: [string, any]) => {
          const boost = impact.dynamic_boost || 0;
          const wind = Math.round((impact.local_wind_kt || 0) * 1.852);

          let severity = 'NORMAL';
          if (boost > 0.7) severity = 'CRITICAL';
          else if (boost > 0.4) severity = 'DANGER';
          else if (boost > 0.15) severity = 'WARNING';

          return {
            name: code,
            district: code,
            severity,
            distance_to_eye_km: impact.dist_to_eye_km,
            wind_max_kmh: wind,
            rain_mm: 0,
            surge_m: impact.surge_pulse ?? 0,
            risk_index: boost,
            metrics: impact,
          };
        });
      }

      return {
        ...step,
        timestamp: step.iso_time,
        localities,
      } as ZoneTimelineStep;
    });

    // P0: Clear snapshot cache on new timeline load
    escalationSnapshotCache = new Map<number, EscalationSnapshot>();

    set({
      isLoaded: true,
      timeline,
      totalSteps: timeline.length,
      eventName: data.event_name || 'Cyclone Simulation',
      modelVersion: isV4 ? 'v4' : 'v3',
      currentStep: 0,
      isPlaying: false,
      zoneStatuses: defaultZoneStatuses(),
      acknowledged: defaultBoolRecord(),
      buzzerActive: defaultBoolRecord(),
      pendingApprovals: defaultBoolRecord(),
      smoothedHazards: {},
      activeZones: { critical: [], warning: [] },
      allHoneycombZones: [],
    });
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  reset: () => {
    // P0: Clear snapshot cache on reset
    escalationSnapshotCache = new Map<number, EscalationSnapshot>();
    set({
      currentStep: 0,
      isPlaying: false,
      zoneStatuses: defaultZoneStatuses(),
      acknowledged: defaultBoolRecord(),
      buzzerActive: defaultBoolRecord(),
      pendingApprovals: defaultBoolRecord(),
      smoothedHazards: {},
      activeZones: { critical: [], warning: [] },
      allHoneycombZones: [],
    });
  },

  setStep: (step) => {
    const state = get();
    if (step < 0 || step >= state.totalSteps) return;

    // P0: Find the nearest cached snapshot at or before the target step
    let replayFrom = 0;
    let statuses: Record<number | string, EscalationState> = defaultZoneStatuses();
    let acked: Record<number | string, boolean> = defaultBoolRecord();
    let buzzers: Record<number | string, boolean> = defaultBoolRecord();
    let smoothed: Record<string, number> = {};

    // Search backward from target for the closest cached snapshot
    for (let probe = step; probe >= 0; probe--) {
      const cached = escalationSnapshotCache.get(probe);
      if (cached) {
        statuses = { ...cached.zoneStatuses };
        acked = { ...cached.acknowledged };
        buzzers = { ...cached.buzzerActive };
        smoothed = { ...cached.smoothedHazards };
        replayFrom = probe + 1; // Start replaying from the step AFTER the cached one
        break;
      }
    }

    // Replay only the remaining steps (often 0 steps if cache hits exactly)
    for (let i = replayFrom; i <= step; i++) {
      const result = computeEscalationV4(
        statuses, acked, buzzers, smoothed, state.timeline[i],
      );
      statuses = result.zoneStatuses;
      acked = result.acknowledged;
      buzzers = result.buzzerActive;
      smoothed = result.smoothedHazards;
    }

    // P0: Cache this snapshot for future seeks
    escalationSnapshotCache.set(step, {
      zoneStatuses: { ...statuses },
      acknowledged: { ...acked },
      buzzerActive: { ...buzzers },
      smoothedHazards: { ...smoothed },
    });

    set({
      currentStep: step,
      zoneStatuses: statuses,
      acknowledged: acked,
      buzzerActive: buzzers,
      pendingApprovals: Object.fromEntries(
        Object.entries(statuses).map(([k, v]) => [k, v === 'WATCH']),
      ),
      smoothedHazards: smoothed,
    });
  },

  tick: () => {
    const state = get();
    if (!state.isPlaying) return;
    if (state.currentStep >= state.totalSteps - 1) {
      set({ isPlaying: false });
      return;
    }

    const nextStep = state.currentStep + 1;
    const stepData = state.timeline[nextStep];

    const result = computeEscalationV4(
      state.zoneStatuses,
      state.acknowledged,
      state.buzzerActive,
      state.smoothedHazards,
      stepData,
    );

    // P0: Cache the snapshot at each tick for fast future seeks
    escalationSnapshotCache.set(nextStep, {
      zoneStatuses: { ...result.zoneStatuses },
      acknowledged: { ...result.acknowledged },
      buzzerActive: { ...result.buzzerActive },
      smoothedHazards: { ...result.smoothedHazards },
    });

    set({
      currentStep: nextStep,
      zoneStatuses: result.zoneStatuses,
      acknowledged: result.acknowledged,
      buzzerActive: result.buzzerActive,
      pendingApprovals: Object.fromEntries(
        Object.entries(result.zoneStatuses).map(([k, v]) => [k, v === 'WATCH']),
      ),
      smoothedHazards: result.smoothedHazards,
    });
  },

  /** Backward-compat: approve = acknowledge + escalate to CRITICAL */
  approveZone: (level) => {
    const state = get();
    const current = state.zoneStatuses[level] as EscalationState;
    if (current !== 'WATCH' && current !== 'WARNING') return;

    const statuses = { ...state.zoneStatuses };
    const buzzers = { ...state.buzzerActive };
    const acked = { ...state.acknowledged };

    statuses[level] = 'CRITICAL';
    buzzers[level] = true;
    acked[level] = false;

    // Cascade: next zone → ADVISORY
    if (typeof level === 'number') {
      const nextLevel = level + 1;
      if (nextLevel <= 5 && STATE_ORDER[(statuses[nextLevel] as EscalationState) || 'CLEAR'] < STATE_ORDER['ADVISORY']) {
        statuses[nextLevel] = 'ADVISORY';
      }
    }

    set({
      zoneStatuses: statuses,
      buzzerActive: buzzers,
      acknowledged: acked,
      pendingApprovals: Object.fromEntries(
        Object.entries(statuses).map(([k, v]) => [k, v === 'WATCH']),
      ),
    });
  },

  /** Acknowledge an escalation: silences buzzer, marks as acked */
  acknowledgeZone: (level) => {
    const state = get();
    const acked = { ...state.acknowledged };
    const buzzers = { ...state.buzzerActive };
    acked[level] = true;
    buzzers[level] = false;
    set({ acknowledged: acked, buzzerActive: buzzers });
  },

  /** Silence buzzer only (doesn't mark as acknowledged) */
  silenceBuzzer: (level) => {
    const state = get();
    const buzzers = { ...state.buzzerActive };
    buzzers[level] = false;
    set({ buzzerActive: buzzers });
  },
}));
