/**
 * Danger-Zone Roads Service — Architecture scaffold for backend-powered
 * road-hazard intersection analysis.
 *
 * The browser sends a hazard polygon → the backend returns affected road segments.
 * NO national road-hazard intersection runs in the browser.
 *
 * ⚠️ NOT IMPLEMENTED — replace the stub with an actual API call when the backend
 *   spatial analysis service is ready.
 */
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

// ─── Types ──────────────────────────────────────────────────────
export interface AffectedRoadsRequest {
  /** Hazard polygon to intersect with road network */
  hazardPolygon: Feature<Polygon | MultiPolygon>;
  /** Optional: filter by road classes (e.g. ['primary', 'secondary']) */
  roadClasses?: string[];
  /** Optional: buffer distance in km around the polygon */
  bufferKm?: number;
}

export interface AffectedRoadsResult {
  /** GeoJSON collection of road segments within the hazard area */
  roads: FeatureCollection;
  /** Total road length affected in km */
  totalKm: number;
  /** Breakdown by road class */
  byClass: Record<string, { count: number; km: number }>;
  /** Locality-level aggregation if available */
  localityMetrics?: {
    localityId: string;
    name: string;
    affectedKm: number;
    roadCount: number;
  }[];
}

// ─── Stub Implementation ────────────────────────────────────────
const ANALYSIS_API_BASE = '/api/danger-zone/roads'; // future backend endpoint

/**
 * Query roads affected by a hazard polygon.
 *
 * Currently returns a stub error. Replace the body with an actual
 * fetch() to your spatial analysis backend when ready.
 */
export async function getAffectedRoads(
  _req: AffectedRoadsRequest
): Promise<AffectedRoadsResult> {
  // ── Future implementation ──
  // const res = await fetch(ANALYSIS_API_BASE, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(req),
  // });
  // if (!res.ok) throw new Error('Danger-zone analysis unavailable');
  // return res.json();

  throw new Error(
    '[dangerZoneRoadsService] Not implemented yet. ' +
    'Connect a spatial analysis backend at ' + ANALYSIS_API_BASE
  );
}

/**
 * Check if the danger-zone analysis service is available.
 */
export async function isDangerZoneAnalysisAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ANALYSIS_API_BASE}/health`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
