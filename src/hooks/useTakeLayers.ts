/**
 * useTakeLayers — Fetches layer definitions from the Take server
 * and manages GeoJSON data fetching per active layer + viewport.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface TakeLayerDef {
  id: string;
  label: string;
  category: string;
  geometryKind: 'point' | 'line' | 'polygon';
  color: string;
  fillColor: string;
  defaultVisible: boolean;
  maxFeatures: number;
}

export interface TakeLayerState {
  defs: TakeLayerDef[];
  activeIds: Set<string>;
  loading: boolean;
  error: string | null;
  toggle: (id: string) => void;
  setActive: (id: string, active: boolean) => void;
  fetchGeoJson: (layerId: string, bbox: string) => Promise<GeoJSON.FeatureCollection | null>;
}

const API_BASE = '/api/take';

// Only keep relevant layers for the dashboard
const RELEVANT_LAYERS = new Set([
  'dhaka_waterways',       // Waterways
  'dhaka_risk_waterways',  // Drains / Canals / Rivers
  'dhaka_water',           // Water Bodies
  'dhaka_landuse',         // Landuse (forests, parks, etc.)
  'dhaka_buildings',       // Buildings
]);

export function useTakeLayers(): TakeLayerState {
  const [defs, setDefs] = useState<TakeLayerDef[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Fetch layer definitions on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch(`${API_BASE}/layers`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load layers (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const allLayers: TakeLayerDef[] = data.layers || [];
        const layers = allLayers.filter((l) => RELEVANT_LAYERS.has(l.id));
        setDefs(layers);
        // Activate default-visible layers
        const defaults = new Set(
          layers.filter((l) => l.defaultVisible).map((l) => l.id)
        );
        setActiveIds(defaults);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('[Take] Layer metadata fetch failed:', err.message);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggle = useCallback((id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const setActive = useCallback((id: string, active: boolean) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const fetchGeoJson = useCallback(
    async (layerId: string, bbox: string): Promise<GeoJSON.FeatureCollection | null> => {
      try {
        const url = `${API_BASE}/geojson?layer=${encodeURIComponent(layerId)}&bbox=${encodeURIComponent(bbox)}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    []
  );

  return { defs, activeIds, loading, error, toggle, setActive, fetchGeoJson };
}
