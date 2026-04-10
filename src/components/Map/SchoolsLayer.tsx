import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import type { FeatureCollection, Feature, Point } from 'geojson';

// ─── Category Styling ───────────────────────────────────────────
const FCLASS_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  school:     { color: '#3b82f6', emoji: '🏫', label: 'School' },
  college:    { color: '#8b5cf6', emoji: '🎓', label: 'College' },
  university: { color: '#f59e0b', emoji: '🏛️', label: 'University' },
};

const DEFAULT_CONFIG = { color: '#6b7280', emoji: '📍', label: 'Education' };

function getConfig(fclass: string) {
  return FCLASS_CONFIG[fclass] || DEFAULT_CONFIG;
}

// ─── Custom Marker Icon ─────────────────────────────────────────
function createSchoolIcon(fclass: string) {
  const cfg = getConfig(fclass);
  return L.divIcon({
    className: 'school-marker-icon',
    html: `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: ${cfg.color}22;
      border: 2px solid ${cfg.color};
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; line-height: 1;
      box-shadow: 0 0 8px ${cfg.color}66;
    ">${cfg.emoji}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

// ─── Popup HTML ─────────────────────────────────────────────────
function buildPopupHTML(feature: Feature<Point>) {
  const props = feature.properties || {};
  const name = props.name || 'Unnamed Institution';
  const fclass = props.fclass || 'school';
  const cfg = getConfig(fclass);
  const [lng, lat] = feature.geometry.coordinates;

  return `
    <div style="font-family: 'Inter', system-ui, sans-serif; min-width: 180px; padding: 4px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; line-height: 1.3;">
        ${name}
      </div>
      <div style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: ${cfg.color}; background: ${cfg.color}18; border: 1px solid ${cfg.color}44; margin-bottom: 8px;">
        ${cfg.emoji} ${cfg.label}
      </div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 6px;">
        📍 ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E
      </div>
    </div>
  `;
}

// ─── Component ──────────────────────────────────────────────────
export function SchoolsLayer() {
  const map = useMap();
  const [clusterGroup] = useState(() =>
    L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 14,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        let diameter = 36;
        if (count >= 100) { size = 'large'; diameter = 48; }
        else if (count >= 30) { size = 'medium'; diameter = 42; }

        return L.divIcon({
          html: `<div class="school-cluster school-cluster--${size}"><span>${count}</span></div>`,
          className: 'school-cluster-wrapper',
          iconSize: L.point(diameter, diameter),
        });
      },
    })
  );

  useEffect(() => {
    let cancelled = false;

    fetch('/data/schools_bd.geojson')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch schools data');
        return res.json() as Promise<FeatureCollection>;
      })
      .then((data) => {
        if (cancelled) return;

        data.features.forEach((feature) => {
          if (feature.geometry.type !== 'Point') return;
          const [lng, lat] = (feature.geometry as Point).coordinates;
          const fclass = feature.properties?.fclass || 'school';

          const marker = L.marker([lat, lng], { icon: createSchoolIcon(fclass) });
          marker.bindPopup(buildPopupHTML(feature as Feature<Point>), {
            className: 'school-popup',
            closeButton: false,
            maxWidth: 240,
          });
          clusterGroup.addLayer(marker);
        });

        map.addLayer(clusterGroup);
      })
      .catch((err) => console.error('SchoolsLayer:', err));

    return () => {
      cancelled = true;
      map.removeLayer(clusterGroup);
      clusterGroup.clearLayers();
    };
  }, [map, clusterGroup]);

  return null;
}
