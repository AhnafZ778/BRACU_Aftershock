/**
 * TakeGeoJsonLayers — Renders active Take layers as GeoJSON on the map.
 *
 * - Fetches GeoJSON per active layer, clipped to current viewport bbox
 * - Re-fetches on map move/zoom (debounced)
 * - Uses Canvas renderer for performance
 * - Supports point (circleMarker), line, and polygon geometry
 */
import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { TakeLayerDef } from '../../hooks/useTakeLayers';

interface TakeGeoJsonLayersProps {
  defs: TakeLayerDef[];
  activeIds: Set<string>;
  fetchGeoJson: (layerId: string, bbox: string) => Promise<GeoJSON.FeatureCollection | null>;
}

// Canvas renderer for performance (shared per map)
const canvasRenderers = new WeakMap<L.Map, L.Canvas>();

function getCanvasRenderer(map: L.Map): L.Canvas {
  let r = canvasRenderers.get(map);
  if (!r) {
    r = L.canvas({ padding: 0.5, tolerance: 5 });
    canvasRenderers.set(map, r);
  }
  return r;
}

function getBbox(map: L.Map): string {
  const b = map.getBounds();
  return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
}

function styleFor(def: TakeLayerDef): L.PathOptions {
  if (def.geometryKind === 'line') {
    return {
      color: def.color,
      weight: def.id === 'dhaka_roads' ? 1.0 : 1.8,
      opacity: 0.85,
    };
  }
  if (def.geometryKind === 'polygon') {
    return {
      color: def.color,
      weight: def.id === 'dhaka_buildings' ? 0.3 : 1.4,
      fillColor: def.fillColor,
      fillOpacity: def.id === 'dhaka_buildings' ? 0.12 : 0.22,
      opacity: 0.9,
    };
  }
  // point
  return {
    color: def.color,
    fillColor: def.fillColor || def.color,
    fillOpacity: 0.9,
    weight: 0.6,
    opacity: 1,
  };
}

function popupHtml(properties: Record<string, any>): string {
  const keys = ['name', 'fclass', 'adm3_name', 'adm2_name', 'adm1_name', 'boundary_name', 'type', 'population'];
  const rows = keys
    .filter((k) => properties[k] != null && properties[k] !== '')
    .map((k) => `<div style="margin:2px 0"><strong style="color:#94a3b8">${k}:</strong> <span style="color:#e2e8f0">${properties[k]}</span></div>`)
    .join('');
  return rows || '<div style="color:#94a3b8">No attributes</div>';
}

export function TakeGeoJsonLayers({ defs, activeIds, fetchGeoJson }: TakeGeoJsonLayersProps) {
  const map = useMap();
  const layersRef = useRef<Map<string, L.GeoJSON>>(new Map());
  const timerRef = useRef<number | null>(null);

  // Create a geojson layer for a definition
  const createLayer = useCallback(
    (def: TakeLayerDef): L.GeoJSON => {
      const renderer = getCanvasRenderer(map);
      return L.geoJSON([], {
        // @ts-ignore
        renderer,
        style: () => styleFor(def),
        pointToLayer: (_feature, latlng) => {
          return L.circleMarker(latlng, {
            ...styleFor(def),
            radius: 4,
          } as L.CircleMarkerOptions);
        },
        onEachFeature: (feature, layer) => {
          if (feature?.properties) {
            layer.bindPopup(
              `<div style="font-family:'Inter',system-ui,sans-serif;font-size:12px;padding:4px 2px">${popupHtml(feature.properties)}</div>`,
              { closeButton: false, maxWidth: 260 }
            );
          }
        },
      });
    },
    [map]
  );

  // Fetch data for a single layer
  const loadLayer = useCallback(
    async (def: TakeLayerDef) => {
      const bbox = getBbox(map);
      const data = await fetchGeoJson(def.id, bbox);
      const existing = layersRef.current.get(def.id);
      if (existing && data) {
        existing.clearLayers();
        existing.addData(data);
      }
    },
    [map, fetchGeoJson]
  );

  // Refresh all active layers (debounced)
  const refreshActive = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      for (const [id] of layersRef.current) {
        const def = defs.find((d) => d.id === id);
        if (def) loadLayer(def);
      }
    }, 300);
  }, [defs, loadLayer]);

  // Listen for map moves
  useEffect(() => {
    map.on('moveend', refreshActive);
    map.on('zoomend', refreshActive);
    return () => {
      map.off('moveend', refreshActive);
      map.off('zoomend', refreshActive);
    };
  }, [map, refreshActive]);

  // Sync active layers
  useEffect(() => {
    const current = layersRef.current;

    // Remove layers that are no longer active
    for (const [id, layer] of current) {
      if (!activeIds.has(id)) {
        map.removeLayer(layer);
        current.delete(id);
      }
    }

    // Add new layers
    for (const id of activeIds) {
      if (!current.has(id)) {
        const def = defs.find((d) => d.id === id);
        if (def) {
          const layer = createLayer(def);
          layer.addTo(map);
          current.set(id, layer);
          loadLayer(def);
        }
      }
    }
  }, [activeIds, defs, map, createLayer, loadLayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, layer] of layersRef.current) {
        map.removeLayer(layer);
      }
      layersRef.current.clear();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [map]);

  return null;
}
