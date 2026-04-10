import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { 
  AlertTriangle, 
  AlertCircle, 
  Activity, 
  Layers, 
  Building2, 
  ChevronLeft, 
  ChevronRight,
  X
} from 'lucide-react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap, useMapEvents, Polyline, Circle, Rectangle } from 'react-leaflet';
import * as turf from '@turf/turf';
import InfrastructureAnalyzer from '../components/ControlPanel/InfrastructureAnalyzer';
import type { ImpactedInfra, CapAutomationDraft } from '../components/ControlPanel/InfrastructureAnalyzer';
import { CycloneTrackLayer } from '../components/Map/CycloneTrackLayer';
import { CopilotForecastLayer } from '../components/Map/CopilotForecastLayer';
import NGOManager from '../components/ControlPanel/NGOManager';
import AIAssistantHub from '../components/AIAssistant/AIAssistantHub';
import { useTelemetryStore } from '../store/useTelemetryStore';

let majorRoadsCache: any | null = null;

function withZoneCircleCenter(feature: any) {
  if (!feature?.geometry) return feature;
  const existingCenter = feature?.properties?.zoneCircleCenter;
  if (Array.isArray(existingCenter) && existingCenter.length === 2) {
    const lon = Number(existingCenter[0]);
    const lat = Number(existingCenter[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) return feature;
  }
  const center = turf.centroid(feature).geometry.coordinates;
  return {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      zoneCircleCenter: [center[0], center[1]], // [lon, lat]
    },
  };
}

function getZoneBaseName(feature: any): string {
  return String(
    feature?.properties?.localityName ||
      feature?.properties?.NAME_3 ||
      feature?.properties?.NAME_2 ||
      feature?.properties?.localityCode ||
      'Zone',
  );
}

function getZoneControlKey(feature: any, fallbackIndex: number): string {
  const p = feature?.properties || {};
  return String(p.hexId || p.controlPanelKey || `${p.localityCode || p.localityName || 'zone'}-${fallbackIndex}`);
}

function annotateZonesForControlPanel(features: any[]): any[] {
  const labelCounter = new Map<string, number>();

  return (features || []).map((feat: any, idx: number) => {
    const zone = withZoneCircleCenter(feat);
    const baseName = getZoneBaseName(zone);
    const nextLabelIndex = (labelCounter.get(baseName) || 0) + 1;
    labelCounter.set(baseName, nextLabelIndex);

    const controlKey = getZoneControlKey(zone, idx);
    return {
      ...zone,
      properties: {
        ...(zone?.properties || {}),
        controlPanelKey: controlKey,
        controlPanelBaseName: baseName,
        controlPanelLabel: `${baseName}-${nextLabelIndex}`,
      },
    };
  });
}

function isValidLatLng(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function parseLonLatFromFeature(feature: any): { lon: number; lat: number } | null {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!isValidLatLng(lat, lon)) return null;
  return { lon, lat };
}

class ControlPanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown render error',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[ControlPanelErrorBoundary] Render crash:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-200 p-6">
          <div className="max-w-xl w-full rounded-xl border border-red-500/30 bg-red-500/10 p-5">
            <h3 className="text-base font-bold text-red-300">Control Panel Recovered From An Error</h3>
            <p className="text-sm text-slate-300 mt-2">A runtime UI error was caught to prevent a white screen.</p>
            <p className="text-xs text-slate-400 mt-2 break-all">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 px-3 py-1.5 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700"
            >
              Retry Render
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function normalizeClusterId(id: unknown): string {
  return String(id ?? '');
}

function buildClusterRectangleFeature(zone: any) {
  if (!zone?.geometry) return null;
  try {
    const b = turf.bbox(zone.geometry as any);
    return {
      type: 'Feature',
      properties: {
        id: zone.id,
        severity: String(zone.severity || 'moderate').toLowerCase(),
        agent_count: Number(zone.agent_count || 0),
        priority_score: Number(zone.priority_score || 0),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [b[0], b[1]],
          [b[2], b[1]],
          [b[2], b[3]],
          [b[0], b[3]],
          [b[0], b[1]],
        ]],
      },
    };
  } catch {
    return null;
  }
}

function translatePolygonFeature(feature: any, deltaLon: number, deltaLat: number) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return feature;

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: coords.map((ring: any) =>
        Array.isArray(ring)
          ? ring.map((pt: any) => {
              if (!Array.isArray(pt) || pt.length < 2) return pt;
              return [Number(pt[0]) + deltaLon, Number(pt[1]) + deltaLat];
            })
          : ring,
      ),
    },
  };
}

type DispatchAreaSelection = {
  bbox: { west: number; south: number; east: number; north: number };
  center: { lat: number; lon: number };
  polygon: [number, number][];
  areaKm2: number;
};


function BoundsUpdater({ bounds, focusedBounds, localityCode }: { bounds: any; focusedBounds: any | null; localityCode: string }) {
  const map = useMap();
  const lastLocality = useRef<string>('');

  useEffect(() => {
    // Only fit to general bounds when the locality (zone) actually changes
    if (localityCode !== lastLocality.current) {
      map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.5 });
      lastLocality.current = localityCode;
    }
    
    // Always fit to focused bounds (specific point/route) if they are provided
    if (focusedBounds) {
      map.fitBounds(focusedBounds, { padding: [60, 60], animate: true, duration: 1 });
    }
  }, [bounds, focusedBounds, map, localityCode]);

  return null;
}

function MarqueeSelector({
  enabled,
  onAreaChange,
}: {
  enabled: boolean;
  onAreaChange: (area: DispatchAreaSelection | null) => void;
}) {
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);

  const map = useMap();

  // When marquee is enabled, disable map panning/zooming so the user can draw without the map moving.
  // Re-enable interactions when marquee is turned off or component unmounts.
  useEffect(() => {
    if (!map) return;
    try {
      if (enabled) {
        map.dragging.disable();
        if (map.touchZoom) map.touchZoom.disable();
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.boxZoom) map.boxZoom.disable();
      } else {
        map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.boxZoom) map.boxZoom.enable();
      }
    } catch (err) {
      // fail silently; map instance may not support some handlers in testing
    }

    return () => {
      try {
        map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.boxZoom) map.boxZoom.enable();
      } catch (err) {}
    };
  }, [enabled, map]);

  useMapEvents({
    mousedown: (e) => {
      if (!enabled) return;
      setStart({ lat: e.latlng.lat, lng: e.latlng.lng });
      setCursor({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mousemove: (e) => {
      if (!enabled || !start) return;
      setCursor({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mouseup: (e) => {
      if (!enabled || !start) return;
      const end = { lat: e.latlng.lat, lng: e.latlng.lng };

      const south = Math.min(start.lat, end.lat);
      const north = Math.max(start.lat, end.lat);
      const west = Math.min(start.lng, end.lng);
      const east = Math.max(start.lng, end.lng);

      const latSpan = Math.abs(north - south);
      const lonSpan = Math.abs(east - west);
      if (latSpan < 0.0002 || lonSpan < 0.0002) {
        setStart(null);
        setCursor(null);
        return;
      }

      const polygonCoords: [number, number][] = [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ];

      const poly = turf.polygon([polygonCoords]);
      const center = turf.centroid(poly).geometry.coordinates;
      const areaKm2 = turf.area(poly) / 1_000_000;

      onAreaChange({
        bbox: { west, south, east, north },
        center: { lat: Number(center[1]), lon: Number(center[0]) },
        polygon: polygonCoords,
        areaKm2,
      });

      setStart(null);
      setCursor(null);
    },
    contextmenu: () => {
      if (!enabled) return;
      setStart(null);
      setCursor(null);
      onAreaChange(null);
    },
  });

  if (!enabled || !start || !cursor) return null;

  const bounds: [[number, number], [number, number]] = [
    [Math.min(start.lat, cursor.lat), Math.min(start.lng, cursor.lng)],
    [Math.max(start.lat, cursor.lat), Math.max(start.lng, cursor.lng)],
  ];

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.12,
        dashArray: '6, 4',
        weight: 2,
        opacity: 0.95,
      }}
    />
  );
}

function MiniMap({
  feature,
  contextZones,
  selectedZoneKey,
  impactedInfra,
  focusedPoint,
  focusedRoute,
  rescueZones,
  showRescueClusters,
  selectedRescueClusterId,
  onRescueClusterSelect,
  dispatchArea,
  isMarqueeEnabled,
  onDispatchAreaChange,
}: {
  feature: any;
  contextZones: any[];
  selectedZoneKey: string | null;
  impactedInfra: ImpactedInfra | null;
  focusedPoint: any | null;
  focusedRoute: any | null;
  rescueZones: any[];
  showRescueClusters: boolean;
  selectedRescueClusterId: string | null;
  onRescueClusterSelect: (clusterId: string) => void;
  dispatchArea: DispatchAreaSelection | null;
  isMarqueeEnabled: boolean;
  onDispatchAreaChange: (area: DispatchAreaSelection | null) => void;
}) {
  const { timeline, currentStep } = useSimulationStore();
  const [majorRoads, setMajorRoads] = useState<any | null>(majorRoadsCache);
  const zoneCentroid = useMemo(() => turf.centroid(feature).geometry.coordinates, [feature]);
  
  // Calculate encompassing radius for the zone
  const encompassingRadius = useMemo(() => {
    try {
      const bbox = turf.bbox(feature);
      const ne = turf.point([bbox[2], bbox[3]]);
      const center = turf.point([zoneCentroid[0], zoneCentroid[1]]);
      const distanceKm = turf.distance(center, ne, { units: 'kilometers' });
      return distanceKm * 1200; // Slightly enlarged zone extent (was 1000)
    } catch {
      return 6000; // Slightly larger fallback radius in meters
    }
  }, [feature, zoneCentroid]);

  const selectedNodeRadius = useMemo(
    () => Math.max(900, Math.min(encompassingRadius * 0.35, 5000)),
    [encompassingRadius],
  );

  const extractRouteCoordinatePairs = (route: any): any[] => {
    if (!route) return [];

    const featureLike = route?.type === 'Feature' ? route : route?.route?.type === 'Feature' ? route.route : null;
    const geometry = featureLike?.geometry || route?.geometry || null;

    if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates;
    }

    if (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates.flatMap((segment: any) => (Array.isArray(segment) ? segment : []));
    }

    if (route?.type === 'FeatureCollection' && Array.isArray(route.features)) {
      const line = route.features.find((f: any) => f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString');
      if (line?.geometry?.type === 'LineString' && Array.isArray(line.geometry.coordinates)) return line.geometry.coordinates;
      if (line?.geometry?.type === 'MultiLineString' && Array.isArray(line.geometry.coordinates)) {
        return line.geometry.coordinates.flatMap((segment: any) => (Array.isArray(segment) ? segment : []));
      }
    }

    if (Array.isArray(route?.coordinates)) return route.coordinates;
    return [];
  };

  const normalizeRouteCoordPair = (pair: any): [number, number] | null => {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    // Candidate 1: [lon, lat]
    const c1Lat = b;
    const c1Lon = a;
    if (isValidLatLng(c1Lat, c1Lon)) return [c1Lat, c1Lon];

    // Candidate 2: [lat, lon]
    const c2Lat = a;
    const c2Lon = b;
    if (isValidLatLng(c2Lat, c2Lon)) return [c2Lat, c2Lon];

    return null;
  };
  
  const highlightedRoutePositions = useMemo(() => {
    const coords = extractRouteCoordinatePairs(focusedRoute);
    if (!Array.isArray(coords) || coords.length < 2) return null;

    const normalized = coords
      .map((c: any) => normalizeRouteCoordPair(c))
      .filter((c: [number, number] | null): c is [number, number] => Array.isArray(c));

    return normalized.length >= 2 ? normalized : null;
  }, [focusedRoute]);

  const highlightedRouteStart = highlightedRoutePositions?.[0] || null;
  const highlightedRouteEnd = highlightedRoutePositions?.[highlightedRoutePositions.length - 1] || null;
  const focusedTargetLatLng = useMemo(() => parseLonLatFromFeature(focusedPoint), [focusedPoint]);

  const rescueClusterRectangles = useMemo(() => {
    const raw = (rescueZones || [])
      .map((z) => ({ zone: z, rect: buildClusterRectangleFeature(z) }))
      .filter((x) => x.rect);

    if (!raw.length) return raw;

    // Demo remap: project live telemetry rectangle formation onto selected control-panel zone.
    const allRects = turf.featureCollection(raw.map((x: any) => x.rect));
    const b = turf.bbox(allRects);
    const telemetryAnchor: [number, number] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const zoneAnchor: [number, number] = [Number(zoneCentroid[0]), Number(zoneCentroid[1])];

    const deltaLon = zoneAnchor[0] - telemetryAnchor[0];
    const deltaLat = zoneAnchor[1] - telemetryAnchor[1];

    return raw.map((x: any) => ({
      zone: x.zone,
      rect: translatePolygonFeature(x.rect, deltaLon, deltaLat),
    }));
  }, [rescueZones, zoneCentroid]);

  useEffect(() => {
    let cancelled = false;
    if (majorRoadsCache) return;

    const loadRoads = async () => {
      try {
        const res = await fetch('/data/major_roads_bd.geojson');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          majorRoadsCache = data;
          setMajorRoads(data);
        }
      } catch {
        // Silent fail: roads layer is optional visual context.
      }
    };

    loadRoads();
    return () => {
      cancelled = true;
    };
  }, []);

  const predictedDirectionDeg = useMemo(() => {
    const current = timeline[currentStep] as any;
    const next = timeline[currentStep + 1] as any;

    const currentCenter = current?.storm_center;
    const nextCenter = next?.storm_center;

    if (Array.isArray(currentCenter) && currentCenter.length === 2 && Array.isArray(nextCenter) && nextCenter.length === 2) {
      const from = turf.point([currentCenter[1], currentCenter[0]]);
      const to = turf.point([nextCenter[1], nextCenter[0]]);
      const bearing = turf.bearing(from, to);
      return (bearing + 360) % 360;
    }

    return Number(current?.storm_heading_deg ?? 0);
  }, [timeline, currentStep]);


  const focusedBounds = useMemo(() => {
    if (!focusedPoint && !focusedRoute) return null;
    try {
      if (highlightedRoutePositions && highlightedRoutePositions.length >= 2) {
        const line = turf.lineString(highlightedRoutePositions.map(([lat, lon]) => [lon, lat]));
        const b = turf.bbox(line);
        if ([b[0], b[1], b[2], b[3]].every((n) => Number.isFinite(Number(n)))) {
          return [
            [b[1], b[0]],
            [b[3], b[2]],
          ] as [number, number][];
        }
      }

      if (focusedRoute) {
        const b = turf.bbox(focusedRoute);
        if ([b[0], b[1], b[2], b[3]].every((n) => Number.isFinite(Number(n)))) {
          return [
            [b[1], b[0]],
            [b[3], b[2]],
          ] as [number, number][];
        }
      }

      const ptCoords = focusedPoint?.geometry?.coordinates;
      if (!Array.isArray(ptCoords) || ptCoords.length < 2) return null;
      const lon = Number(ptCoords[0]);
      const lat = Number(ptCoords[1]);
      if (!isValidLatLng(lat, lon)) return null;

      const line = turf.lineString([zoneCentroid, [lon, lat]]);
      const b = turf.bbox(line);
      if (![b[0], b[1], b[2], b[3]].every((n) => Number.isFinite(Number(n)))) return null;

      return [
        [b[1], b[0]],
        [b[3], b[2]],
      ] as [number, number][];
    } catch {
      return null;
    }
  }, [focusedPoint, focusedRoute, zoneCentroid, highlightedRoutePositions]);

  const bounds = useMemo(() => {
    let collection = contextZones?.length ? [...contextZones] : [feature];
    if (impactedInfra) {
      if (impactedInfra.schools?.length) collection = collection.concat(impactedInfra.schools);
      if (impactedInfra.hospitals?.length) collection = collection.concat(impactedInfra.hospitals);
      if (impactedInfra.mosques?.length) collection = collection.concat(impactedInfra.mosques);
      if (impactedInfra.shelters?.length) collection = collection.concat(impactedInfra.shelters);
      if (impactedInfra.volunteers?.length) collection = collection.concat(impactedInfra.volunteers);
    }
    const fc = turf.featureCollection(collection);
    const b = turf.bbox(fc);
    return [
      [b[1], b[0]], 
      [b[3], b[2]]  
    ] as [number, number][];
  }, [feature, contextZones, impactedInfra]);

  return (
    <MapContainer
      key={feature.properties.controlPanelKey || feature.properties.localityCode}
      bounds={bounds}
      boundsOptions={{ padding: [40, 40] }}
      zoomControl={true}
      dragging={true}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      className="w-full h-full z-0"
      style={{ background: '#fff' }}
    >
      <BoundsUpdater bounds={bounds} focusedBounds={focusedBounds} localityCode={String(feature.properties.controlPanelKey || feature.properties.localityCode || '')} />
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />

      {contextZones?.map((zone: any, idx: number) => {
        const zoneKey = String(zone?.properties?.controlPanelKey || `context-zone-${idx}`);
        const isSelected = zoneKey === selectedZoneKey;
        const zoneColor = zone?.properties?.dangerColor || (isSelected ? '#ef4444' : '#f97316');

        return (
          <GeoJSON
            key={`context-zone-${zoneKey}`}
            data={zone}
            pathOptions={{
              color: zoneColor,
              fillColor: zoneColor,
              fillOpacity: isSelected ? 0.28 : 0.12,
              weight: isSelected ? 2.4 : 1.3,
              opacity: isSelected ? 1 : 0.8,
              dashArray: isSelected ? undefined : '4, 4',
            }}
          >
            <Tooltip sticky>
              <div className="font-sans">
                <div className="font-bold text-xs">{zone?.properties?.controlPanelLabel || zone?.properties?.localityName || zone?.properties?.localityCode || 'Zone'}</div>
                <div className="text-[10px] text-slate-300">{isSelected ? 'Primary selected honeycomb' : 'Adjacent honeycomb'}</div>
              </div>
            </Tooltip>
          </GeoJSON>
        );
      })}
      
      {/* Encompassing Radial Circle (shows zone extent) */}
      <Circle 
        key={`zone-circle-${feature.properties.controlPanelKey || feature.properties.localityCode}`}
        center={[zoneCentroid[1], zoneCentroid[0]]}
        radius={encompassingRadius}
        pathOptions={{
          fillColor: feature.properties.dangerColor || '#ef4444',
          color: feature.properties.dangerColor || '#ef4444',
          weight: 2,
          fillOpacity: 0.06,
          opacity: 0.5,
          dashArray: '8, 6',
          lineCap: 'round'
        }}
      >
        <Tooltip sticky>
          <div className="font-sans">
            <div className="font-bold text-sm">Zone Extent</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Affected area radius</div>
          </div>
        </Tooltip>
      </Circle>

      {/* Main selected node ring so operators can distinguish it from adjacent cells */}
      <Circle
        key={`selected-node-ring-${feature.properties.controlPanelKey || feature.properties.localityCode}`}
        center={[zoneCentroid[1], zoneCentroid[0]]}
        radius={selectedNodeRadius}
        pathOptions={{
          fillOpacity: 0,
          color: '#f8fafc',
          weight: 2,
          opacity: 0.85,
          dashArray: '3, 6',
        }}
      />
      
      {/* Zone Center Marker (circular, prominent) */}
      <CircleMarker 
        key={`zone-marker-${feature.properties.controlPanelKey || feature.properties.localityCode}`}
        center={[zoneCentroid[1], zoneCentroid[0]]}
        radius={12}
        pathOptions={{
          fillColor: feature.properties.dangerColor || '#ef4444',
          color: feature.properties.dangerLabel === 'Critical' ? '#fff' : '#fbbf24',
          fillOpacity: 0.95,
          weight: feature.properties.dangerLabel === 'Critical' ? 3 : 2,
          opacity: 1
        }}
      >
        <Tooltip>
          <div className="font-sans">
            <div className="font-bold text-sm">{feature.properties.localityName || feature.properties.NAME_3 || feature.properties.NAME_2 || feature.properties.localityCode}</div>
            <div className="text-[10px] text-slate-300">{feature.properties.controlPanelLabel || feature.properties.localityName || feature.properties.localityCode}</div>
            <div className="text-[11px] text-slate-300 mt-1">
              {feature.properties.dangerLabel === 'Critical' ? '🔴 Critical Zone' : '🟠 Warning Zone'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Hazard: {Math.round(feature.properties.dangerScore * 100)}%</div>
          </div>
        </Tooltip>
      </CircleMarker>
      
      {majorRoads && (
        <GeoJSON
          key="major-roads-overlay"
          data={majorRoads}
          style={{ color: '#94a3b8', weight: 1.5, opacity: 0.55 }}
        />
      )}
      {/* Plot Schools */}
      {impactedInfra?.schools.map((s, i) => {
         const p = parseLonLatFromFeature(s);
         if (!p) return null;
         return (
           <CircleMarker key={`school-${i}`} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.9 }}>
             <Tooltip>{s.properties.name || 'School'}</Tooltip>
           </CircleMarker>
         );
       })}
      {/* Plot Hospitals */}
      {impactedInfra?.hospitals.map((h, i) => {
         const p = parseLonLatFromFeature(h);
         if (!p) return null;
         return (
           <CircleMarker key={`hosp-${i}`} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#ef4444', fillColor: '#f87171', fillOpacity: 0.9 }}>
             <Tooltip>{h.properties.name || 'Health Facility'}</Tooltip>
           </CircleMarker>
         );
       })}
      {/* Plot Mosques */}
      {impactedInfra?.mosques.map((m, i) => {
         const p = parseLonLatFromFeature(m);
         if (!p) return null;
         return (
           <CircleMarker key={`mosq-${i}`} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#22c55e', fillColor: '#4ade80', fillOpacity: 0.9 }}>
             <Tooltip>{m.properties.name || 'Mosque'}</Tooltip>
           </CircleMarker>
         );
       })}
      {/* Plot Shelters */}
      {impactedInfra?.shelters.map((sh, i) => {
         const p = parseLonLatFromFeature(sh);
         if (!p) return null;
         return (
           <CircleMarker key={`shelt-${i}`} center={[p.lat, p.lon]} radius={5} pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 1 }}>
             <Tooltip>{sh.properties.name || 'Cyclone Shelter'}</Tooltip>
           </CircleMarker>
         );
       })}
      {/* Plot Volunteers */}
      {impactedInfra?.volunteers?.map((v, i) => {
        const vp = parseLonLatFromFeature(v);
        if (!vp) return null;
        const ngoColors = ['#ef4444', '#3b82f6', '#10b981']; // Red, Blue, Emerald matching NGOS constant
        const ngoColor = ngoColors[i % ngoColors.length];
        const focusedCoords = focusedPoint?.geometry?.coordinates;
        const focusedLon = Array.isArray(focusedCoords) ? Number(focusedCoords[0]) : NaN;
        const focusedLat = Array.isArray(focusedCoords) ? Number(focusedCoords[1]) : NaN;
        const pointLon = vp.lon;
        const pointLat = vp.lat;
        const isFocused = focusedPoint?.dispatchId === v.dispatchId || 
                          (Number.isFinite(focusedLon) && Number.isFinite(focusedLat) && Number.isFinite(pointLon) && Number.isFinite(pointLat) &&
                           focusedLon === pointLon && focusedLat === pointLat);
        
        return (
          <CircleMarker 
            key={`vol-${i}`} 
            center={[vp.lat, vp.lon]} 
            radius={isFocused ? 8 : 6} 
            pathOptions={{ 
              color: isFocused ? '#fff' : ngoColor, 
              fillColor: ngoColor, 
              fillOpacity: 0.9,
              weight: isFocused ? 3 : 1
            }}
          >
            <Tooltip>
              <div className="font-sans">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {v.dispatchId || v.properties.name || 'Response Unit'}
                </div>
                <div className="text-[10px] text-slate-500 uppercase font-mono mt-0.5">Strength: {v.properties.strength}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
      {/* Focused destination marker (assistant/manual) */}
      {focusedTargetLatLng && (
        <>
          <CircleMarker
            center={[focusedTargetLatLng.lat, focusedTargetLatLng.lon]}
            radius={11}
            pathOptions={{
              color: '#ffffff',
              fillColor: '#22d3ee',
              fillOpacity: 0.15,
              weight: 2,
              opacity: 1,
            }}
          >
            <Tooltip>Selected Destination</Tooltip>
          </CircleMarker>
          <CircleMarker
            center={[focusedTargetLatLng.lat, focusedTargetLatLng.lon]}
            radius={4}
            pathOptions={{
              color: '#22d3ee',
              fillColor: '#22d3ee',
              fillOpacity: 1,
              weight: 1,
            }}
          />
        </>
      )}
      {/* Plot Focus Route: best-road highlight with glow + endpoints */}
      {highlightedRoutePositions && highlightedRouteStart && highlightedRouteEnd && (
        <>
          <Polyline
            positions={highlightedRoutePositions}
            pathOptions={{
              color: '#0ea5e9',
              weight: 14,
              opacity: 0.28,
              lineCap: 'round',
              lineJoin: 'round',
              className: 'best-route-glow'
            }}
          />
          <Polyline
            positions={highlightedRoutePositions}
            pathOptions={{
              color: '#22d3ee',
              weight: 6,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
              className: 'best-route-core'
            }}
          >
            <Tooltip sticky>Best Suggested Road Route</Tooltip>
          </Polyline>
          <CircleMarker
            center={highlightedRouteStart}
            radius={6}
            pathOptions={{ color: '#ffffff', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip>Route Start</Tooltip>
          </CircleMarker>
          <CircleMarker
            center={highlightedRouteEnd}
            radius={7}
            pathOptions={{ color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip>Route Destination</Tooltip>
          </CircleMarker>
        </>
      )}
      
      {/* Cyclone Track and Forecasts */}
      <CycloneTrackLayer showHeadingVector={false} showWindField={false} />
      <CopilotForecastLayer />

      {/* Live Telemetry Rescue Clusters (rectangle-only, action-focused) */}
      {showRescueClusters && rescueClusterRectangles.map(({ zone, rect }: any) => {
        const severity = String(zone?.severity || 'moderate').toLowerCase();
        const color = severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f97316' : '#eab308';
        const zoneId = normalizeClusterId(zone?.id);
        const isSelected = selectedRescueClusterId === zoneId;

        return (
          <GeoJSON
            key={`rescue-rect-${zoneId}`}
            data={rect}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isSelected ? 0.26 : 0.14,
              weight: isSelected ? 3 : 2,
              dashArray: '9, 7',
              opacity: 0.95,
            }}
            eventHandlers={{
              click: () => onRescueClusterSelect(zoneId),
            }}
          >
            <Tooltip sticky>
              <div className="font-sans">
                <div className="font-bold text-xs">Rescue Cluster {zoneId}</div>
                <div className="text-[10px] text-slate-300">Severity: {severity.toUpperCase()}</div>
                <div className="text-[10px] text-slate-400">Agents: {zone.agent_count || 0}</div>
              </div>
            </Tooltip>
          </GeoJSON>
        );
      })}

      {/* Marquee Tool For Dispatch Area Selection */}
      <MarqueeSelector enabled={isMarqueeEnabled} onAreaChange={onDispatchAreaChange} />
      {dispatchArea && (
        <Rectangle
          bounds={[
            [dispatchArea.bbox.south, dispatchArea.bbox.west],
            [dispatchArea.bbox.north, dispatchArea.bbox.east],
          ]}
          pathOptions={{
            color: '#22d3ee',
            fillColor: '#22d3ee',
            fillOpacity: 0.08,
            dashArray: '8, 5',
            weight: 2,
            opacity: 0.95,
          }}
        >
          <Tooltip sticky>
            <div className="font-sans">
              <div className="font-bold text-xs">Dispatch Area Locked</div>
              <div className="text-[10px] text-slate-300">Center: {dispatchArea.center.lat.toFixed(4)}, {dispatchArea.center.lon.toFixed(4)}</div>
              <div className="text-[10px] text-slate-400">Area: {dispatchArea.areaKm2.toFixed(2)} km2</div>
            </div>
          </Tooltip>
        </Rectangle>
      )}

      {/* Predicted Cyclone Direction Pointer from Zone Center */}
      {Number.isFinite(predictedDirectionDeg) && (
        (() => {
          const centerPoint = turf.point([zoneCentroid[0], zoneCentroid[1]]);
          const pointerLengthKm = Math.max(1.5, Math.min((encompassingRadius / 1000) * 0.9, 20));
          const tip = turf.destination(centerPoint, pointerLengthKm, predictedDirectionDeg, { units: 'kilometers' });
          const leftHead = turf.destination(tip, pointerLengthKm * 0.22, predictedDirectionDeg + 150, { units: 'kilometers' });
          const rightHead = turf.destination(tip, pointerLengthKm * 0.22, predictedDirectionDeg - 150, { units: 'kilometers' });

          const [tipLon, tipLat] = tip.geometry.coordinates;
          const [leftLon, leftLat] = leftHead.geometry.coordinates;
          const [rightLon, rightLat] = rightHead.geometry.coordinates;

          return (
            <>
              {/* Main predicted-direction pointer */}
              <Polyline
                positions={[[zoneCentroid[1], zoneCentroid[0]], [tipLat, tipLon]]}
                pathOptions={{
                  color: '#fbbf24',
                  weight: 4,
                  opacity: 0.98,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              >
                <Tooltip sticky>Possible Cyclone Direction</Tooltip>
              </Polyline>
              {/* Left arrowhead */}
              <Polyline
                positions={[[tipLat, tipLon], [leftLat, leftLon]]}
                pathOptions={{
                  color: '#fbbf24',
                  weight: 4,
                  opacity: 0.98,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
              {/* Right arrowhead */}
              <Polyline
                positions={[[tipLat, tipLon], [rightLat, rightLon]]}
                pathOptions={{
                  color: '#fbbf24',
                  weight: 4,
                  opacity: 0.98,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
            </>
          );
        })()
      )}

    </MapContainer>
  );
}

export function ControlPanelPage() {
  const { activeZones, allHoneycombZones, isPlaying, currentStep } = useSimulationStore();
  const { zones: telemetryZones, setSelectedHotspotId, addBroadcastedAlert } = useTelemetryStore();
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);
  const [impactedInfra, setImpactedInfra] = useState<ImpactedInfra | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<any | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<any | null>(null);
  const [routeIssue, setRouteIssue] = useState<string | null>(null);
  const [isUtilitiesCollapsed, setIsUtilitiesCollapsed] = useState(false);
  const [isNGOCollapsed, setIsNGOCollapsed] = useState(false);
  const [showRescueClusters, setShowRescueClusters] = useState(false);
  const [selectedRescueClusterId, setSelectedRescueClusterId] = useState<string | null>(null);
  const [isMarqueeEnabled, setIsMarqueeEnabled] = useState(false);
  const [selectedDispatchArea, setSelectedDispatchArea] = useState<DispatchAreaSelection | null>(null);
  const [capAutomationDraft, setCapAutomationDraft] = useState<CapAutomationDraft | null>(null);
  const [assistantCentralAlertDraft, setAssistantCentralAlertDraft] = useState<{
    requestId: string;
    message: string;
  } | null>(null);
  const [assistantNgoDispatchDraft, setAssistantNgoDispatchDraft] = useState<{
    requestId: string;
    message: string;
  } | null>(null);
  const criticalZoneOptions = useMemo(
    () => annotateZonesForControlPanel(activeZones?.critical || []),
    [activeZones?.critical],
  );
  const warningZoneOptions = useMemo(
    () => annotateZonesForControlPanel(activeZones?.warning || []),
    [activeZones?.warning],
  );
  const allZoneOptions = useMemo(
    () => [...criticalZoneOptions, ...warningZoneOptions],
    [criticalZoneOptions, warningZoneOptions],
  );
  const zoneByKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const z of allZoneOptions) {
      const k = String(z?.properties?.controlPanelKey || '');
      if (k) map.set(k, z);
    }
    return map;
  }, [allZoneOptions]);

  useEffect(() => {
    if (!selectedZoneKey) return;
    const updated = zoneByKey.get(selectedZoneKey);

    // ONLY update zone properties if it still exists in activeZones
    // BUT do NOT clear selection just because it disappeared from activeZones
    // User should be able to view a zone's details even after it goes away
    if (updated) {
      setSelectedZone(withZoneCircleCenter(updated));
    }
    // REMOVED: auto-clear on zone disappearance - this was too aggressive
    // Allow user to keep viewing zone data after selection
  }, [selectedZoneKey, zoneByKey]);

  const selectedZoneWithNeighbors = useMemo(() => {
    if (!selectedZone?.geometry) return [];
    const selectedKey = String(selectedZone?.properties?.controlPanelKey || selectedZoneKey || '');
    const honeycombContext = annotateZonesForControlPanel(allHoneycombZones || []);

    return honeycombContext.filter((zone: any) => {
      const zoneKey = String(zone?.properties?.controlPanelKey || '');
      if (zoneKey && zoneKey === selectedKey) return true;
      try {
        return turf.booleanTouches(selectedZone as any, zone as any) || turf.booleanIntersects(selectedZone as any, zone as any);
      } catch {
        try {
          const dKm = turf.distance(turf.centroid(selectedZone as any), turf.centroid(zone as any), { units: 'kilometers' });
          return dKm <= 7;
        } catch {
          return false;
        }
      }
    });
  }, [selectedZone, selectedZoneKey, allHoneycombZones]);

  const criticalCount = criticalZoneOptions.length;
  const warningCount = warningZoneOptions.length;

  const selectZoneByKey = (zoneKey: string) => {
    const zone = zoneByKey.get(zoneKey);
    if (!zone) return;
    setSelectedZone(withZoneCircleCenter(zone));
    setSelectedZoneKey(zoneKey);
    setFocusedPoint(null);
    setFocusedRoute(null);
    setRouteIssue(null);
  };

  useEffect(() => {
    if (!selectedRescueClusterId) return;
    const stillExists = (telemetryZones || []).some(
      (z: any) => normalizeClusterId(z?.id) === selectedRescueClusterId,
    );
    if (!stillExists) {
      setSelectedRescueClusterId(null);
      setSelectedHotspotId(null);
    }
  }, [telemetryZones, selectedRescueClusterId, setSelectedHotspotId]);

  const selectedRescueCluster = useMemo(
    () => (telemetryZones || []).find((z: any) => normalizeClusterId(z?.id) === selectedRescueClusterId) || null,
    [telemetryZones, selectedRescueClusterId],
  );

  const handleClearTarget = () => {
    setSelectedZone(null);
    setSelectedZoneKey(null);
    setFocusedPoint(null);
    setFocusedRoute(null);
    setRouteIssue(null);
    setImpactedInfra(null);
  };

  const handleAssistantRouteGenerated = (route: any | null, destinationName: string, destinationPoint?: any | null) => {
    if (destinationPoint) {
      setFocusedPoint(destinationPoint);
    }

    if (route) {
      setFocusedRoute(route);
      setRouteIssue(null);
      return;
    }

    setFocusedRoute(null);
    setRouteIssue(`No connected road route found to ${destinationName}.`);
  };

  const handleDispatchBroadcast = (payload: {
    ngoId: string;
    ngoName: string;
    resourceName: string;
    resourceProfile: Record<string, any>;
    dispatchTeamsReady: number;
    reinforcementLeft: number;
    activeAssignments: number;
    selectedClusterId: string;
    selectedClusterSeverity: string;
    selectedClusterAgents: number;
    area: DispatchAreaSelection;
  }) => {
    const eventId = `ngo-${payload.ngoId}-${Date.now()}`;
    const profileEntries = Object.entries(payload.resourceProfile || {})
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : String(v)}`)
      .join('; ');

    const alert = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      status: 'approved' as const,
      volunteer: {
        id: `${payload.ngoId}-${payload.resourceName.replace(/\s+/g, '-').toLowerCase()}`,
        name: `${payload.ngoName} / ${payload.resourceName}`,
        assigned_station:
          selectedZone?.properties?.localityName ||
          selectedZone?.properties?.NAME_3 ||
          selectedZone?.properties?.NAME_2 ||
          selectedZone?.properties?.controlPanelLabel ||
          'Control Panel',
      },
      current_assignment: {
        task_id: `dispatch-${payload.selectedClusterId}`,
        description:
          `Cluster ${payload.selectedClusterId} (${payload.selectedClusterSeverity}) | ` +
          `Area center ${payload.area.center.lat.toFixed(4)},${payload.area.center.lon.toFixed(4)} | ` +
          `BBox [W:${payload.area.bbox.west.toFixed(4)}, S:${payload.area.bbox.south.toFixed(4)}, E:${payload.area.bbox.east.toFixed(4)}, N:${payload.area.bbox.north.toFixed(4)}] | ` +
          `Resource ${payload.resourceName} | Teams ready ${payload.dispatchTeamsReady} | Reinforcements ${payload.reinforcementLeft} | Active duties ${payload.activeAssignments} | ` +
          `Params ${profileEntries}`,
        status: 'dispatching',
      },
      sos_details: {
        type: `NGO Dispatch - ${payload.resourceName}`,
        code: `NGO-DISP-${payload.selectedClusterId}`,
        severity_level: payload.selectedClusterSeverity,
      },
      telemetry: {
        coordinates: {
          latitude: payload.area.center.lat,
          longitude: payload.area.center.lon,
        },
        location_accuracy_meters: Math.max(15, Math.round(Math.sqrt(payload.area.areaKm2 * 1_000_000) / 4)),
        battery_level: Math.max(60, 100 - payload.activeAssignments * 5),
        network_mode: 'control_panel_dispatch',
      },
    };

    addBroadcastedAlert(alert, {
      radius_km: Math.max(2, Math.sqrt(Math.max(0.05, payload.area.areaKm2))),
      stations_notified: Math.max(1, payload.dispatchTeamsReady),
      total_stations: Math.max(5, payload.dispatchTeamsReady + payload.reinforcementLeft + 2),
      volunteer_coords: {
        lat: payload.area.center.lat,
        lng: payload.area.center.lon,
      },
    });
  };

  const handleWriteToCapOption = (draft: {
    phone: string;
    message: string;
    loraPayload: string;
    loraMessageType?: string;
  }) => {
    setCapAutomationDraft({
      requestId: `cap-draft-${Date.now()}`,
      phone: draft.phone,
      message: draft.message,
      loraPayload: draft.loraPayload,
      loraMessageType: draft.loraMessageType,
      targetPane: 'cap',
    });
    setIsNGOCollapsed(true);
    setIsUtilitiesCollapsed(false);
  };

  const handleWriteToLoRaOption = (draft: {
    phone: string;
    message: string;
    loraPayload: string;
    loraMessageType?: string;
  }) => {
    setCapAutomationDraft({
      requestId: `lora-draft-${Date.now()}`,
      phone: draft.phone,
      message: draft.message,
      loraPayload: draft.loraPayload,
      loraMessageType: draft.loraMessageType,
      targetPane: 'lora',
    });
    setIsNGOCollapsed(true);
    setIsUtilitiesCollapsed(false);
  };

  const handleAssistantCentralAlertPreview = (message: string) => {
    const trimmed = String(message || '').trim();
    if (!trimmed) return;

    setAssistantCentralAlertDraft({
      requestId: `ai-central-${Date.now()}`,
      message: trimmed,
    });
    setIsNGOCollapsed(false);
    setIsUtilitiesCollapsed(true);
  };

  const handleAssistantCapDispatchPreview = (message: string) => {
    const trimmed = String(message || '').trim();
    if (!trimmed) return;

    const capMessage = trimmed.startsWith('[CAP SMS Dispatch]')
      ? trimmed
      : `[CAP SMS Dispatch]\n${trimmed}`;
    const loraPayload = capMessage
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

    setCapAutomationDraft({
      requestId: `ai-cap-${Date.now()}`,
      phone: '',
      message: capMessage,
      loraPayload,
      loraMessageType: 'CUSTOM',
      targetPane: 'cap',
    });
    setIsNGOCollapsed(true);
    setIsUtilitiesCollapsed(false);
    setRouteIssue('AI CAP dispatch draft prepared. Review in CAP pane and send.');
  };

  const handleAssistantTopNgoDispatchPreview = (message: string) => {
    const trimmed = String(message || '').trim();
    if (!trimmed) return;

    setAssistantNgoDispatchDraft({
      requestId: `ai-ngo-dispatch-${Date.now()}`,
      message: trimmed,
    });
    setIsNGOCollapsed(false);
    setIsUtilitiesCollapsed(true);
  };

  useEffect(() => {
    if (selectedRescueClusterId) {
      setShowRescueClusters(true);
      setIsMarqueeEnabled(true);
    }
  }, [selectedRescueClusterId]);

  return (
    <ControlPanelErrorBoundary>
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-200 overflow-hidden relative">
      {/* Dynamic Background Blurs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-red-900/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full h-full flex pt-14 overflow-hidden">
        
        
        {/* Left Side Panel: NGO Manager */}
        <div className={`
          ${isNGOCollapsed ? 'w-[56px]' : 'w-[232px] md:w-[248px]'} 
          h-full bg-slate-950/80 border-r border-white/5 backdrop-blur-xl shrink-0 flex flex-col relative z-30 transition-all duration-300 ease-in-out
        `}>
          {selectedZone ? (
            <NGOManager 
              selectedZone={selectedZone}
              contextZones={selectedZoneWithNeighbors}
              volunteers={impactedInfra?.volunteers || []}
              rescueZones={telemetryZones || []}
              selectedRescueCluster={selectedRescueCluster}
              selectedDispatchArea={selectedDispatchArea}
              isMarqueeEnabled={isMarqueeEnabled}
              onToggleMarquee={setIsMarqueeEnabled}
              onClearDispatchArea={() => setSelectedDispatchArea(null)}
              onDispatchBroadcast={handleDispatchBroadcast}
              showRescueClusters={showRescueClusters}
              onToggleRescueClusters={setShowRescueClusters}
              onSelectRescueCluster={(clusterId) => {
                const normalizedId = normalizeClusterId(clusterId);
                setSelectedRescueClusterId(normalizedId);
                setSelectedHotspotId(normalizedId);
                setShowRescueClusters(true);
                setIsMarqueeEnabled(true);
              }}
              onPointSelect={(pt) => {
                setFocusedPoint(pt);
                setRouteIssue(null);
              }}
              onRouteSelect={(route) => {
                setFocusedRoute(route);
                if (route) setRouteIssue(null);
              }}
              onRouteIssue={setRouteIssue}
              onWriteToCapOption={handleWriteToCapOption}
              onWriteToLoRaOption={handleWriteToLoRaOption}
              assistantCentralAlertDraft={assistantCentralAlertDraft}
              onAssistantCentralAlertDraftConsumed={(requestId) => {
                setAssistantCentralAlertDraft((prev) => (prev?.requestId === requestId ? null : prev));
              }}
              assistantDispatchDraft={assistantNgoDispatchDraft}
              onAssistantDispatchDraftConsumed={(requestId) => {
                setAssistantNgoDispatchDraft((prev) => (prev?.requestId === requestId ? null : prev));
              }}
              isCollapsed={isNGOCollapsed}
              onToggleCollapse={() => setIsNGOCollapsed(!isNGOCollapsed)}
                onOptionSelected={() => {
                  setIsNGOCollapsed(false);
                  setIsUtilitiesCollapsed(true);
                }}
            />
          ) : (
            <div className="w-full h-full flex flex-col p-4 bg-slate-900/40 backdrop-blur">
               <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 shrink-0">
                 {!isNGOCollapsed && (
                   <h4 className="text-slate-200 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                     <Building2 className="text-emerald-400" size={16} /> Logistics
                   </h4>
                 )}
                 <button 
                   onClick={() => setIsNGOCollapsed(!isNGOCollapsed)} 
                   className={`p-1.5 hover:bg-white/10 rounded-lg text-slate-400 ${isNGOCollapsed ? 'mx-auto' : ''}`}
                 >
                   {isNGOCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                 </button>
               </div>
               
               <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500">
                  <Building2 className={`mb-4 opacity-20 ${isNGOCollapsed ? 'w-8 h-8' : 'w-12 h-12'}`} />
                  {!isNGOCollapsed && (
                    <>
                      <h3 className="text-lg font-bold text-slate-400 mb-2">Logistics Hub</h3>
                      <p className="text-sm font-medium">Select a target zone to coordinate NGO dispatches and view active volunteer units.</p>
                    </>
                  )}
               </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 h-full flex flex-col overflow-hidden">
          
          {/* COMPACT RIBBON */}
          <div className="px-6 py-3 bg-slate-900/60 border-b border-white/5 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 z-20 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-4 shrink-0 whitespace-nowrap">
              {/* Critical Segment */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-red-500 font-bold uppercase tracking-tighter text-[10px]">
                  <AlertCircle size={14} className={criticalCount > 0 ? "animate-pulse" : ""} />
                  Critical
                </div>
                <div className="text-2xl font-black text-white px-2 py-0.5 bg-red-500/10 rounded-md border border-red-500/20 leading-none">
                  {criticalCount}
                </div>
                <select 
                  className="bg-slate-950/80 border border-white/10 text-slate-300 rounded-md px-2 py-1 text-[11px] w-[128px] md:w-[140px] focus:outline-none focus:border-red-500/50 transition-colors disabled:opacity-30"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    selectZoneByKey(e.target.value);
                  }}
                  value={selectedZoneKey || ''}
                  disabled={criticalCount === 0 && !selectedZone}
                >
                  <option value="" disabled>{selectedZone ? 'Clear Zone' : 'Select Critical Zone'}</option>
                  {criticalZoneOptions.map((z: any) => (
                    <option key={z.properties.controlPanelKey} value={z.properties.controlPanelKey}>
                      {z.properties.controlPanelLabel || z.properties.localityName || z.properties.localityCode || `Zone ${z.properties.controlPanelKey}`}
                    </option>
                  ))}
                  {selectedZone && !criticalZoneOptions.find((z: any) => z.properties.controlPanelKey === selectedZone.properties.controlPanelKey) && (
                    <option value={selectedZone.properties.controlPanelKey} disabled style={{ color: '#888' }}>
                      {selectedZone.properties.controlPanelLabel || selectedZone.properties.localityName || selectedZone.properties.localityCode} (Past Selection)
                    </option>
                  )}
                </select>
              </div>

              {/* Separator */}
              <div className="w-px h-6 bg-white/10" />

              {/* Warning Segment */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-orange-500 font-bold uppercase tracking-tighter text-[10px]">
                  <AlertTriangle size={14} />
                  Warning
                </div>
                <div className="text-2xl font-black text-white px-2 py-0.5 bg-orange-500/10 rounded-md border border-orange-500/20 leading-none">
                  {warningCount}
                </div>
                <select 
                  className="bg-slate-950/80 border border-white/10 text-slate-300 rounded-md px-2 py-1 text-[11px] w-[128px] md:w-[140px] focus:outline-none focus:border-orange-500/50 transition-colors disabled:opacity-30"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    selectZoneByKey(e.target.value);
                  }}
                  value={selectedZoneKey || ''}
                  disabled={warningCount === 0 && !selectedZone}
                >
                  <option value="" disabled>{selectedZone ? 'Clear Zone' : 'Select Warning Zone'}</option>
                  {warningZoneOptions.map((z: any) => (
                    <option key={z.properties.controlPanelKey} value={z.properties.controlPanelKey}>
                      {z.properties.controlPanelLabel || z.properties.localityName || z.properties.localityCode || `Zone ${z.properties.controlPanelKey}`}
                    </option>
                  ))}
                  {selectedZone && !warningZoneOptions.find((z: any) => z.properties.controlPanelKey === selectedZone.properties.controlPanelKey) && (
                    <option value={selectedZone.properties.controlPanelKey} disabled style={{ color: '#888' }}>
                      {selectedZone.properties.controlPanelLabel || selectedZone.properties.localityName || selectedZone.properties.localityCode} (Past Selection)
                    </option>
                  )}
                </select>
              </div>

              {selectedZone && (
                <button
                  onClick={handleClearTarget}
                  className="h-7 w-7 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-md text-slate-300 transition-all shrink-0"
                  aria-label="Clear target"
                  title="Clear target"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {isPlaying && (
              <div className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Step {currentStep}
              </div>
            )}
          </div>

          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">


        {selectedZone ? (
          <div className="w-full flex-1 flex flex-col border border-white/5 bg-slate-900/40 rounded-xl backdrop-blur-md overflow-hidden relative shadow-2xl">
             <div className="flex-1 flex flex-col relative">
                 <div className="flex-1 relative bg-black/50 overflow-hidden">
                    <MiniMap
                      feature={selectedZone}
                      contextZones={selectedZoneWithNeighbors}
                      selectedZoneKey={selectedZoneKey}
                      impactedInfra={impactedInfra}
                      focusedPoint={focusedPoint}
                      focusedRoute={focusedRoute}
                      rescueZones={telemetryZones || []}
                      showRescueClusters={showRescueClusters}
                      selectedRescueClusterId={selectedRescueClusterId}
                      dispatchArea={selectedDispatchArea}
                      isMarqueeEnabled={isMarqueeEnabled}
                      onDispatchAreaChange={setSelectedDispatchArea}
                      onRescueClusterSelect={(clusterId) => {
                        setSelectedRescueClusterId(clusterId);
                        setSelectedHotspotId(clusterId);
                        setShowRescueClusters(true);
                        setIsMarqueeEnabled(true);
                      }}
                    />
                    {focusedPoint && !focusedRoute && routeIssue && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-amber-500/15 border border-amber-400/40 rounded-lg text-amber-200 text-xs font-semibold backdrop-blur max-w-[90%] text-center shadow-xl">
                        No route highlighted: {routeIssue}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none z-10" />
                    <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-slate-950/50 to-transparent pointer-events-none z-10" />
                 </div>
             </div>
          </div>
        ) : (
          <div className="w-full flex-1 border border-white/5 bg-slate-900/40 rounded-xl backdrop-blur-md flex flex-col items-center justify-center p-8 text-center shrink-0 min-h-[400px]">
              <Activity className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
              <h3 className="text-xl font-bold text-slate-300">Awaiting Target Selection</h3>
              <p className="text-slate-500 max-w-md mt-2">
                Select a specific critical or warning zone from the dropdown menus above to initialize a locked tracking map.
              </p>
            {isPlaying && (
              <div className="mt-6 px-6 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-sm font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                Simulation Active: Step {currentStep}
              </div>
            )}
          </div>
        )}
          </div>
        </div>

        {/* Right Side Panel: Infrastructure Settings & Analysis */}
        <div className={`
          ${isUtilitiesCollapsed ? 'w-[56px]' : 'w-[232px] md:w-[248px]'} 
          h-full bg-slate-950/80 border-l border-white/5 backdrop-blur-xl shrink-0 flex flex-col relative z-30 transition-all duration-300 ease-in-out
        `}>
          {selectedZone ? (
             <InfrastructureAnalyzer 
                selectedZone={selectedZone} 
                onAnalysisComplete={setImpactedInfra} 
                onPointSelect={(pt) => {
                  setFocusedPoint(pt);
                  setRouteIssue(null);
                }}
                onRouteSelect={(route) => {
                  setFocusedRoute(route);
                  if (route) setRouteIssue(null);
                }}
                onRouteIssue={setRouteIssue}
                automationDraft={capAutomationDraft}
                onAutomationDraftConsumed={(requestId) => {
                  setCapAutomationDraft((prev) => (prev?.requestId === requestId ? null : prev));
                }}
                isCollapsed={isUtilitiesCollapsed}
                onToggleCollapse={() => setIsUtilitiesCollapsed(!isUtilitiesCollapsed)}
                  onOptionSelected={() => {
                    setIsUtilitiesCollapsed(false);
                    setIsNGOCollapsed(true);
                  }}
             />
          ) : (
             <div className="w-full h-full flex flex-col p-4 bg-slate-900/40 backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 shrink-0">
                  <button 
                    onClick={() => setIsUtilitiesCollapsed(!isUtilitiesCollapsed)} 
                    className={`p-1.5 hover:bg-white/10 rounded-lg text-slate-400 ${isUtilitiesCollapsed ? 'mx-auto' : ''}`}
                  >
                    {isUtilitiesCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                  </button>
                  {!isUtilitiesCollapsed && (
                    <h4 className="text-slate-200 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                       Command <Layers className="text-blue-400" size={16} />
                    </h4>
                  )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500">
                   <Layers className={`mb-4 opacity-20 ${isUtilitiesCollapsed ? 'w-8 h-8' : 'w-12 h-12'}`} />
                   {!isUtilitiesCollapsed && (
                     <>
                        <h3 className="text-lg font-bold text-slate-400 mb-2">Command Utilities</h3>
                        <p className="text-sm font-medium">Select a target zone from the Control Board to analyze nearby safezones, dispatch active units, and pinpoint evacuation routes.</p>
                     </>
                   )}
                </div>
             </div>
          )}
        </div>

      </div>
      <AIAssistantHub
        selectedZone={selectedZone}
        impactedInfra={impactedInfra}
        focusedPoint={focusedPoint}
        focusedRoute={focusedRoute}
        onRouteGenerated={handleAssistantRouteGenerated}
        onRouteIssue={setRouteIssue}
        onCentralAlertPreview={handleAssistantCentralAlertPreview}
        onCapDispatchPreview={handleAssistantCapDispatchPreview}
        onTopNgoDispatchPreview={handleAssistantTopNgoDispatchPreview}
      />
    </div>
    </ControlPanelErrorBoundary>
  );
}
