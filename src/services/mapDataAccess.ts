import { apiUrl } from '../config/api';

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface EvacPoint {
  lat: number;
  lng: number;
}

export async function fetchDistricts(detail: 'auto' | 'metadata' | 'lod1' | 'full' = 'auto') {
  const res = await fetch(apiUrl(`/api/districts?detail=${detail}`));
  if (!res.ok) throw new Error('Failed to fetch districts');
  return res.json();
}

export async function fetchDynamicHazard() {
  const res = await fetch(apiUrl('/api/dynamic-hazard'));
  if (!res.ok) throw new Error('Failed to fetch dynamic hazard');
  return res.json();
}

export interface DynamicHazardChunkResponse {
  generated_utc: string;
  stale: boolean;
  cursor: number;
  limit: number;
  next_cursor: number | null;
  has_more: boolean;
  localities: Record<string, any>;
  error?: string;
}

export async function fetchDynamicHazardChunk(cursor = 0, limit = 300): Promise<DynamicHazardChunkResponse> {
  const path = `/api/dynamic-hazard/chunks?cursor=${cursor}&limit=${limit}`;
  const res = await fetch(apiUrl(path));
  if (res.ok) {
    const data = await res.json();
    if (!data?.error) return data;
  }

  // Compatibility fallback: older backend without chunk endpoint
  const full = await fetchDynamicHazard();
  const entries = Object.entries(full?.localities || {});
  const safeCursor = Math.max(0, cursor);
  const safeLimit = Math.max(1, limit);
  const slice = entries.slice(safeCursor, safeCursor + safeLimit);
  const chunkLocalities = Object.fromEntries(slice);
  const hasMore = safeCursor + safeLimit < entries.length;

  return {
    generated_utc: String(full?.generated_utc || ''),
    stale: Boolean(full?.stale),
    cursor: safeCursor,
    limit: safeLimit,
    next_cursor: hasMore ? safeCursor + slice.length : null,
    has_more: hasMore,
    localities: chunkLocalities,
  };
}

export async function fetchDynamicHazardProgressive(limit = 300) {
  let cursor = 0;
  let stale = false;
  let generated_utc = '';
  const localities: Record<string, any> = {};

  while (true) {
    const chunk = await fetchDynamicHazardChunk(cursor, limit);
    stale = chunk.stale;
    generated_utc = chunk.generated_utc;
    Object.assign(localities, chunk.localities || {});
    if (!chunk.has_more || chunk.next_cursor == null) {
      break;
    }
    cursor = chunk.next_cursor;
  }

  return { stale, generated_utc, localities };
}

export async function fetchThreats() {
  const res = await fetch(apiUrl('/api/threats'));
  if (!res.ok) throw new Error('Failed to fetch threats');
  return res.json();
}

/**
 * Fallback: fetch a real road route from the public OSRM demo server.
 * Returns a GeoJSON Feature with LineString geometry matching our backend format.
 */
async function fetchOSRMRoute(start: RoutePoint, end: RoutePoint): Promise<{ route: any } | { error: string }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { error: 'OSRM request failed' };
    const data = await res.json();
    if (data?.code !== 'Ok' || !data?.routes?.length) {
      return { error: 'OSRM returned no route' };
    }
    const osrmRoute = data.routes[0];
    const coords = osrmRoute.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return { error: 'OSRM route has insufficient coordinates' };
    }
    // Package as GeoJSON Feature matching our backend format
    return {
      route: {
        type: 'Feature',
        properties: {
          distance_km: (osrmRoute.distance || 0) / 1000,
          duration_s: osrmRoute.duration || 0,
          graph_source: 'osrm_public',
          graph_mode: 'osrm_fallback',
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    };
  } catch {
    return { error: 'OSRM fallback unavailable' };
  }
}

export async function fetchRoute(start: RoutePoint, end: RoutePoint, method: 'astar' | 'dijkstra' = 'astar') {
  const path = `/api/route?start_lon=${start.lon}&start_lat=${start.lat}&end_lon=${end.lon}&end_lat=${end.lat}&method=${method}`;
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error('Failed to fetch route');
  return res.json();
}

export async function fetchBatchRouteDistances(start: RoutePoint, targets: Array<[number, number]>) {
  const res = await fetch(apiUrl('/api/route/batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_lon: start.lon,
      start_lat: start.lat,
      targets,
    }),
  });
  if (!res.ok) throw new Error('Failed to fetch batch route distances');
  return res.json();
}

export async function fetchEvacuationRoute(start: EvacPoint, end: EvacPoint, flooded_zones?: any[]) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(apiUrl('/api/routing/evacuation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end, flooded_zones }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Failed to fetch evacuation route');
    return res.json();
  } catch {
    // Backend unavailable — try OSRM fallback
    return fetchOSRMRoute(
      { lon: start.lng, lat: start.lat },
      { lon: end.lng, lat: end.lat },
    );
  }
}

export async function fetchBestRoute(start: RoutePoint, end: RoutePoint, method: 'astar' | 'dijkstra' = 'astar') {
  // Add 5-second timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Route fetch timeout after 5s')), 5000)
  );

  try {
    const direct = await Promise.race([
      fetchRoute(start, end, method),
      timeoutPromise
    ]);
    if (direct?.route) return direct;
    if (direct?.error) {
      // Primary graph failed — try evacuation route (includes OSRM fallback)
      const evac = await fetchEvacuationRoute(
        { lat: start.lat, lng: start.lon },
        { lat: end.lat, lng: end.lon }
      );
      if (evac?.route) return evac;
    }
  } catch {
    // Backend completely unreachable
  }

  // Final fallback: OSRM public API for real road routes
  const osrm = await fetchOSRMRoute(start, end);
  if ('route' in osrm) return osrm;

  return { error: 'Route computation unavailable — backend and OSRM fallback both failed.' };
}

export async function triggerRoutingWarmup() {
  const res = await fetch(apiUrl('/api/routing/warmup'), { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger routing warmup');
  return res.json();
}

export interface SimulationChunkResponse {
  event_id: string;
  event_name: string;
  version: string;
  metadata: Record<string, any>;
  cursor: number;
  limit: number;
  next_cursor: number | null;
  has_more: boolean;
  timeline: any[];
  error?: string;
}

export interface SimulationProgressiveResponse {
  event_name: string;
  version: string;
  metadata: Record<string, any>;
  timeline: any[];
  error?: string;
}

export async function fetchSimulationChunk(eventId: string, cursor = 0, limit = 12): Promise<SimulationChunkResponse> {
  const path = `/api/simulation/${eventId}/chunks?cursor=${cursor}&limit=${limit}`;
  const res = await fetch(apiUrl(path));
  if (res.ok) {
    const data = await res.json();
    if (!data?.error) return data;
  }

  // Compatibility fallback: backend without chunk endpoint
  const fullRes = await fetch(apiUrl(`/api/simulation/${eventId}`));
  if (!fullRes.ok) throw new Error('Failed to fetch simulation data');
  const full = await fullRes.json();

  const allTimeline = Array.isArray(full?.timeline) ? full.timeline : [];
  const safeCursor = Math.max(0, cursor);
  const safeLimit = Math.max(1, limit);
  const timeline = allTimeline.slice(safeCursor, safeCursor + safeLimit);
  const hasMore = safeCursor + safeLimit < allTimeline.length;

  return {
    event_id: String(full?.event_id || eventId),
    event_name: String(full?.event_name || 'Cyclone Simulation'),
    version: String(full?.version || 'v4'),
    metadata: full?.metadata || {},
    cursor: safeCursor,
    limit: safeLimit,
    next_cursor: hasMore ? safeCursor + timeline.length : null,
    has_more: hasMore,
    timeline,
  };
}

export async function fetchSimulationProgressive(eventId: string, limit = 12): Promise<SimulationProgressiveResponse> {
  let cursor = 0;
  let eventName = 'Cyclone Simulation';
  let version = 'v4';
  let metadata: Record<string, any> = {};
  const timeline: any[] = [];

  while (true) {
    const chunk = await fetchSimulationChunk(eventId, cursor, limit);
    eventName = chunk.event_name || eventName;
    version = chunk.version || version;
    metadata = chunk.metadata || metadata;
    timeline.push(...(chunk.timeline || []));
    if (!chunk.has_more || chunk.next_cursor == null) {
      break;
    }
    cursor = chunk.next_cursor;
  }

  return {
    event_name: eventName,
    version,
    metadata,
    timeline,
  };
}
