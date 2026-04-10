import { create } from 'zustand';
import { getApiBaseUrl } from '../config/api';
import { webSerial } from '../services/webSerialService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SerialPort {
  device: string;
  description: string;
  hwid: string;
}

export interface PresetCode {
  code: string;
  label: string;
  default_msg: string;
}

export interface RegionOption {
  id: string;
  label: string;
  dialect: string;
  dialect_label: string;
}

export interface DivisionOption {
  id: string;
  label: string;
  districts: RegionOption[];
}

export interface DialectTranslation {
  dialect: string;
  dialect_label: string;
  native_text: Record<string, string> | string | null;
  all_keywords: Record<string, Record<string, string>>;
}

export type LogLevel = 'transmit' | 'ack' | 'rx' | 'info' | 'error' | 'system';

export interface HardwareLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'ack' | 'rx' | 'system';
  text: string;
  level: LogLevel;
  msg_id?: string;
  node_id?: string;
  msg_type?: string;
  extra?: string;
}

export interface HardwareStatus {
  connected: boolean;
  port: string | null;
  baud: number;
  packets_sent: number;
  last_ack: string | null;
  last_ack_ts: string | null;
  serial_lib: boolean;
}

/** Which serial channel is active */
export type SerialMode = 'backend' | 'webserial';

// ─────────────────────────────────────────────────────────────────────────────
// Store state interface
// ─────────────────────────────────────────────────────────────────────────────

interface HardwareStore {
  // Serial mode
  serialMode: SerialMode;
  webSerialSupported: boolean;
  webSerialPortSelected: boolean;
  webSerialPortLabel: string | null;

  // Connection state
  status: HardwareStatus | null;
  ports: SerialPort[];
  presets: PresetCode[];
  regions: RegionOption[];
  divisions: DivisionOption[];
  isConnecting: boolean;
  isDisconnecting: boolean;
  isTransmitting: boolean;

  // UI state
  selectedPort: string;
  selectedBaud: number;
  selectedNodeId: string;
  selectedMsgType: string;
  selectedRegion: string;
  selectedDivision: string;
  activeZoneDistrictName: string;
  customPayload: string;

  // Dialect translation
  currentTranslation: DialectTranslation | null;
  isTranslating: boolean;

  // Transmission log
  log: HardwareLogEntry[];
  lastMsgId: string | null;

  // Errors
  error: string | null;

  // Actions
  detectSerialMode: () => Promise<void>;
  setSerialMode: (mode: SerialMode) => void;
  requestWebSerialPort: () => Promise<void>;
  fetchPorts: () => Promise<void>;
  fetchPresets: () => Promise<void>;
  fetchRegions: () => Promise<void>;
  fetchDivisions: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchLog: () => Promise<void>;
  fetchTranslation: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  transmit: () => Promise<void>;

  // UI setters
  setSelectedPort: (port: string) => void;
  setSelectedBaud: (baud: number) => void;
  setSelectedNodeId: (id: string) => void;
  setSelectedMsgType: (type: string) => void;
  setSelectedRegion: (region: string) => void;
  setSelectedDivision: (division: string) => void;
  setActiveZoneDistrictName: (name: string) => void;
  setCustomPayload: (msg: string) => void;
  clearError: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `${getApiBaseUrl()}/api/hardware`;

const BAUD_OPTIONS = [9600, 57600, 115200, 230400];
const LIKELY_HARDWARE_PORT = /(ch340|cp210|usb-serial|usb to uart|uart|serial|esp32|silicon labs)/i;

export const NODE_OPTIONS = [
  { id: 'ALL',     label: '📡 ALL (Broadcast)' },
  { id: 'NODE_01', label: '🟢 NODE_01 — Teknaf Alpha' },
  { id: 'NODE_02', label: '🟡 NODE_02 — Ukhia Beta' },
  { id: 'NODE_03', label: '🔵 NODE_03 — Moheshkhali Gamma' },
  { id: 'NODE_04', label: '🟠 NODE_04 — Cox Sadar Delta' },
  { id: 'NODE_05', label: '🟣 NODE_05 — Kutubdia Epsilon' },
  { id: 'NODE_06', label: '🔴 NODE_06 — Rangamati Relay' },
  { id: 'NODE_07', label: '🟤 NODE_07 — Khagrachhari Relay' },
  { id: 'NODE_08', label: '⚪ NODE_08 — Bandarban Relay' },
  { id: 'NODE_09', label: '🟡 NODE_09 — Chittagong HQ' },
  { id: 'NODE_10', label: '🔵 NODE_10 — Barishal Coastal' },
];

export { BAUD_OPTIONS };

function sortPorts(ports: SerialPort[]): SerialPort[] {
  return [...ports].sort((a, b) => {
    const aLikely = LIKELY_HARDWARE_PORT.test(`${a.description} ${a.hwid}`);
    const bLikely = LIKELY_HARDWARE_PORT.test(`${b.description} ${b.hwid}`);
    if (aLikely !== bLikely) {
      return aLikely ? -1 : 1;
    }
    return a.device.localeCompare(b.device, undefined, { numeric: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Static fallback / client-side region + dialect data
// (used when backend not running — identical to dialect_translations.py)
// ─────────────────────────────────────────────────────────────────────────────

export const FALLBACK_REGIONS: RegionOption[] = [
  { id: 'rangamati',    label: '🟤 Rangamati / রাঙামাটি (CHT)',       dialect: 'chakma',           dialect_label: 'Chakma / চাকমা' },
  { id: 'bandarban',    label: '🟤 Bandarban / বান্দরবান (CHT)',       dialect: 'marma',            dialect_label: 'Marma / মারমা' },
  { id: 'khagrachhari', label: '🟤 Khagrachhari / খাগড়াছড়ি (CHT)',   dialect: 'marma',            dialect_label: 'Marma / মারমা' },
];

/** Client-side dialect→keywords lookup (mirrors backend dialect_translations.py) */
export const CLIENT_DIALECT_TABLE: Record<string, Record<string, Record<string, string>>> = {
  standard_bengali: {
    CYCLONE_WARN:   { name: 'ঘূর্ণিঝড়',     signal: 'বিপদ!',   action: 'সরে যান' },
    EVACUATE_NOW:   { name: 'জরুরি সরণ',    signal: 'বিপদ!',   action: 'সরে যান' },
    STORM_SURGE:    { name: 'জলোচ্ছ্বাস',    signal: 'বিপদ!',   action: 'উঁচুতে যান' },
    FLOOD_WARN:     { name: 'বন্যা',         signal: 'সতর্ক!',  action: 'সাবধান' },
    LANDSLIDE_WARN: { name: 'ভূমিধস',        signal: 'সতর্ক!',  action: 'সরে যান' },
    ALL_CLEAR:      { name: 'নিরাপদ',        signal: 'নিরাপদ',  action: 'স্বাভাবিক' },
    PING:           { name: 'পরীক্ষা',        signal: 'নিরাপদ',  action: 'স্বাভাবিক' },
  },
  chakma: {
    CYCLONE_WARN:   { name: 'ডোল তুফান',     signal: 'বিপদ!',   action: 'সুরি যা' },
    EVACUATE_NOW:   { name: 'জরুরি সরণ',     signal: 'বিপদ!',   action: 'সুরি যা' },
    STORM_SURGE:    { name: 'গাং উধুলন',     signal: 'বিপদ!',   action: 'উঝোত যা' },
    FLOOD_WARN:     { name: 'বান্যা',         signal: 'সতর্ক!',  action: 'হুজিয়ার' },
    LANDSLIDE_WARN: { name: 'পাহাড় ভাঙ্গা',  signal: 'সতর্ক!',  action: 'সুরি যা' },
    ALL_CLEAR:      { name: 'বিপদ গেইয়ে',    signal: 'নিরাপদ',  action: 'ডর নেই' },
    PING:           { name: 'পরীক্ষা',        signal: 'নিরাপদ',  action: 'ডর নেই' },
  },
  marma: {
    CYCLONE_WARN:   { name: 'লাংক্রি',       signal: 'বিপদ!',   action: 'থুয়াক পা' },
    EVACUATE_NOW:   { name: 'জরুরি সরণ',     signal: 'বিপদ!',   action: 'থুয়াক পা' },
    STORM_SURGE:    { name: 'রুই তাং',       signal: 'বিপদ!',   action: 'তং পা' },
    FLOOD_WARN:     { name: 'রুই লা',        signal: 'সতর্ক!',  action: 'হুচিয়ার' },
    LANDSLIDE_WARN: { name: 'তং প্যই',       signal: 'সতর্ক!',  action: 'থুয়াক পা' },
    ALL_CLEAR:      { name: 'মা শি',         signal: 'নিরাপদ',  action: 'বে মা শি' },
    PING:           { name: 'পরীক্ষা',        signal: 'নিরাপদ',  action: 'বে মা শি' },
  },
};

/** Resolve translation locally (no backend needed) */
function clientTranslate(msgType: string, regionId: string, regions: RegionOption[]): DialectTranslation | null {
  // Find dialect from regions, fallback to standard_bengali
  const region = regions.find(r => r.id === regionId) ?? FALLBACK_REGIONS.find(r => r.id === regionId);
  const dialect = region?.dialect ?? 'standard_bengali';
  const table = CLIENT_DIALECT_TABLE[dialect] ?? CLIENT_DIALECT_TABLE['standard_bengali'];
  if (!table) return null;
  return {
    dialect,
    dialect_label: region?.dialect_label ?? 'Standard Bengali / প্রমিত বাংলা',
    native_text: table[msgType] ?? null,
    all_keywords: table,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useHardwareStore = create<HardwareStore>((set, get) => {
  // Wire up the webSerial onChange callback to sync state into Zustand
  webSerial.onChange = () => {
    const ws = webSerial;
    set({
      status: ws.getStatus(),
      log: ws.getLog() as HardwareLogEntry[],
      webSerialPortSelected: ws.hasPort(),
      webSerialPortLabel: ws.portLabel,
    });
  };

  return {
    // Serial mode — start with webserial if supported, fallback to backend
    serialMode: (typeof navigator !== 'undefined' && navigator.serial) ? 'webserial' : 'backend',
    webSerialSupported: typeof navigator !== 'undefined' && !!navigator.serial,
    webSerialPortSelected: false,
    webSerialPortLabel: null,

    status: null,
    ports: [],
    presets: [],
    regions: [],
    divisions: [],
    isConnecting: false,
    isDisconnecting: false,
    isTransmitting: false,

    selectedPort: '',
    selectedBaud: 115200,
    selectedNodeId: 'ALL',
    selectedMsgType: 'CYCLONE_WARN',
    selectedRegion: '',
    selectedDivision: '',
    activeZoneDistrictName: '',
    customPayload: '',

    currentTranslation: null,
    isTranslating: false,

    log: [],
    lastMsgId: null,
    error: null,

    // ── Auto-detect serial mode ─────────────────────────────────────────────
    detectSerialMode: async () => {
      const wsSupported = typeof navigator !== 'undefined' && !!navigator.serial;
      set({ webSerialSupported: wsSupported });

      // Try to reach backend /api/hardware/status
      try {
        const res = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        // If backend has pyserial and reports ports, prefer backend mode
        if (data.serial_lib && data.connected) {
          set({ serialMode: 'backend' });
          return;
        }
        // Backend is up but no serial — check if it lists any ports
        const portsRes = await fetch(`${BASE}/ports`, { signal: AbortSignal.timeout(3000) });
        const portsData = await portsRes.json();
        if (portsData.ports && portsData.ports.length > 0) {
          set({ serialMode: 'backend' });
          return;
        }
      } catch {
        // Backend unreachable — fall through
      }

      // Default to webserial if supported, else stay backend
      set({ serialMode: wsSupported ? 'webserial' : 'backend' });
    },

    setSerialMode: (mode: SerialMode) => set({ serialMode: mode, error: null }),

    // ── Web Serial: request port (user gesture required) ────────────────────
    requestWebSerialPort: async () => {
      set({ error: null });
      const ok = await webSerial.requestPort();
      if (!ok) {
        // User cancelled — not an error
      }
      set({
        webSerialPortSelected: webSerial.hasPort(),
        webSerialPortLabel: webSerial.portLabel,
      });
    },

    // ── Fetch available serial ports (backend mode only) ────────────────────
    fetchPorts: async () => {
      if (get().serialMode === 'webserial') return; // N/A for webserial
      try {
        const res = await fetch(`${BASE}/ports`);
        const data = await res.json();
        const ports = sortPorts(data.ports ?? []);
        const currentPort = get().selectedPort;
        const currentStillExists = ports.some((p) => p.device === currentPort);
        set({
          ports,
          error: null,
          selectedPort: currentStillExists ? currentPort : (ports[0]?.device ?? ''),
        });
      } catch {
        set({ error: 'Could not reach backend. Is the server running?' });
      }
    },

    // ── Fetch pre-set message codes ─────────────────────────────────────────
    fetchPresets: async () => {
      try {
        const res = await fetch(`${BASE}/presets`);
        const data = await res.json();
        set({ presets: data.presets ?? [] });
      } catch {
        // non-critical
      }
    },

    // ── Fetch target regions (flat — backward compat) ───────────────────────
    fetchRegions: async () => {
      try {
        const res = await fetch(`${BASE}/regions`);
        const data = await res.json();
        const fetched = data.regions ?? [];
        set({ regions: fetched.length > 0 ? fetched : FALLBACK_REGIONS });
      } catch {
        set({ regions: FALLBACK_REGIONS });
      }
    },

    // ── Fetch hierarchical divisions ────────────────────────────────────────
    fetchDivisions: async () => {
      try {
        const res = await fetch(`${BASE}/divisions`);
        const data = await res.json();
        set({ divisions: data.divisions ?? [] });
      } catch {
        // silent — panel still works with flat regions
      }
    },

    // ── Fetch dialect translation for current selection ─────────────────────
    fetchTranslation: async () => {
      const { selectedMsgType, selectedRegion } = get();
      if (!selectedRegion || selectedMsgType === 'CUSTOM') {
        set({ currentTranslation: null });
        return;
      }
      set({ isTranslating: true });
      try {
        const res = await fetch(
          `${BASE}/translate?msg_type=${encodeURIComponent(selectedMsgType)}&region=${encodeURIComponent(selectedRegion)}`
        );
        const data: DialectTranslation = await res.json();
        set({ currentTranslation: data, isTranslating: false });
      } catch {
        // Backend unreachable — resolve locally using client-side table
        const local = clientTranslate(selectedMsgType, selectedRegion, get().regions);
        set({ currentTranslation: local, isTranslating: false });
      }
    },

    // ── Poll connection status ──────────────────────────────────────────────
    fetchStatus: async () => {
      if (get().serialMode === 'webserial') {
        // For webserial, read state directly from the service
        set({ status: webSerial.getStatus() });
        return;
      }
      if (get().isConnecting) return;
      try {
        const res = await fetch(`${BASE}/status?_=${Date.now()}`, { cache: 'no-store' });
        const data: HardwareStatus = await res.json();
        if (!get().isConnecting) {
          set({
            status: data,
            selectedPort: data.port ?? get().selectedPort,
          });
        }
      } catch {
        if (!get().isConnecting) {
          set({ status: null });
        }
      }
    },

    // ── Poll transmission log ───────────────────────────────────────────────
    fetchLog: async () => {
      if (get().serialMode === 'webserial') {
        set({ log: webSerial.getLog() as HardwareLogEntry[] });
        return;
      }
      try {
        const res = await fetch(`${BASE}/log?limit=60`);
        const data = await res.json();
        set({ log: data.entries ?? [] });
      } catch {
        // silent
      }
    },

    // ── Connect ─────────────────────────────────────────────────────────────
    connect: async () => {
      const mode = get().serialMode;

      // ─── Web Serial path ──────────────────────────────────────────────
      if (mode === 'webserial') {
        if (!webSerial.hasPort()) {
          set({ error: 'Click "Select USB Port" first to choose your ESP32.' });
          return;
        }
        set({ isConnecting: true, error: null });
        try {
          await webSerial.connect(get().selectedBaud);
          set({ status: webSerial.getStatus() });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          set({ error: message || 'Failed to connect via Web Serial.' });
        } finally {
          set({ isConnecting: false });
        }
        return;
      }

      // ─── Backend path (original) ──────────────────────────────────────
      const { selectedPort, selectedBaud } = get();
      if (!selectedPort) {
        set({ error: 'Select a serial port before connecting.' });
        return;
      }
      set({ isConnecting: true, error: null });
      try {
        let res = await fetch(`${BASE}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: selectedPort, baud: selectedBaud }),
        });
        let data = await res.json();

        // Auto-recovery: if backend says "Already connected", disconnect first then retry
        if (res.status === 409) {
          await fetch(`${BASE}/disconnect`, { method: 'POST' }).catch(() => {});
          res = await fetch(`${BASE}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: selectedPort, baud: selectedBaud }),
          });
          data = await res.json();
        }

        if (!res.ok) {
          const detail = data.detail;
          const msg = typeof detail === 'string' ? detail
            : Array.isArray(detail) ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
            : typeof detail === 'object' ? JSON.stringify(detail)
            : 'Connection failed';
          throw new Error(msg);
        }

        // Sync state from backend
        const statusRes = await fetch(`${BASE}/status?_=${Date.now()}`, { cache: 'no-store' });
        const statusData: HardwareStatus = await statusRes.json();
        set({ status: statusData });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set({ error: message || 'Failed to connect to serial port.' });
      } finally {
        set({ isConnecting: false });
      }
    },

    // ── Disconnect ──────────────────────────────────────────────────────────
    disconnect: async () => {
      const mode = get().serialMode;

      // ─── Web Serial path ──────────────────────────────────────────────
      if (mode === 'webserial') {
        set({ isDisconnecting: true, error: null });
        try {
          await webSerial.disconnect();
          set({ status: webSerial.getStatus() });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          set({ error: message || 'Disconnect failed.' });
        } finally {
          set({ isDisconnecting: false });
        }
        return;
      }

      // ─── Backend path (original) ──────────────────────────────────────
      set({ isDisconnecting: true, error: null });

      const fetchWithTimeout = (url: string, opts: RequestInit = {}, ms = 3000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        return fetch(url, { ...opts, signal: controller.signal })
          .finally(() => clearTimeout(id));
      };

      try {
        await fetchWithTimeout(`${BASE}/disconnect`, { method: 'POST' }, 3000);
      } catch {
        // Timeout or network error — continue anyway
      }

      const currentStatus = get().status;
      set({
        status: currentStatus
          ? { ...currentStatus, connected: false }
          : { connected: false, port: null, baud: 115200, packets_sent: 0, last_ack: null, last_ack_ts: null, serial_lib: true },
      });

      try {
        const res = await fetchWithTimeout(`${BASE}/status?_=${Date.now()}`, { cache: 'no-store' }, 2000);
        const data: HardwareStatus = await res.json();
        set({ status: data });
      } catch {
        // Keep the optimistic cleared state
      }

      set({ isDisconnecting: false });
    },

    // ── Transmit ────────────────────────────────────────────────────────────
    transmit: async () => {
      const { serialMode, selectedNodeId, selectedMsgType, customPayload, presets, selectedRegion, currentTranslation } = get();

      const preset = presets.find(p => p.code === selectedMsgType);
      const payload = customPayload.trim() || preset?.default_msg || selectedMsgType;

      if (!payload) {
        set({ error: 'Message payload cannot be empty.' });
        return;
      }

      // Resolve native text
      const rawNative = currentTranslation?.native_text;
      let nativeText = '';
      if (typeof rawNative === 'string') {
        nativeText = rawNative;
      } else if (rawNative && typeof rawNative === 'object') {
        nativeText = `${rawNative.name ?? ''}|${rawNative.signal ?? ''}|${rawNative.action ?? ''}`;
      }

      // Build the full payload (including native text for OLED)
      let fullPayload = payload;
      if (nativeText) {
        fullPayload = `${nativeText}`;
      }

      set({ isTransmitting: true, error: null });

      // ─── Web Serial path ──────────────────────────────────────────────
      if (serialMode === 'webserial') {
        try {
          const msgId = await webSerial.transmit(
            selectedNodeId.toUpperCase(),
            selectedMsgType.toUpperCase(),
            fullPayload,
          );
          set({
            lastMsgId: msgId,
            log: webSerial.getLog() as HardwareLogEntry[],
            status: webSerial.getStatus(),
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          set({ error: message || 'Transmission failed.' });
        } finally {
          set({ isTransmitting: false });
        }
        return;
      }

      // ─── Backend path (original) ──────────────────────────────────────
      try {
        const res = await fetch(`${BASE}/transmit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: selectedNodeId,
            msg_type: selectedMsgType,
            payload,
            region: selectedRegion,
            native_text: nativeText,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const detail = data.detail;
          const msg = typeof detail === 'string' ? detail
            : Array.isArray(detail) ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
            : JSON.stringify(detail) ?? 'Transmission failed';
          throw new Error(msg);
        }
        set({ lastMsgId: data.msg_id });
        await get().fetchLog();
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        set({ error: message || 'Transmission failed.' });
      } finally {
        set({ isTransmitting: false });
      }
    },

    // ── UI setters ──────────────────────────────────────────────────────────
    setSelectedPort:    (port)  => set({ selectedPort: port, error: null }),
    setSelectedBaud:    (baud)  => set({ selectedBaud: baud }),
    setSelectedNodeId:  (id)    => set({ selectedNodeId: id }),
    setSelectedMsgType: (type)  => {
      const preset = get().presets.find(p => p.code === type);
      set((state) => ({
        selectedMsgType: type,
        // Keep existing payload for custom/unknown types so automation-prefilled LoRa text is not cleared.
        customPayload: preset ? (preset.default_msg ?? '') : state.customPayload,
      }));
      // Auto-fetch translation when msg type changes
      setTimeout(() => get().fetchTranslation(), 50);
    },
    setSelectedRegion: (region) => {
      set({ selectedRegion: region });
      setTimeout(() => get().fetchTranslation(), 50);
    },
    setSelectedDivision: (division) => {
      set({ selectedDivision: division, selectedRegion: '' });
    },
    setActiveZoneDistrictName: (name) => {
      set({ activeZoneDistrictName: name });
      // Auto-select the matching division if name is set
      if (name) {
        const divisions = get().divisions;
        const normalizedName = name.toLowerCase().trim();
        const matchingDiv = divisions.find(div =>
          div.districts.some(d => {
            const label = d.label.toLowerCase();
            return label.includes(normalizedName) || normalizedName.includes(d.id);
          })
        );
        if (matchingDiv) {
          set({ selectedDivision: matchingDiv.id, selectedRegion: '' });
        }
      }
    },
    setCustomPayload:   (msg)   => set({ customPayload: msg }),
    clearError:         ()      => set({ error: null }),
  };
});
