/**
 * useRoadTiles — High-performance viewport-based road tile loader.
 *
 * Optimizations over the initial version:
 *   1. Debounced map events (300ms) — no re-fetch on every pixel of pan
 *   2. Sub-tile support — dense tiles (Dhaka etc.) are split into quadrants
 *   3. Zoom-based feature filtering — minor roads hidden at lower zooms
 *   4. Shared manifest cache (singleton)
 *   5. Concurrent tile fetching with request deduplication
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { FeatureCollection, Feature } from 'geojson';

// ─── Types ──────────────────────────────────────────────────────
export interface TileManifest {
  cellDeg: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  rows: number;
  cols: number;
  layers: Record<string, Record<string, TileEntry>>;
}

interface TileEntry {
  features: number;
  size_kb: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  split?: boolean;
  children?: string[];
}

interface UseRoadTilesOptions {
  layer: 'all' | 'major';
  minZoom?: number;
  enabled: boolean;
}

// ─── Road class hierarchy for zoom-based filtering ──────────────
const ZOOM_ROAD_CLASSES: Record<number, Set<string>> = {
  10: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link']),
  11: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link']),
  12: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']),
  13: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'living_street', 'unclassified']),
  // 14+ = show everything
};

function getAllowedClasses(zoom: number): Set<string> | null {
  if (zoom >= 14) return null; // null = show all
  // Find the closest zoom level at or below
  const levels = Object.keys(ZOOM_ROAD_CLASSES).map(Number).sort((a, b) => a - b);
  for (let i = levels.length - 1; i >= 0; i--) {
    if (zoom >= levels[i]) return ZOOM_ROAD_CLASSES[levels[i]];
  }
  return ZOOM_ROAD_CLASSES[10];
}

// ─── Manifest Singleton ─────────────────────────────────────────
const MANIFEST_URL = '/data/road_tiles/manifest.json';
const TILE_BASE = '/data/road_tiles';

let manifestCache: TileManifest | null = null;
let manifestPromise: Promise<TileManifest> | null = null;

async function loadManifest(): Promise<TileManifest> {
  if (manifestCache) return manifestCache;
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(MANIFEST_URL)
    .then((res) => {
      if (!res.ok) throw new Error('Failed to load road tile manifest');
      return res.json() as Promise<TileManifest>;
    })
    .then((m) => {
      manifestCache = m;
      return m;
    });
  return manifestPromise;
}

// ─── Debounce utility ───────────────────────────────────────────
function useDebouncedCallback<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args: unknown[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);
}

// ─── Hook ───────────────────────────────────────────────────────
export function useRoadTiles({ layer, minZoom = 10, enabled }: UseRoadTilesOptions) {
  const map = useMap();
  const tileCache = useRef<Map<string, Feature[]>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const [visibleFeatures, setVisibleFeatures] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const manifestRef = useRef<TileManifest | null>(null);
  const prevKeyRef = useRef<string>('');

  const updateTiles = useCallback(async () => {
    if (!enabled) {
      if (prevKeyRef.current !== 'disabled') {
        setVisibleFeatures({ type: 'FeatureCollection', features: [] });
        prevKeyRef.current = 'disabled';
      }
      return;
    }

    const zoom = map.getZoom();
    if (zoom < minZoom) {
      if (prevKeyRef.current !== 'below-zoom') {
        setVisibleFeatures({ type: 'FeatureCollection', features: [] });
        prevKeyRef.current = 'below-zoom';
      }
      return;
    }

    // Load manifest
    if (!manifestRef.current) {
      try {
        manifestRef.current = await loadManifest();
      } catch {
        console.error('useRoadTiles: manifest load failed');
        return;
      }
    }
    const manifest = manifestRef.current;
    const layerTiles = manifest.layers[layer];
    if (!layerTiles) return;

    // Compute visible grid cells
    const bounds = map.getBounds();
    const { cellDeg, minLat, minLng, rows, cols } = manifest;
    const rowStart = Math.max(0, Math.floor((bounds.getSouth() - minLat) / cellDeg));
    const rowEnd = Math.min(rows - 1, Math.floor((bounds.getNorth() - minLat) / cellDeg));
    const colStart = Math.max(0, Math.floor((bounds.getWest() - minLng) / cellDeg));
    const colEnd = Math.min(cols - 1, Math.floor((bounds.getEast() - minLng) / cellDeg));

    // Resolve tiles — if a tile was split, use its children instead
    const neededKeys: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const key = `${r}_${c}`;
        const entry = layerTiles[key];
        if (!entry) continue;

        if (entry.split && entry.children?.length) {
          // Use sub-tiles — filter by viewport intersection
          for (const childKey of entry.children) {
            const childEntry = layerTiles[childKey];
            if (childEntry) {
              const cb = childEntry.bounds;
              // Check if child tile intersects viewport
              if (cb.maxLat >= bounds.getSouth() && cb.minLat <= bounds.getNorth() &&
                  cb.maxLng >= bounds.getWest() && cb.minLng <= bounds.getEast()) {
                neededKeys.push(childKey);
              }
            }
          }
        } else {
          neededKeys.push(key);
        }
      }
    }

    // Dedup and compute a stable key to avoid unnecessary state updates
    const dedupedKeys = [...new Set(neededKeys)].sort();
    const stateKey = `${layer}-${zoom}-${dedupedKeys.join(',')}`;
    if (stateKey === prevKeyRef.current) return; // nothing changed

    // Fetch tiles not yet cached
    const toFetch = dedupedKeys.filter(
      (k) => !tileCache.current.has(`${layer}/${k}`) && !loadingRef.current.has(`${layer}/${k}`)
    );

    if (toFetch.length > 0) {
      setIsLoading(true);
      // Fetch in batches of 6 to avoid overwhelming the browser
      const BATCH_SIZE = 6;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (key) => {
          const cacheKey = `${layer}/${key}`;
          loadingRef.current.add(cacheKey);
          try {
            const url = `${TILE_BASE}/${layer}/${key}.geojson`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Tile ${url} failed`);
            const fc: FeatureCollection = await res.json();
            tileCache.current.set(cacheKey, fc.features || []);
          } catch (err) {
            console.warn(`useRoadTiles: failed to load tile ${key}`, err);
            tileCache.current.set(cacheKey, []);
          } finally {
            loadingRef.current.delete(cacheKey);
          }
        }));
      }
      setIsLoading(false);
    }

    // Zoom-based feature filtering
    const allowedClasses = getAllowedClasses(zoom);

    // Merge cached features for visible tiles (with filtering)
    const merged: Feature[] = [];
    for (const key of dedupedKeys) {
      const cached = tileCache.current.get(`${layer}/${key}`);
      if (!cached) continue;
      if (allowedClasses) {
        for (const feat of cached) {
          const fclass = feat.properties?.fclass || '';
          if (allowedClasses.has(fclass)) {
            merged.push(feat);
          }
        }
      } else {
        merged.push(...cached);
      }
    }

    prevKeyRef.current = stateKey;
    setVisibleFeatures({ type: 'FeatureCollection', features: merged });
  }, [map, layer, minZoom, enabled]);

  // ── Debounced map event handler (300ms) ─────────────────────
  const debouncedUpdate = useDebouncedCallback(updateTiles, 300);

  useMapEvents({
    moveend: () => debouncedUpdate(),
    zoomend: () => debouncedUpdate(),
  });

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    updateTiles();
  }, [updateTiles]);

  // ── Cleanup on disable ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setVisibleFeatures({ type: 'FeatureCollection', features: [] });
      prevKeyRef.current = 'disabled';
    }
  }, [enabled]);

  return { data: visibleFeatures, isLoading };
}
