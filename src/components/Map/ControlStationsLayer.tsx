import { useEffect, useState } from 'react';
import L from 'leaflet';
import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Marker, Tooltip } from 'react-leaflet';
import { useSimulationStore } from '../../store/useSimulationStore';

/* ------------------------------------------------------------------ */
/*  Danger Level Definitions (Shared with Honeycomb)                   */
/* ------------------------------------------------------------------ */
interface DangerLevel {
  level: number;
  label: string;
  color: string;
  maxDistKm: number;
}

const DANGER_LEVELS: DangerLevel[] = [
  { level: 1, label: 'Critical',  color: '#dc2626', maxDistKm: 30  },
  { level: 2, label: 'High',      color: '#f97316', maxDistKm: 80  },
  { level: 3, label: 'Moderate',  color: '#eab308', maxDistKm: 150 },
  { level: 4, label: 'Low',       color: '#84cc16', maxDistKm: 250 },
  { level: 5, label: 'Safe',      color: '#22c55e', maxDistKm: Infinity },
];

function getDangerLevel(distKm: number): DangerLevel {
  for (const dl of DANGER_LEVELS) {
    if (distKm <= dl.maxDistKm) return dl;
  }
  return DANGER_LEVELS[DANGER_LEVELS.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Coastline Extraction                                               */
/* ------------------------------------------------------------------ */
function extractCoastline(borderFC: FeatureCollection): Feature<LineString> | null {
  try {
    const feature = borderFC.features[0];
    if (!feature) return null;

    const geom = feature.geometry;
    let allCoords: number[][][] = [];

    if (geom.type === 'Polygon') {
      allCoords = (geom as Polygon).coordinates;
    } else if (geom.type === 'MultiPolygon') {
      (geom as MultiPolygon).coordinates.forEach(poly => {
        allCoords.push(...poly);
      });
    }

    const coastalPoints: number[][] = [];
    for (const ring of allCoords) {
      for (const coord of ring) {
        if (coord[1] < 22.5) {
          coastalPoints.push(coord);
        }
      }
    }

    if (coastalPoints.length < 2) return null;
    coastalPoints.sort((a, b) => a[0] - b[0]);
    return turf.lineString(coastalPoints);
  } catch (e) {
    console.error('ControlStationsLayer: Failed to extract coastline:', e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Grid Generation — Thana Replacement                                */
/* ------------------------------------------------------------------ */
export interface ControlStation {
  id: number;
  index: number;
  lat: number;
  lng: number;
  dangerLevel: number;
  dangerLabel: string;
  distanceToCoast: number;
}

function generateControlStations(
  borderFC: FeatureCollection,
  coastline: Feature<LineString>,
  gridSpacingKm: number = 20
): ControlStation[] {
  const countryBbox = turf.bbox(borderFC) as [number, number, number, number];
  
  // Create a uniform grid of points
  const pointGrid = turf.pointGrid(countryBbox, gridSpacingKm, { units: 'kilometers' });
  
  const borderFeature = borderFC.features[0] as Feature<Polygon | MultiPolygon>;
  if (!borderFeature) return [];

  const stations: ControlStation[] = [];
  let stationIndex = 1;

  for (const point of pointGrid.features) {
    // 1. Must be inside Bangladesh
    if (!turf.booleanPointInPolygon(point.geometry.coordinates, borderFeature)) {
      continue;
    }

    // 2. Calculate distance and danger level
    const nearest = turf.nearestPointOnLine(coastline, point, { units: 'kilometers' });
    const distKm = nearest.properties.dist ?? 0;
    const danger = getDangerLevel(distKm);

    // 3. Filter: Only place stations in Danger Levels 1-4 (exclude Safe zones)
    if (danger.level >= 5) {
      continue;
    }

    stations.push({
      id: stationIndex, // Unique ID
      index: stationIndex, // Sequential display index
      lng: point.geometry.coordinates[0],
      lat: point.geometry.coordinates[1],
      dangerLevel: danger.level,
      dangerLabel: danger.label,
      distanceToCoast: Math.round(distKm)
    });

    stationIndex++;
  }

  return stations;
}



/* ------------------------------------------------------------------ */
/*  React Component                                                    */
/* ------------------------------------------------------------------ */
export function ControlStationsLayer() {
  const [stations, setStations] = useState<ControlStation[]>([]);
  const isLoaded = useSimulationStore(s => s.isLoaded);
  const zoneStatuses = useSimulationStore(s => s.zoneStatuses);
  const pendingApprovals = useSimulationStore(s => s.pendingApprovals);
  const buzzerActive = useSimulationStore(s => s.buzzerActive);

  const createStatusIcon = (index: number, level: number) => {
    let bgColor = '#9333ea'; // Default Purple
    let content = index;
    let extraStyle = '';
    
    if (isLoaded) {
      const status = zoneStatuses[level];
      const isPending = pendingApprovals[level];
      const isBuzzing = buzzerActive[level];
      
      if (status === 'CRITICAL') {
        bgColor = '#ef4444'; // Red
        if (isBuzzing) {
          content = `<span class="buzzer-active text-base">🔔</span>` as any;
          extraStyle = `box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); border-color: #fca5a5;`;
        }
      } else if (status === 'WATCH') {
        bgColor = '#f59e0b'; // Amber
        if (isPending) {
          content = `<span class="text-xs">⚠️</span>` as any;
          extraStyle = `box-shadow: 0 0 15px rgba(245, 158, 11, 0.7);`;
        }
      } else {
        // Safe/Offline
        bgColor = '#64748b'; // Slate (dimmed)
        extraStyle = `opacity: 0.6;`;
      }
    }

    return L.divIcon({
      className: 'custom-control-station-marker',
      html: `
        <div style="
          background-color: ${bgColor}; 
          width: 28px; 
          height: 28px; 
          border-radius: 50%; 
          border: 2px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 11px;
          transition: all 0.3s;
          ${extraStyle}
        ">
          ${content}
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  useEffect(() => {
    fetch('/bangladesh_simplified.json')
      .then(res => res.json())
      .then(data => {
        const borderData = data as FeatureCollection;
        const coast = extractCoastline(borderData);
        if (!coast) return;

        // Generate stations every ~22km to visually simulate thana density
        const generated = generateControlStations(borderData, coast, 22);
        setStations(generated);
      })
      .catch(err => console.error('ControlStationsLayer:', err));
  }, []);

  if (stations.length === 0) return null;

  return (
    <MarkerClusterGroup
      chunkedLoading
      // Purple cluster icon
      iconCreateFunction={(cluster: any) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="
            background-color: rgba(147, 51, 234, 0.9);
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            border: 2px solid rgba(255,255,255,0.5);
            box-shadow: 0 0 15px rgba(147, 51, 234, 0.5);
          ">${count}</div>`,
          className: 'custom-cluster-icon',
          iconSize: [36, 36],
        });
      }}
    >
      {stations.map(station => {
        const level = station.dangerLevel;
        const status = isLoaded ? zoneStatuses[level] : 'SAFE';
        const isPending = isLoaded && pendingApprovals[level];
        const isBuzzing = isLoaded && buzzerActive[level];
        
        return (
          <Marker 
            key={`station-${station.id}`} 
            position={[station.lat, station.lng]}
            icon={createStatusIcon(station.index, level)}
          >
            <Tooltip direction="top" offset={[0, -15]} opacity={1}>
              <div className="font-sans px-1">
                <div className={`text-xs font-bold mb-1 ${status === 'CRITICAL' ? 'text-red-600' : status === 'WATCH' ? 'text-amber-600' : 'text-purple-600'}`}>
                  Control Station #{station.index}
                </div>
                {isLoaded ? (
                  <div className="text-[10px] text-slate-700 font-bold mb-1">
                    State: <span className={status === 'CRITICAL' ? 'text-red-500' : status === 'WATCH' ? 'text-amber-500' : 'text-green-500'}>{status}</span>
                  </div>
                ) : null}
                <div className="text-[10px] text-slate-600">
                  Zone: <span className="font-semibold">{station.dangerLabel} (Level {station.dangerLevel})</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Distance to coast: ~{station.distanceToCoast} km
                </div>
                {isBuzzing && (
                  <div className="mt-1 text-[10px] font-bold text-red-500 flex items-center gap-1">
                    <span className="buzzer-active">🔔</span> ALARM ACTIVE
                  </div>
                )}
                {isPending && (
                  <div className="mt-1 text-[10px] font-bold text-amber-500 flex items-center gap-1">
                    <span>⚠️</span> AWAITING APPROVAL
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}
