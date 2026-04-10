/**
 * useEmployeeStore — Tracks field employees and their GPS trails for heatmap.
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

interface EmployeeState {
  employees: Employee[];
  heatPoints: HeatPoint[];
  showHeatmap: boolean;
  showEmployees: boolean;

  setEmployees: (employees: Employee[]) => void;
  updatePosition: (id: string, lat: number, lng: number) => void;
  addHeatPoint: (lat: number, lng: number, intensity?: number) => void;
  toggleHeatmap: () => void;
  toggleEmployees: () => void;
  setShowHeatmap: (v: boolean) => void;
  setShowEmployees: (v: boolean) => void;
}

export const useEmployeeStore = create<EmployeeState>((set) => ({
  employees: [],
  heatPoints: [],
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
      // Also add to global heatPoints
      const heatPoints: HeatPoint[] = [...state.heatPoints, [lat, lng, 0.7]];
      return { employees, heatPoints };
    }),

  addHeatPoint: (lat, lng, intensity = 0.5) =>
    set((state) => ({
      heatPoints: [...state.heatPoints, [lat, lng, intensity]],
    })),

  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
  toggleEmployees: () => set((s) => ({ showEmployees: !s.showEmployees })),
  setShowHeatmap: (v) => set({ showHeatmap: v }),
  setShowEmployees: (v) => set({ showEmployees: v }),
}));
