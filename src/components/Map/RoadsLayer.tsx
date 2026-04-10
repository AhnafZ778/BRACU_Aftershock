import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';

// ─── Road Type Styling ──────────────────────────────────────────
const ROAD_STYLES: Record<string, { color: string; weight: number; label: string }> = {
  motorway:      { color: '#f59e0b', weight: 2.5, label: 'Motorway' },
  trunk:         { color: '#f97316', weight: 2.0, label: 'Trunk Road' },
  primary:       { color: '#ef4444', weight: 1.8, label: 'Primary Road' },
  secondary:     { color: '#a78bfa', weight: 1.5, label: 'Secondary Road' },
  tertiary:      { color: '#6b7280', weight: 1.2, label: 'Tertiary Road' },
};

const DEFAULT_STYLE = { color: '#475569', weight: 1.0, label: 'Road' };

function getRoadStyle(fclass: string) {
  return ROAD_STYLES[fclass] || DEFAULT_STYLE;
}

export function RoadsLayer() {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/data/major_roads_bd.geojson')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch roads data');
        return res.json() as Promise<FeatureCollection>;
      })
      .then((data) => {
        if (cancelled) return;

        const geoJsonLayer = L.geoJSON(data, {
          style: (feature) => {
            const fclass = feature?.properties?.fclass || '';
            const cfg = getRoadStyle(fclass);
            return {
              color: cfg.color,
              weight: cfg.weight,
              opacity: 0.7,
              lineCap: 'round' as const,
              lineJoin: 'round' as const,
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
      })
      .catch((err) => console.error('RoadsLayer:', err));

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  return null;
}
