import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { FeatureCollection, Point } from 'geojson';
import {
  getShelterColor,
  normalizeShelter,
  type RawShelterProperties,
  type NormalizedShelter,
} from '../../types/shelter';

/* ------------------------------------------------------------------ */
/*  Phase 1: Data source                                               */
/* ------------------------------------------------------------------ */
const DATA_URL = '/data/shelters_demo_capacities_clean.geojson';

/* ------------------------------------------------------------------ */
/*  Phase 2: Status-colored marker icon                                */
/* ------------------------------------------------------------------ */
function createShelterIcon(status: string) {
  const color = getShelterColor(status);
  return L.divIcon({
    className: 'shelter-marker-icon',
    html: `<div style="
      width: 24px; height: 24px; border-radius: 50%;
      background: ${color}22;
      border: 2.5px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; line-height: 1;
      box-shadow: 0 0 10px ${color}66, 0 0 20px ${color}22;
    ">🛡️</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

/* ------------------------------------------------------------------ */
/*  Phase 2: Popup with capacity info                                  */
/* ------------------------------------------------------------------ */
function buildPopupHTML(shelter: NormalizedShelter) {
  const color = getShelterColor(shelter.status);
  const statusLabel = shelter.status === 'full' ? 'Full' : 'Open';

  return `
    <div style="font-family: 'Inter', system-ui, sans-serif; min-width: 200px; padding: 4px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; line-height: 1.3;">
        ${shelter.name}
      </div>
      <div style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: ${color}; background: ${color}18; border: 1px solid ${color}44; margin-bottom: 8px;">
        🛡️ ${statusLabel}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px;">
        <div style="padding: 4px 8px; background: #1e293b; border-radius: 4px; border: 1px solid #334155;">
          <div style="font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Total</div>
          <div style="font-size: 14px; font-weight: 700; color: #f1f5f9;">${shelter.capacityTotal}</div>
        </div>
        <div style="padding: 4px 8px; background: #1e293b; border-radius: 4px; border: 1px solid #334155;">
          <div style="font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Available</div>
          <div style="font-size: 14px; font-weight: 700; color: ${shelter.capacityAvailable > 0 ? '#22c55e' : '#ef4444'};">${shelter.capacityAvailable}</div>
        </div>
      </div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 6px;">
        📍 ${shelter.lat.toFixed(4)}°N, ${shelter.lon.toFixed(4)}°E
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function SheltersLayer() {
  const map = useMap();
  const [clusterGroup] = useState(() =>
    L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 12,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 'small';
        let diameter = 36;
        if (count >= 50) { size = 'large'; diameter = 48; }
        else if (count >= 15) { size = 'medium'; diameter = 42; }

        return L.divIcon({
          html: `<div class="shelter-cluster shelter-cluster--${size}"><span>${count}</span></div>`,
          className: 'shelter-cluster-wrapper',
          iconSize: L.point(diameter, diameter),
        });
      },
    })
  );

  useEffect(() => {
    let cancelled = false;

    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch shelter data');
        return res.json() as Promise<FeatureCollection>;
      })
      .then((data) => {
        if (cancelled) return;

        data.features.forEach((feature) => {
          if (feature.geometry.type !== 'Point') return;

          const coords = (feature.geometry as Point).coordinates as [number, number];
          const props = feature.properties as unknown as RawShelterProperties;

          /* Phase 3: normalize into clean internal shape */
          const shelter = normalizeShelter(props, coords);

          /* Phase 2: status-colored icon */
          const marker = L.marker([shelter.lat, shelter.lon], {
            icon: createShelterIcon(shelter.status),
          });

          marker.bindPopup(buildPopupHTML(shelter), {
            className: 'shelter-popup',
            closeButton: false,
            maxWidth: 260,
          });

          clusterGroup.addLayer(marker);
        });

        map.addLayer(clusterGroup);
      })
      .catch((err) => console.error('SheltersLayer:', err));

    return () => {
      cancelled = true;
      map.removeLayer(clusterGroup);
      clusterGroup.clearLayers();
    };
  }, [map, clusterGroup]);

  return null;
}
