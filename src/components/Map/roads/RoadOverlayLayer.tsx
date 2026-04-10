/**
 * RoadOverlayLayer — High-performance unified road overlay.
 *
 * Key optimizations:
 *   1. **Canvas renderer** — renders to a single <canvas> instead of creating
 *      a DOM element per feature (10,000+ DOM nodes → 1 canvas element)
 *   2. **Zoom-based filtering** — minor roads hidden at lower zooms
 *   3. **Debounced tile loading** — via useRoadTiles hook
 *   4. **Sub-tile support** — dense areas (Dhaka) use 4x smaller tiles
 *   5. **Interactive popups preserved** — Canvas renderer supports click events
 */
import { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAppStore } from '../../../store/useAppStore';
import { useRoadTiles } from './useRoadTiles';

// ─── Road Type Styling (Bold dark colors for white map) ─────────
const ROAD_STYLES: Record<string, { color: string; weight: number; label: string }> = {
  motorway:       { color: '#b91c1c', weight: 3.5, label: 'Motorway' },
  motorway_link:  { color: '#b91c1c', weight: 2.5, label: 'Motorway Link' },
  trunk:          { color: '#c2410c', weight: 3.0, label: 'Trunk Road' },
  trunk_link:     { color: '#c2410c', weight: 2.0, label: 'Trunk Link' },
  primary:        { color: '#0369a1', weight: 2.5, label: 'Primary Road' },
  primary_link:   { color: '#0369a1', weight: 1.8, label: 'Primary Link' },
  secondary:      { color: '#4338ca', weight: 2.0, label: 'Secondary Road' },
  secondary_link: { color: '#4338ca', weight: 1.5, label: 'Secondary Link' },
  tertiary:       { color: '#374151', weight: 1.6, label: 'Tertiary Road' },
  tertiary_link:  { color: '#374151', weight: 1.2, label: 'Tertiary Link' },
  residential:    { color: '#4b5563', weight: 1.2, label: 'Residential' },
  living_street:  { color: '#6b7280', weight: 1.0, label: 'Living Street' },
  unclassified:   { color: '#6b7280', weight: 0.9, label: 'Unclassified' },
  service:        { color: '#9ca3af', weight: 0.8, label: 'Service Road' },
  track:          { color: '#78350f', weight: 0.8, label: 'Track' },
  path:           { color: '#a3a3a3', weight: 0.6, label: 'Path' },
  footway:        { color: '#d4d4d4', weight: 0.5, label: 'Footway' },
  cycleway:       { color: '#0e7490', weight: 0.7, label: 'Cycleway' },
};

const DEFAULT_STYLE = { color: '#6b7280', weight: 0.8, label: 'Road' };

function getRoadStyle(fclass: string) {
  return ROAD_STYLES[fclass] || DEFAULT_STYLE;
}

// ─── Canvas Renderer (singleton per map) ────────────────────────
// Using Canvas instead of SVG is 10-50x faster for dense feature sets.
// SVG creates a DOM element per feature; Canvas draws to a single bitmap.
const canvasRenderers = new WeakMap<L.Map, L.Canvas>();

function getCanvasRenderer(map: L.Map): L.Canvas {
  let renderer = canvasRenderers.get(map);
  if (!renderer) {
    renderer = L.canvas({ padding: 0.5, tolerance: 5 });
    canvasRenderers.set(map, renderer);
  }
  return renderer;
}

// ─── Component ──────────────────────────────────────────────────
export function RoadOverlayLayer() {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const { showRoads, showAllRoads } = useAppStore();

  const activeLayer = showAllRoads ? 'all' : 'major';
  const enabled = showRoads || showAllRoads;

  const { data } = useRoadTiles({
    layer: activeLayer as 'all' | 'major',
    minZoom: 10,
    enabled,
  });

  // Stable key to prevent unnecessary re-renders
  const dataKey = useMemo(
    () => `${activeLayer}-${data.features.length}`,
    [activeLayer, data.features.length]
  );

  useEffect(() => {
    // Remove previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!enabled || data.features.length === 0) return;

    // Get or create the shared canvas renderer
    const canvasRenderer = getCanvasRenderer(map);

    const geoJsonLayer = L.geoJSON(data, {
      // @ts-ignore - Leaflet types are missing the renderer option for GeoJSON Options
      renderer: canvasRenderer, // ← THE key optimization
      style: (feature) => {
        const fclass = feature?.properties?.fclass || '';
        const cfg = getRoadStyle(fclass);
        return {
          color: cfg.color,
          weight: cfg.weight,
          opacity: 0.85,
          lineCap: 'round' as const,
          lineJoin: 'round' as const,
          interactive: true, // needed for Canvas click events
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const name = props.name || 'Unnamed Road';
        const fclass = props.fclass || 'road';
        const cfg = getRoadStyle(fclass);
        const ref = props.ref ? ` (${props.ref})` : '';

        layer.bindPopup(`
          <div style="font-family: 'Inter', system-ui, sans-serif; min-width: 160px; padding: 4px 0;">
            <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; line-height: 1.3;">
              ${name}${ref}
            </div>
            <div style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: ${cfg.color}; background: ${cfg.color}18; border: 1px solid ${cfg.color}44;">
              🛣️ ${cfg.label}
            </div>
            ${props.maxspeed ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 6px;">🚗 Max speed: ${props.maxspeed} km/h</div>` : ''}
          </div>
        `, {
          className: 'road-popup',
          closeButton: false,
          maxWidth: 240,
        });
      },
    });

    layerRef.current = geoJsonLayer;
    geoJsonLayer.addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, dataKey, enabled, showAllRoads, data]);

  return null;
}
