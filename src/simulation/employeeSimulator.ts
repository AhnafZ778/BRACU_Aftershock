/**
 * employeeSimulator — Generates 8 dummy employees walking around Dhaka.
 *
 * Each employee starts in a different neighborhood and moves every 2 seconds
 * in a realistic semi-random walk. No backend / WebSocket needed.
 */
import { useEmployeeStore, type Employee } from '../store/useEmployeeStore';

// ─── Initial employee seed data ─────────────────────────────────────────
const SEED_EMPLOYEES: Omit<Employee, 'trail'>[] = [
  { id: 'EMP-001', name: 'Rahim Uddin',     lat: 23.8050, lng: 90.3680, area: 'Mirpur',       color: '#f43f5e', status: 'active' },
  { id: 'EMP-002', name: 'Salma Akter',     lat: 23.7925, lng: 90.4150, area: 'Gulshan',      color: '#8b5cf6', status: 'active' },
  { id: 'EMP-003', name: 'Kamal Hossain',   lat: 23.7460, lng: 90.3730, area: 'Dhanmondi',    color: '#06b6d4', status: 'active' },
  { id: 'EMP-004', name: 'Fatema Begum',    lat: 23.8750, lng: 90.3990, area: 'Uttara',       color: '#22c55e', status: 'active' },
  { id: 'EMP-005', name: 'Jahangir Alam',   lat: 23.7330, lng: 90.4180, area: 'Motijheel',    color: '#f59e0b', status: 'active' },
  { id: 'EMP-006', name: 'Nusrat Jahan',    lat: 23.7660, lng: 90.3590, area: 'Mohammadpur',  color: '#ec4899', status: 'active' },
  { id: 'EMP-007', name: 'Tanvir Ahmed',    lat: 23.7800, lng: 90.4280, area: 'Badda',        color: '#3b82f6', status: 'active' },
  { id: 'EMP-008', name: 'Rubina Khatun',   lat: 23.7580, lng: 90.3950, area: 'Tejgaon',      color: '#14b8a6', status: 'active' },
];

// ─── Movement parameters ────────────────────────────────────────────────
const MOVE_INTERVAL_MS = 2000;         // Update every 2 seconds
const STEP_SIZE_DEG = 0.0004;          // ~40 meters per step
const DIRECTION_CHANGE_PROB = 0.25;    // 25% chance to change direction each tick
const PAUSE_PROB = 0.08;               // 8% chance to pause (stay still)

// Per-employee heading (radians)
const headings = new Map<string, number>();

function randomHeading(): number {
  return Math.random() * 2 * Math.PI;
}

function moveEmployee(emp: Employee): { lat: number; lng: number } {
  // Sometimes pause
  if (Math.random() < PAUSE_PROB) {
    return { lat: emp.lat, lng: emp.lng };
  }

  // Get or create heading
  let heading = headings.get(emp.id);
  if (heading === undefined || Math.random() < DIRECTION_CHANGE_PROB) {
    heading = randomHeading();
    headings.set(emp.id, heading);
  }

  // Move with some noise
  const jitter = (Math.random() - 0.5) * 0.3; // slight directional jitter
  const step = STEP_SIZE_DEG * (0.6 + Math.random() * 0.8); // vary step size
  const lat = emp.lat + Math.sin(heading + jitter) * step;
  const lng = emp.lng + Math.cos(heading + jitter) * step;

  // Clamp to Dhaka area to prevent walking off the map
  const clampedLat = Math.max(23.68, Math.min(24.00, lat));
  const clampedLng = Math.max(90.30, Math.min(90.50, lng));

  return { lat: clampedLat, lng: clampedLng };
}

// ─── Simulation controller ──────────────────────────────────────────────
let intervalId: number | null = null;

export function startSimulation() {
  if (intervalId !== null) return; // already running

  const store = useEmployeeStore.getState();

  // Seed the employees
  const seeded: Employee[] = SEED_EMPLOYEES.map((s) => ({
    ...s,
    trail: [[s.lat, s.lng] as [number, number]],
  }));
  store.setEmployees(seeded);

  // Add initial heat points
  for (const e of seeded) {
    store.addHeatPoint(e.lat, e.lng, 0.5);
  }

  // Start movement loop
  intervalId = window.setInterval(() => {
    const { employees, updatePosition } = useEmployeeStore.getState();
    for (const emp of employees) {
      const { lat, lng } = moveEmployee(emp);
      updatePosition(emp.id, lat, lng);
    }
  }, MOVE_INTERVAL_MS);
}

export function stopSimulation() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
