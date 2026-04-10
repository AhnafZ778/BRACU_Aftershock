/**
 * Routing Service — Architecture scaffold for backend-powered routing.
 *
 * The browser sends start/end coordinates → the backend returns a route polyline.
 * This file defines the contract and a placeholder stub.
 *
 * ⚠️ NOT IMPLEMENTED — replace the stub with an actual API call when the backend
 *   routing service (e.g. OSRM, Valhalla, or a custom endpoint) is ready.
 */
import type { FeatureCollection } from 'geojson';

// ─── Types ──────────────────────────────────────────────────────
export interface RouteRequest {
  /** [lat, lng] of the start point */
  start: [number, number];
  /** [lat, lng] of the end point */
  end: [number, number];
  /** Optional: avoid certain road classes */
  avoidClasses?: string[];
}

export interface RouteResult {
  /** Ordered [lat, lng] pairs forming the route polyline */
  polyline: [number, number][];
  /** Total distance in km */
  distance_km: number;
  /** Estimated travel duration in minutes */
  duration_min: number;
  /** GeoJSON representation if needed for map display */
  geojson?: FeatureCollection;
}

// ─── Stub Implementation ────────────────────────────────────────
const ROUTING_API_BASE = '/api/route'; // future backend endpoint

/**
 * Request a route between two points.
 *
 * Currently returns a stub error. Replace the body with an actual
 * fetch() to your routing backend when ready.
 */
export async function getRoute(_req: RouteRequest): Promise<RouteResult> {
  // ── Future implementation ──
  // const params = new URLSearchParams({
  //   start: req.start.join(','),
  //   end: req.end.join(','),
  // });
  // const res = await fetch(`${ROUTING_API_BASE}?${params}`);
  // if (!res.ok) throw new Error('Routing service unavailable');
  // return res.json();

  throw new Error(
    '[routingService] Not implemented yet. ' +
    'Connect a routing backend (OSRM / Valhalla / custom) at ' + ROUTING_API_BASE
  );
}

/**
 * Check if the routing service is available.
 */
export async function isRoutingAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ROUTING_API_BASE}/health`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
