import { create } from 'zustand';
import { getApiBaseUrl } from '../config/api';

// ─── Type Definitions ────────────────────────────────────────────────────────

export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'no-signal';
export type AlertSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
export type AlertType =
  | 'cyclone'
  | 'flood'
  | 'landslide'
  | 'storm'
  | 'tsunami'
  | 'test'
  | 'allclear';

export interface GPSLocation {
  lat: number;
  lng: number;
  accuracy_m: number;
  satellites: number;
  altitude_m: number;
  hdop: number;
}

export interface LoRaSignal {
  rssi: number;          // dBm, e.g. -87
  snr: number;           // dB,  e.g. 7.5
  frequency_mhz: number; // e.g. 868.1
  spreading_factor: number; // SF7–SF12
  bandwidth_khz: number; // 125 | 250 | 500
  coding_rate: string;   // e.g. '4/5'
}

export interface LoRaDevice {
  device_id: string;
  name: string;
  online: boolean;
  location: GPSLocation;
  signal: LoRaSignal;
  battery_pct: number;
  uptime_s: number;
  packets_received: number;
  packets_sent: number;
  last_seen: string; // ISO
}

export interface LoRaAlert {
  id: string;
  timestamp: string; // ISO
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  title_bn: string;
  message: string;
  message_bn: string;
  area: string;
  area_bn: string;
  transmitted: boolean;
  active: boolean;
}

export interface TransmissionEntry {
  id: string;
  timestamp: string; // ISO
  direction: 'uplink' | 'downlink';
  payload: string;
  rssi: number;
  snr: number;
  frequency: number;
}

// ─── Helper Utilities ────────────────────────────────────────────────────────

export function getSignalQuality(rssi: number): SignalQuality {
  if (rssi >= -70) return 'excellent';
  if (rssi >= -85) return 'good';
  if (rssi >= -100) return 'fair';
  if (rssi >= -110) return 'poor';
  return 'no-signal';
}

export function getSignalBars(rssi: number): number {
  if (rssi >= -70) return 5;
  if (rssi >= -80) return 4;
  if (rssi >= -90) return 3;
  if (rssi >= -100) return 2;
  if (rssi >= -110) return 1;
  return 0;
}

export function getSignalColor(quality: SignalQuality): string {
  switch (quality) {
    case 'excellent': return '#22c55e';
    case 'good':      return '#14b8a6';
    case 'fair':      return '#d97706';
    case 'poor':      return '#ea580c';
    default:          return '#dc2626';
  }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function getAlertIcon(type: AlertType): string {
  switch (type) {
    case 'cyclone':   return '🌀';
    case 'flood':     return '🌊';
    case 'landslide': return '⛰️';
    case 'storm':     return '⚡';
    case 'tsunami':   return '🌊';
    case 'test':      return '📡';
    case 'allclear':  return '✅';
    default:          return '⚠️';
  }
}

export function getSeverityColors(severity: AlertSeverity): {
  bg: string;
  border: string;
  text: string;
  badge: string;
} {
  switch (severity) {
    case 'critical':
      return { bg: 'bg-red-950/60', border: 'border-red-500/40', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' };
    case 'high':
      return { bg: 'bg-orange-950/60', border: 'border-orange-500/40', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' };
    case 'moderate':
      return { bg: 'bg-amber-950/60', border: 'border-amber-500/40', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' };
    case 'low':
      return { bg: 'bg-green-950/40', border: 'border-green-500/30', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300' };
    default:
      return { bg: 'bg-slate-800/60', border: 'border-slate-600/40', text: 'text-slate-400', badge: 'bg-slate-700/50 text-slate-300' };
  }
}

// ─── Fallback / Demo Data ────────────────────────────────────────────────────

function rand(min: number, max: number, decimals = 0): number {
  const v = Math.random() * (max - min) + min;
  return decimals > 0 ? parseFloat(v.toFixed(decimals)) : Math.floor(v);
}

export function generateFallbackDevice(): LoRaDevice {
  const rssi = rand(-110, -96);
  return {
    device_id: 'RAK4631-BD-001',
    name: 'Teknaf Warning Station Alpha',
    online: false,
    location: {
      lat: parseFloat((21.8628 + (Math.random() - 0.5) * 0.0001).toFixed(6)),
      lng: parseFloat((92.3081 + (Math.random() - 0.5) * 0.0001).toFixed(6)),
      accuracy_m: rand(3, 8),
      satellites: rand(7, 12),
      altitude_m: rand(8, 14, 1),
      hdop: rand(0.8, 1.6, 2),
    },
    signal: {
      rssi,
      snr: rand(0, 4, 1),
      frequency_mhz: 868.1,
      spreading_factor: 9,
      bandwidth_khz: 125,
      coding_rate: '4/5',
    },
    battery_pct: rand(55, 72, 1),
    uptime_s: 86400 * 3 + 14400 + rand(0, 3600),
    packets_received: 1247 + rand(0, 10),
    packets_sent: 892 + rand(0, 7),
    last_seen: new Date().toISOString(),
  };
}

const UPLINK_PAYLOADS = [
  'HEARTBEAT OK',
  'GPS_FIX:21.8628,92.3081,8SAT',
  'BAT:82.3%',
  'RSSI:-87dBm SNR:+7.5dB',
  'PKT_RX:1247 TX:892',
  'TEMP:28.5C HUM:74%',
  'UPLINK:STATUS_REPORT',
  'GPS_FIX:21.8629,92.3082,9SAT',
  'BAT:82.1%',
  'ALIVE:STATION_ALPHA',
];

const DOWNLINK_PAYLOADS = [
  'CMD:PING',
  'CMD:STATUS_REQUEST',
  'ALT_SEND:CYCLONE_WARN_001',
  'CMD:GPS_REFRESH',
  'CMD:BAT_CHECK',
  'ACK:PKT_1247',
];

export function generateFallbackLog(): TransmissionEntry[] {
  const entries: TransmissionEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < 25; i++) {
    const isUplink = i % 3 !== 1;
    entries.push({
      id: `PKT-${1247 - i}`,
      timestamp: new Date(now - i * 15000).toISOString(),
      direction: isUplink ? 'uplink' : 'downlink',
      payload: isUplink
        ? UPLINK_PAYLOADS[i % UPLINK_PAYLOADS.length]
        : DOWNLINK_PAYLOADS[i % DOWNLINK_PAYLOADS.length],
      rssi: rand(-105, -72),
      snr: rand(3, 12, 1),
      frequency: 868.1,
    });
  }
  return entries;
}

export const DEMO_ALERTS: LoRaAlert[] = [
  {
    id: 'ALT-BC9A1',
    timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
    type: 'cyclone',
    severity: 'critical',
    title: 'Severe Cyclone Warning',
    title_bn: 'তীব্র ঘূর্ণিঝড় সতর্কতা',
    message:
      "Category 4 cyclone approaching Cox's Bazar coast. Immediate evacuation of all low-lying coastal areas required. Move to nearest cyclone shelter without delay.",
    message_bn:
      'কক্সবাজার উপকূলে ক্যাটাগরি ৪ ঘূর্ণিঝড় আসছে। সমস্ত নিচু উপকূলীয় এলাকা থেকে অবিলম্বে সরে যান। বিলম্ব না করে নিকটতম আশ্রয়কেন্দ্রে যান।',
    area: "Cox's Bazar District — Teknaf, Ukhia, Moheshkhali",
    area_bn: 'কক্সবাজার জেলা — টেকনাফ, উখিয়া, মহেশখালী',
    transmitted: true,
    active: true,
  },
  {
    id: 'ALT-D32F8',
    timestamp: new Date(Date.now() - 7200 * 1000).toISOString(),
    type: 'storm',
    severity: 'high',
    title: 'Storm Surge Alert',
    title_bn: 'জলোচ্ছ্বাস সতর্কতা',
    message:
      'Storm surge of 4–6 metres expected along the coastline. Fishing boats must return to port immediately. Do not enter coastal waters.',
    message_bn:
      'উপকূলীয় এলাকায় ৪–৬ মিটার জলোচ্ছ্বাস প্রত্যাশিত। মাছ ধরার নৌকাগুলো অবিলম্বে বন্দরে ফিরুন। উপকূলীয় জলে প্রবেশ করবেন না।',
    area: 'Coastal Zone — Teknaf to Cox\'s Bazar',
    area_bn: 'উপকূলীয় অঞ্চল — টেকনাফ থেকে কক্সবাজার',
    transmitted: true,
    active: true,
  },
  {
    id: 'ALT-A10C3',
    timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    type: 'flood',
    severity: 'moderate',
    title: 'Flash Flood Advisory',
    title_bn: 'আকস্মিক বন্যা পরামর্শ',
    message:
      'Heavy upstream rainfall detected. Flash flooding possible in low-lying areas of Sylhet and Sunamganj. Stay alert and avoid flood-prone zones.',
    message_bn:
      'উজানে ভারী বৃষ্টিপাত শনাক্ত হয়েছে। সিলেট ও সুনামগঞ্জের নিচু এলাকায় আকস্মিক বন্যার সম্ভাবনা। সতর্ক থাকুন এবং বন্যাপ্রবণ এলাকা এড়িয়ে চলুন।',
    area: 'Sylhet Division — Sylhet, Sunamganj',
    area_bn: 'সিলেট বিভাগ — সিলেট, সুনামগঞ্জ',
    transmitted: true,
    active: false,
  },
  {
    id: 'ALT-E99B7',
    timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    type: 'test',
    severity: 'info',
    title: 'System Test Transmission',
    title_bn: 'সিস্টেম পরীক্ষা প্রেরণ',
    message:
      'Scheduled system health check. All LoRa nodes responsive. Network operating within normal parameters.',
    message_bn:
      'নির্ধারিত সিস্টেম স্বাস্থ্য পরীক্ষা। সমস্ত LoRa নোড সাড়া দিচ্ছে। নেটওয়ার্ক স্বাভাবিক মাত্রার মধ্যে কাজ করছে।',
    area: 'All Zones',
    area_bn: 'সমস্ত অঞ্চল',
    transmitted: true,
    active: false,
  },
];

// ─── Store Interface ─────────────────────────────────────────────────────────

interface LoRaState {
  device: LoRaDevice | null;
  alerts: LoRaAlert[];
  transmissionLog: TransmissionEntry[];
  isPolling: boolean;
  pollError: string | null;
  lastPoll: Date | null;
  _intervalId: number | null;

  fetchDeviceStatus: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchTransmissionLog: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  refreshAll: () => Promise<void>;
}

const API_BASE = getApiBaseUrl();

// ─── Store ───────────────────────────────────────────────────────────────────

export const useLoRaStore = create<LoRaState>((set, get) => ({
  device: null,
  alerts: [],
  transmissionLog: [],
  isPolling: false,
  pollError: null,
  lastPoll: null,
  _intervalId: null,

  // ── Fetch device status + GPS ──────────────────────────────────────────────
  fetchDeviceStatus: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lora/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LoRaDevice = await res.json();
      set({ device: data, pollError: null, lastPoll: new Date() });
    } catch {
      set((state) => ({
        pollError: 'Backend offline — displaying simulated device data.',
        lastPoll: new Date(),
        // If we have no device yet, seed with fallback so UI is never blank
        device: state.device
          ? {
              ...state.device,
              online: false,
              signal: {
                ...state.device.signal,
                rssi: rand(-110, -96),
                snr: rand(0, 4, 1),
              },
            }
          : generateFallbackDevice(),
      }));
      // Still tick the simulated device on every poll
      set((state) => {
        if (!state.device) return {};
        const rssi = rand(-105, -72);
        return {
          device: {
            ...state.device,
            signal: {
              ...state.device.signal,
              rssi,
              snr: rand(3, 12, 1),
            },
            location: {
              ...state.device.location,
              lat: parseFloat(
                (state.device.location.lat + (Math.random() - 0.5) * 0.00006).toFixed(6)
              ),
              lng: parseFloat(
                (state.device.location.lng + (Math.random() - 0.5) * 0.00006).toFixed(6)
              ),
              satellites: rand(7, 12),
              accuracy_m: rand(3, 8),
            },
            packets_received: state.device.packets_received + rand(0, 3),
            packets_sent: state.device.packets_sent + rand(0, 2),
            uptime_s: state.device.uptime_s + 8,
            battery_pct: parseFloat(
              Math.max(15, state.device.battery_pct - 0.002).toFixed(1)
            ),
            last_seen: new Date().toISOString(),
          },
        };
      });
    }
  },

  // ── Fetch admin-broadcast alerts ───────────────────────────────────────────
  fetchAlerts: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lora/alerts`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ alerts: data.alerts ?? [] });
    } catch {
      set((state) => ({
        alerts: state.alerts.length > 0 ? state.alerts : DEMO_ALERTS,
      }));
    }
  },

  // ── Fetch transmission log ─────────────────────────────────────────────────
  fetchTransmissionLog: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/lora/log`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ transmissionLog: data.entries ?? [] });
    } catch {
      set((state) => ({
        transmissionLog:
          state.transmissionLog.length > 0 ? state.transmissionLog : generateFallbackLog(),
      }));
      // Append a simulated uplink entry on each tick so log feels live
      set((state) => {
        const prev = state.transmissionLog;
        if (prev.length === 0) return {};
        const newEntry: TransmissionEntry = {
          id: `PKT-${parseInt(prev[0].id.split('-')[1]) + 1}`,
          timestamp: new Date().toISOString(),
          direction: 'uplink',
          payload: UPLINK_PAYLOADS[Math.floor(Math.random() * UPLINK_PAYLOADS.length)],
          rssi: rand(-105, -72),
          snr: rand(3, 12, 1),
          frequency: 868.1,
        };
        return { transmissionLog: [newEntry, ...prev].slice(0, 50) };
      });
    }
  },

  // ── Refresh all three data sources ────────────────────────────────────────
  refreshAll: async () => {
    const { fetchDeviceStatus, fetchAlerts, fetchTransmissionLog } = get();
    await Promise.allSettled([fetchDeviceStatus(), fetchAlerts(), fetchTransmissionLog()]);
  },

  // ── Start auto-polling every 8 s ──────────────────────────────────────────
  startPolling: () => {
    const { refreshAll, _intervalId } = get();
    // Guard against double-start
    if (_intervalId !== null) return;

    // Immediate first fetch
    refreshAll();

    const id = window.setInterval(() => {
      get().refreshAll();
    }, 8000);

    set({ isPolling: true, _intervalId: id });
  },

  // ── Stop auto-polling ─────────────────────────────────────────────────────
  stopPolling: () => {
    const { _intervalId } = get();
    if (_intervalId !== null) {
      clearInterval(_intervalId);
    }
    set({ isPolling: false, _intervalId: null });
  },
}));
