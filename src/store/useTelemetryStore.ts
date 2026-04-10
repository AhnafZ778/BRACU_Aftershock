import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Agent {
  id: string;
  lat: number;
  lng: number;
  battery: number;
  status: 'ok' | 'distress' | 'relay';
}

export interface MeshLink {
  source: string;
  target: string;
  rssi: number;
  distance_km: number;
}

export interface RescueZone {
  id: string;
  center: [number, number];
  severity: string;
  agent_count: number;
  avg_battery?: number;
  radius_km?: number;
  priority_score?: number;
  confidence?: number;
  recommended_action?: string;
  member_agent_ids?: string[];
  geometry: any;
}

export interface DistressSignal {
  agent_id: string;
  lat: number;
  lng: number;
  battery?: number;
  timestamp: number;
}

export interface VolunteerSOS {
  event_id: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
  volunteer: {
    id: string;
    name: string;
    assigned_station: string;
  };
  current_assignment: {
    task_id: string;
    description: string;
    status: string;
  };
  sos_details: {
    type: string;
    code: string;
    severity_level: string;
  };
  telemetry: {
    coordinates: { latitude: number; longitude: number };
    location_accuracy_meters: number;
    battery_level: number;
    network_mode: string;
  };
}

export interface NotifiedStation {
  id: number;
  lat: number;
  lng: number;
  distance_km: number;
}

export interface ProximityInfo {
  radius_km: number;
  stations_notified: number;
  total_stations: number;
  volunteer_coords: { lat: number; lng: number };
  notified_station_ids?: number[];
  notified_stations?: NotifiedStation[];
}

export interface BroadcastedAlert {
  alert: VolunteerSOS;
  proximity: ProximityInfo;
}

export interface StationResponse {
  station_id: number;
  station_name: string;
  response_type: 'acknowledged' | 'dispatching' | 'need_backup' | 'unable' | 'central_alert';
  message: string;
  timestamp: string;
  admin_team_name?: string;
  chief_name?: string;
  chief_id?: string;
  station_capacity?: number;
  sos_type?: string;
  event_id_ref?: string;
  target_zone?: string;
  target_volunteers?: string[];
}

const DEFAULT_COORDS = { latitude: 23.685, longitude: 90.3563 };
const DEFAULT_PROXIMITY: ProximityInfo = {
  radius_km: 80,
  stations_notified: 0,
  total_stations: 0,
  volunteer_coords: { lat: 0, lng: 0 },
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  return null;
};

const toStringOr = (value: unknown, fallback: string): string => {
  return typeof value === 'string' ? value : fallback;
};

const toFiniteNumberOr = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeVolunteerSOS = (value: unknown, fallbackId: string): VolunteerSOS | null => {
  const record = asRecord(value);
  if (!record) return null;

  const volunteer = asRecord(record.volunteer);
  const assignment = asRecord(record.current_assignment);
  const details = asRecord(record.sos_details);
  const telemetry = asRecord(record.telemetry);
  const coords = asRecord(telemetry?.coordinates);

  const eventId = toStringOr(record.event_id, fallbackId);
  if (!eventId) return null;

  const statusRaw = toStringOr(record.status, 'approved');
  const status: VolunteerSOS['status'] =
    statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected'
      ? statusRaw
      : 'approved';

  return {
    event_id: eventId,
    timestamp: toStringOr(record.timestamp, new Date().toISOString()),
    status,
    volunteer: {
      id: toStringOr(volunteer?.id, eventId),
      name: toStringOr(volunteer?.name, 'Unknown Volunteer'),
      assigned_station: toStringOr(volunteer?.assigned_station, 'Unassigned'),
    },
    current_assignment: {
      task_id: toStringOr(assignment?.task_id, 'n/a'),
      description: toStringOr(assignment?.description, 'No assignment available'),
      status: toStringOr(assignment?.status, 'pending'),
    },
    sos_details: {
      type: toStringOr(details?.type, 'General SOS'),
      code: toStringOr(details?.code, 'SOS'),
      severity_level: toStringOr(details?.severity_level, 'Moderate'),
    },
    telemetry: {
      coordinates: {
        latitude: toFiniteNumberOr(coords?.latitude, DEFAULT_COORDS.latitude),
        longitude: toFiniteNumberOr(coords?.longitude, DEFAULT_COORDS.longitude),
      },
      location_accuracy_meters: toFiniteNumberOr(telemetry?.location_accuracy_meters, 0),
      battery_level: toFiniteNumberOr(telemetry?.battery_level, 0),
      network_mode: toStringOr(telemetry?.network_mode, 'unknown'),
    },
  };
};

const normalizeProximity = (value: unknown): ProximityInfo => {
  const record = asRecord(value);
  const coords = asRecord(record?.volunteer_coords);

  if (!record) return DEFAULT_PROXIMITY;

  return {
    radius_km: toFiniteNumberOr(record.radius_km, DEFAULT_PROXIMITY.radius_km),
    stations_notified: toFiniteNumberOr(record.stations_notified, DEFAULT_PROXIMITY.stations_notified),
    total_stations: toFiniteNumberOr(record.total_stations, DEFAULT_PROXIMITY.total_stations),
    volunteer_coords: {
      lat: toFiniteNumberOr(coords?.lat, DEFAULT_PROXIMITY.volunteer_coords.lat),
      lng: toFiniteNumberOr(coords?.lng, DEFAULT_PROXIMITY.volunteer_coords.lng),
    },
  };
};

const normalizeBroadcastedAlert = (value: unknown, index: number): BroadcastedAlert | null => {
  const record = asRecord(value);
  if (!record) return null;

  const nestedAlert = asRecord(record.alert);
  const alert = normalizeVolunteerSOS(nestedAlert ?? record, `legacy-${index}`);
  if (!alert) return null;

  return {
    alert,
    proximity: normalizeProximity(record.proximity),
  };
};

const normalizeBroadcastedAlerts = (value: unknown): BroadcastedAlert[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeBroadcastedAlert(item, index))
    .filter((item): item is BroadcastedAlert => item !== null);
};

const normalizeSosQueue = (value: unknown): VolunteerSOS[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeVolunteerSOS(item, `queue-${index}`))
    .filter((item): item is VolunteerSOS => item !== null);
};

const normalizeStationResponses = (value: unknown): Record<string, StationResponse[]> => {
  const record = asRecord(value);
  if (!record) return {};

  const normalized: Record<string, StationResponse[]> = {};
  for (const [eventId, responses] of Object.entries(record)) {
    if (!Array.isArray(responses)) continue;
    normalized[eventId] = responses.filter((r): r is StationResponse => {
      const response = asRecord(r);
      return response !== null && typeof response.station_id === 'number' && typeof response.timestamp === 'string';
    });
  }

  return normalized;
};

interface TelemetryState {
  agents: Agent[];
  links: MeshLink[];
  zones: RescueZone[];
  distressSignals: DistressSignal[];
  
  // SOS Queue System
  sosQueue: VolunteerSOS[];
  broadcastedAlerts: BroadcastedAlert[];
  stationResponses: Record<string, StationResponse[]>;  // event_id → responses
  sosStatus: { event_id: string | null, status: 'idle' | 'queued' | 'approved' | 'rejected', stations_notified?: number };
  selectedSosId: string | null;
  selectedHotspotId: string | null;
  lastUpdate: number;
  
  setTelemetry: (data: { agents?: Agent[], mesh_links?: MeshLink[], rescue_zones?: RescueZone[], distress_signals?: DistressSignal[] }) => void;
  setSosQueue: (queue: VolunteerSOS[], broadcasted: VolunteerSOS[]) => void;
  removeSosFromQueue: (eventId: string) => void;
  setSosStatus: (eventId: string | null, status: 'idle' | 'queued' | 'approved' | 'rejected', stations_notified?: number) => void;
  setSelectedSosId: (eventId: string | null) => void;
  setSelectedHotspotId: (zoneId: string | null) => void;
  addBroadcastedAlert: (alert: VolunteerSOS, proximity: ProximityInfo) => void;
  addStationResponse: (eventId: string, response: StationResponse) => void;
}

export const useTelemetryStore = create<TelemetryState>()(
  persist(
    (set) => ({
      agents: [],
      links: [],
      zones: [],
      distressSignals: [],
      sosQueue: [],
      broadcastedAlerts: [],
      stationResponses: {},
      sosStatus: { event_id: null, status: 'idle' },
      selectedSosId: null,
      selectedHotspotId: null,
      lastUpdate: Date.now(),

      setTelemetry: (data) => set((state) => ({
        agents: data.agents || state.agents,
        links: data.mesh_links || state.links,
        zones: data.rescue_zones || state.zones,
        distressSignals: data.distress_signals || state.distressSignals,
        lastUpdate: Date.now()
      })),

      setSosQueue: (queue, broadcasted) => set({
        sosQueue: normalizeSosQueue(queue),
        broadcastedAlerts: normalizeBroadcastedAlerts(broadcasted),
      }),
      
      removeSosFromQueue: (eventId) => set((state) => ({
        sosQueue: state.sosQueue.filter(s => s.event_id !== eventId)
      })),

      setSosStatus: (eventId, status, stations_notified) => set({
        sosStatus: { event_id: eventId, status, stations_notified }
      }),

      setSelectedSosId: (eventId) => set({
        selectedSosId: eventId
      }),

      setSelectedHotspotId: (zoneId) => set({
        selectedHotspotId: zoneId
      }),

      addBroadcastedAlert: (alert, proximity) => set((state) => {
        const normalized = normalizeBroadcastedAlert({ alert, proximity }, 0);
        if (!normalized) return state;

        return {
          broadcastedAlerts: [
            normalized,
            ...state.broadcastedAlerts.filter((a) => a.alert.event_id !== normalized.alert.event_id),
          ].slice(0, 20)
        };
      }),

      addStationResponse: (eventId, response) => set((state) => {
        const existing = state.stationResponses[eventId] || [];
        // De-duplicate by station_id and timestamp
        const isDuplicate = existing.some(r => r.station_id === response.station_id && r.timestamp === response.timestamp);
        if (isDuplicate) return state;
        
        return {
          stationResponses: {
            ...state.stationResponses,
            [eventId]: [...existing, response]
          }
        };
      }),
    }),
    {
      name: 'resilience-telemetry-storage',
      merge: (persistedState, currentState) => {
        const persisted = asRecord(persistedState);
        if (!persisted) return currentState;

        return {
          ...currentState,
          ...persisted,
          sosQueue: normalizeSosQueue(persisted.sosQueue),
          broadcastedAlerts: normalizeBroadcastedAlerts(persisted.broadcastedAlerts),
          stationResponses: normalizeStationResponses(persisted.stationResponses),
        } as TelemetryState;
      },
      partialize: (state) => ({
        stationResponses: state.stationResponses,
        sosStatus: state.sosStatus,
        sosQueue: state.sosQueue,
        broadcastedAlerts: state.broadcastedAlerts,
      }),
    }
  )
);

