import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { FeatureCollection, Feature, Point } from 'geojson';

// ─── Religion Styling (by fclass) ───────────────────────────────
const RELIGION_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  muslim:    { color: '#22d3ee', emoji: '🕌', label: 'Mosque' },
  hindu:     { color: '#fb923c', emoji: '🛕', label: 'Hindu Temple' },
  christian: { color: '#a78bfa', emoji: '⛪', label: 'Church' },
  buddhist:  { color: '#fbbf24', emoji: '☸️', label: 'Buddhist Temple' },
};

const DEFAULT_CONFIG = { color: '#94a3b8', emoji: '🙏', label: 'Religious Place' };

function getConfig(fclass: string) {
  return RELIGION_CONFIG[fclass] || DEFAULT_CONFIG;
}

function createReligionIcon(fclass: string) {
  const cfg = getConfig(fclass);
  return L.divIcon({
    className: 'religion-marker-icon',
    html: `<div style="
      width: 20px; height: 20px; border-radius: 50%;
      background: ${cfg.color}22;
      border: 2px solid ${cfg.color};
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; line-height: 1;
      box-shadow: 0 0 6px ${cfg.color}55;
    ">${cfg.emoji}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

function buildPopupHTML(feature: Feature<Point>) {
  const props = feature.properties || {};
  const name = props.name || 'Unnamed Place of Worship';
  const fclass = props.fclass || 'muslim';
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

export function ReligiousPlacesLayer() {
  const map = useMap();
  const [clusterGroup] = useState(() =>
    L.markerClusterGroup({
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 14,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        let diameter = 36;
        if (count >= 200) { size = 'large'; diameter = 48; }
        else if (count >= 50) { size = 'medium'; diameter = 42; }

        return L.divIcon({
          html: `<div class="religion-cluster religion-cluster--${size}"><span>${count}</span></div>`,
          className: 'religion-cluster-wrapper',
          iconSize: L.point(diameter, diameter),
        });
      },
    })
  );

  useEffect(() => {
    let cancelled = false;

    fetch('/data/all_religious_places.geojson')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch religious places data');
        return res.json() as Promise<FeatureCollection>;
      })
      .then((data) => {
        if (cancelled) return;

        data.features.forEach((feature) => {
          if (feature.geometry.type !== 'Point') return;
          const [lng, lat] = (feature.geometry as Point).coordinates;
          const fclass = feature.properties?.fclass || 'muslim';

          const marker = L.marker([lat, lng], { icon: createReligionIcon(fclass) });
          marker.bindPopup(buildPopupHTML(feature as Feature<Point>), {
            className: 'religion-popup',
            closeButton: false,
            maxWidth: 240,
          });
          clusterGroup.addLayer(marker);
        });

        map.addLayer(clusterGroup);
      })
      .catch((err) => console.error('ReligiousPlacesLayer:', err));

    return () => {
      cancelled = true;
      map.removeLayer(clusterGroup);
      clusterGroup.clearLayers();
    };
  }, [map, clusterGroup]);

  return null;
}
