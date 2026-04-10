/**
 * useEmployeeStore — Tracks field employees and their GPS trails for heatmap.
 * Also manages SOS alerts sent from the Employee Portal.
 * 
 * Cross-tab sync uses localStorage 'storage' events — the most reliable
 * browser mechanism for real-time cross-tab communication.
 */
import { create } from 'zustand';

export interface Employee {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area: string;
  color: string;
  trail: [number, number][];  // accumulated GPS trail
  status: 'active' | 'idle';
}

export type HeatPoint = [number, number, number]; // [lat, lng, intensity]

export interface SosAlert {
  employeeId: string;
  employeeName: string;
  area: string;
  lat: number;
  lng: number;
  color: string;
  timestamp: number;
}

const SOS_STORAGE_KEY = 'nirapotta-sos-alerts';

interface EmployeeState {
  employees: Employee[];
  heatPoints: HeatPoint[];
  sosAlerts: SosAlert[];
  showHeatmap: boolean;
  showEmployees: boolean;

  setEmployees: (employees: Employee[]) => void;
  updatePosition: (id: string, lat: number, lng: number) => void;
  addHeatPoint: (lat: number, lng: number, intensity?: number) => void;
  addSosAlert: (alert: SosAlert) => void;
  clearSosAlert: (timestamp: number) => void;
  toggleHeatmap: () => void;
  toggleEmployees: () => void;
  setShowHeatmap: (v: boolean) => void;
  setShowEmployees: (v: boolean) => void;
}

// Helper to read SOS alerts from localStorage
function readSosFromStorage(): SosAlert[] {
  try {
    const raw = localStorage.getItem(SOS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SosAlert[];
  } catch {
    return [];
  }
}

// Helper to write SOS alerts to localStorage
function writeSosToStorage(alerts: SosAlert[]) {
  try {
    localStorage.setItem(SOS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Ignore storage errors
  }
}

export const useEmployeeStore = create<EmployeeState>((set, get) => {
  // Listen for SOS alerts from OTHER tabs via localStorage 'storage' event
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === SOS_STORAGE_KEY && event.newValue) {
        try {
          const alerts = JSON.parse(event.newValue) as SosAlert[];
          set({ sosAlerts: alerts });
        } catch {
          // Ignore parse errors
        }
      }
    });
  }

  // Initialize with any existing SOS alerts from localStorage
  const initialSos = readSosFromStorage();

  return {
    employees: [],
    heatPoints: [],
    sosAlerts: initialSos,
    showHeatmap: true,
    showEmployees: true,

    setEmployees: (employees) => set({ employees }),

    updatePosition: (id, lat, lng) =>
      set((state) => {
        const employees = state.employees.map((e) => {
          if (e.id !== id) return e;
          return {
            ...e,
            lat,
            lng,
            trail: [...e.trail, [lat, lng] as [number, number]],
          };
        });
        const heatPoints: HeatPoint[] = [...state.heatPoints, [lat, lng, 0.7]];
        return { employees, heatPoints };
      }),

    addHeatPoint: (lat, lng, intensity = 0.5) =>
      set((state) => ({
        heatPoints: [...state.heatPoints, [lat, lng, intensity]],
      })),

    addSosAlert: (alert) => {
      const newAlerts = [alert, ...get().sosAlerts].slice(0, 50);
      set({ sosAlerts: newAlerts });
      // Write to localStorage — this triggers 'storage' event in OTHER tabs
      writeSosToStorage(newAlerts);
    },

    clearSosAlert: (timestamp) => {
      const newAlerts = get().sosAlerts.filter((a) => a.timestamp !== timestamp);
      set({ sosAlerts: newAlerts });
      writeSosToStorage(newAlerts);
    },

    toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
    toggleEmployees: () => set((s) => ({ showEmployees: !s.showEmployees })),
    setShowHeatmap: (v) => set({ showHeatmap: v }),
    setShowEmployees: (v) => set({ showEmployees: v }),
  };
});
