/**
 * hex_interpolator_v4.ts — IDW k-Nearest Interpolation for DZI v4
 * ================================================================
 * Replaces the v3 "nearest-single-locality" assignment with
 * Inverse-Distance-Weighted (IDW) interpolation from k=4 nearest
 * locality centroids. Provides smoother hex surfaces and optional
 * neighbor-averaging post-pass.
 *
 * Usage example:
 *   import { HexInterpolator } from '../lib/hex_interpolator_v4';
 *
 *   const interp = new HexInterpolator(localities, 4);
 *   const score = interp.interpolateAt(hexLat, hexLon, 'dangerScore');
 *   const smoothed = interp.interpolateWithSmoothing(hexLat, hexLon, neighborHexes, 'dangerScore');
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalityPoint {
  code: string;
  lat: number;
  lon: number;
  /** Any numeric properties to interpolate */
  [key: string]: number | string;
}

export interface IDWResult {
  /** Interpolated value */
  value: number;
  /** Contributing localities with their weights */
  contributors: Array<{
    code: string;
    distance_km: number;
    weight: number;
  }>;
  /** Dominant (highest weight) locality code */
  primaryCode: string;
}

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------------------------------------------------------------------------
// Simple spatial grid index for fast k-nearest lookup
// ---------------------------------------------------------------------------

/** Grid cell size in degrees (~50km ≈ 0.45°) */
const GRID_CELL_DEG = 0.45;

interface SpatialGrid {
  cells: Map<string, LocalityPoint[]>;
}

function gridKey(lat: number, lon: number): string {
  const r = Math.floor(lat / GRID_CELL_DEG);
  const c = Math.floor(lon / GRID_CELL_DEG);
  return `${r},${c}`;
}

function buildSpatialGrid(points: LocalityPoint[]): SpatialGrid {
  const cells = new Map<string, LocalityPoint[]>();
  for (const p of points) {
    const key = gridKey(p.lat, p.lon);
    const arr = cells.get(key);
    if (arr) {
      arr.push(p);
    } else {
      cells.set(key, [p]);
    }
  }
  return { cells };
}

function kNearestFromGrid(
  grid: SpatialGrid,
  lat: number,
  lon: number,
  k: number,
): Array<{ point: LocalityPoint; dist: number }> {
  // Search expanding rings of grid cells until we have ≥ k candidates
  const r0 = Math.floor(lat / GRID_CELL_DEG);
  const c0 = Math.floor(lon / GRID_CELL_DEG);

  let candidates: Array<{ point: LocalityPoint; dist: number }> = [];

  for (let ring = 0; ring <= 5; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (ring > 0 && Math.abs(dr) < ring && Math.abs(dc) < ring) continue; // skip interior
        const key = `${r0 + dr},${c0 + dc}`;
        const cell = grid.cells.get(key);
        if (!cell) continue;
        for (const p of cell) {
          candidates.push({
            point: p,
            dist: haversineKm(lat, lon, p.lat, p.lon),
          });
        }
      }
    }
    if (candidates.length >= k) break;
  }

  // Sort by distance and take top k
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, k);
}

// ---------------------------------------------------------------------------
// HexInterpolator class
// ---------------------------------------------------------------------------

export class HexInterpolator {
  private points: LocalityPoint[];
  private grid: SpatialGrid;
  private k: number;
  /** Smoothing factor: prevents singularity when distance → 0 (km) */
  private delta: number;
  /** IDW power exponent: higher = steeper falloff (default: 2.0) */
  private power: number;

  /**
   * @param points — Array of locality data points
   * @param k — Number of nearest neighbors to use (default: 4)
   * @param delta — Distance smoothing constant in km (default: 1.0)
   * @param power — IDW exponent: 2.0 for baseline, 3.5 for dynamic (default: 2.0)
   */
  constructor(points: LocalityPoint[], k = 4, delta = 1.0, power = 2.0) {
    this.points = points;
    this.k = k;
    this.delta = delta;
    this.power = power;
    this.grid = buildSpatialGrid(points);
  }

  /**
   * Compute IDW interpolated value for a single numeric property.
   *
   * Formula: Score_hex = Σ(w_i × v_i) / Σ(w_i)
   *   where w_i = 1 / (d_i + δ)²
   */
  interpolate(lat: number, lon: number, property: string): IDWResult {
    const neighbors = kNearestFromGrid(this.grid, lat, lon, this.k);

    if (neighbors.length === 0) {
      return { value: 0, contributors: [], primaryCode: '' };
    }

    // If exactly on top of a point (distance < 0.1km), return that point's value
    if (neighbors[0].dist < 0.1) {
      const p = neighbors[0].point;
      const val = typeof p[property] === 'number' ? (p[property] as number) : 0;
      return {
        value: val,
        contributors: [{ code: p.code, distance_km: neighbors[0].dist, weight: 1.0 }],
        primaryCode: p.code,
      };
    }

    let sumWeightedVal = 0;
    let sumWeight = 0;
    const contributors: IDWResult['contributors'] = [];

    for (const { point, dist } of neighbors) {
      const w = 1.0 / ((dist + this.delta) ** this.power);
      const val = typeof point[property] === 'number' ? (point[property] as number) : 0;
      sumWeightedVal += w * val;
      sumWeight += w;
      contributors.push({
        code: point.code,
        distance_km: Math.round(dist * 10) / 10,
        weight: w,
      });
    }

    // Normalize weights for reporting
    const totalW = sumWeight || 1;
    for (const c of contributors) {
      c.weight = Math.round((c.weight / totalW) * 1000) / 1000;
    }

    return {
      value: sumWeight > 0 ? sumWeightedVal / sumWeight : 0,
      contributors,
      primaryCode: contributors[0]?.code || '',
    };
  }

  /**
   * Interpolate multiple properties at once (more efficient than
   * calling interpolate() per property).
   */
  interpolateMulti(
    lat: number,
    lon: number,
    properties: string[],
  ): { values: Record<string, number>; primaryCode: string } {
    const neighbors = kNearestFromGrid(this.grid, lat, lon, this.k);

    if (neighbors.length === 0) {
      const values: Record<string, number> = {};
      for (const p of properties) values[p] = 0;
      return { values, primaryCode: '' };
    }

    // Compute weights once
    const weights: number[] = [];
    let sumWeight = 0;
    for (const { dist } of neighbors) {
      const w = dist < 0.1 ? 1e6 : 1.0 / ((dist + this.delta) ** this.power);
      weights.push(w);
      sumWeight += w;
    }

    const values: Record<string, number> = {};
    for (const prop of properties) {
      let sum = 0;
      for (let i = 0; i < neighbors.length; i++) {
        const val = neighbors[i].point[prop];
        const v = typeof val === 'number' ? val : 0;
        sum += weights[i] * v;
      }
      values[prop] = sumWeight > 0 ? sum / sumWeight : 0;
    }

    return {
      values,
      primaryCode: neighbors[0]?.point.code || '',
    };
  }

  /**
   * Apply optional neighbor smoothing across adjacent hexes.
   *
   * Formula: hex_smoothed = 0.85 × hex_raw + 0.15 × mean(neighbors)
   *
   * @param hexScores — Map of hexId → raw interpolated score
   * @param hexNeighbors — Map of hexId → array of neighbor hexIds
   * @param alpha — Self-weight (default: 0.85)
   * @returns Map of hexId → smoothed score
   */
  static smoothNeighbors(
    hexScores: Map<string, number>,
    hexNeighbors: Map<string, string[]>,
    alpha = 0.85,
  ): Map<string, number> {
    const smoothed = new Map<string, number>();

    const entries = Array.from(hexScores.entries());
    for (const [hexId, rawScore] of entries) {
      const neighborIds = hexNeighbors.get(hexId);
      if (!neighborIds || neighborIds.length === 0) {
        smoothed.set(hexId, rawScore);
        continue;
      }

      let neighborSum = 0;
      let neighborCount = 0;
      for (const nId of neighborIds) {
        const nScore = hexScores.get(nId);
        if (nScore !== undefined) {
          neighborSum += nScore;
          neighborCount++;
        }
      }

      if (neighborCount === 0) {
        smoothed.set(hexId, rawScore);
      } else {
        const neighborMean = neighborSum / neighborCount;
        smoothed.set(hexId, alpha * rawScore + (1 - alpha) * neighborMean);
      }
    }

    return smoothed;
  }

  /** Get the underlying k value */
  getK(): number {
    return this.k;
  }

  /** Get total number of indexed points */
  getPointCount(): number {
    return this.points.length;
  }
}

export default HexInterpolator;
