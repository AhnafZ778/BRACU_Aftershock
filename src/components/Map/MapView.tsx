import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { useAppStore } from '../../store/useAppStore';
import { RoadOverlayLayer } from './roads/RoadOverlayLayer';
import { TakeGeoJsonLayers } from './TakeGeoJsonLayers';
import { EmployeeHeatmapLayer } from './EmployeeHeatmapLayer';
import { EmployeeMarkersLayer } from './EmployeeMarkersLayer';
import { MultiScaleHazardLayer } from './MultiScaleHazardLayer';
import type { TakeLayerDef } from '../../hooks/useTakeLayers';

// ─── Dhaka center & zoom (close-in view of Dhaka) ───────────────────────
const BD_CENTER: [number, number] = [23.775, 90.400];
const BD_ZOOM = 12;

// ─── English Place Labels (comprehensive Dhaka metro) ────────────────────
const PLACE_LABELS: { name: string; lat: number; lng: number; size: 'lg' | 'md' | 'sm' | 'xs'; minZoom: number }[] = [
  // ── Major City ──
  { name: 'DHAKA',              lat: 23.7644, lng: 90.3894, size: 'lg', minZoom: 11 },

  // ── Satellite Cities / Districts ──
  { name: 'Narayanganj',        lat: 23.6170, lng: 90.5000, size: 'md', minZoom: 11 },
  { name: 'Gazipur',            lat: 23.9900, lng: 90.4200, size: 'md', minZoom: 11 },
  { name: 'Savar',              lat: 23.8510, lng: 90.2560, size: 'md', minZoom: 11 },
  { name: 'Tongi',              lat: 23.8980, lng: 90.4010, size: 'md', minZoom: 11 },
  { name: 'Keraniganj',         lat: 23.6990, lng: 90.3440, size: 'md', minZoom: 11 },
  { name: 'Munshiganj',         lat: 23.5420, lng: 90.5310, size: 'md', minZoom: 11 },
  { name: 'Rupganj',            lat: 23.7800, lng: 90.5250, size: 'md', minZoom: 11 },
  { name: 'Sonargaon',          lat: 23.6500, lng: 90.6100, size: 'md', minZoom: 11 },
  { name: 'Kaliganj',           lat: 23.9350, lng: 90.5100, size: 'md', minZoom: 11 },

  // ── Major Areas (zoom 12) ──
  { name: 'Uttara',             lat: 23.8690, lng: 90.3990, size: 'sm', minZoom: 12 },
  { name: 'Mirpur',             lat: 23.8220, lng: 90.3650, size: 'sm', minZoom: 12 },
  { name: 'Gulshan',            lat: 23.7940, lng: 90.4150, size: 'sm', minZoom: 12 },
  { name: 'Dhanmondi',          lat: 23.7461, lng: 90.3742, size: 'sm', minZoom: 12 },
  { name: 'Motijheel',          lat: 23.7330, lng: 90.4180, size: 'sm', minZoom: 12 },
  { name: 'Mohammadpur',        lat: 23.7660, lng: 90.3590, size: 'sm', minZoom: 12 },
  { name: 'Tejgaon',            lat: 23.7628, lng: 90.3909, size: 'sm', minZoom: 12 },
  { name: 'Purbachal',          lat: 23.8260, lng: 90.4820, size: 'sm', minZoom: 12 },
  { name: 'Abdullahpur',        lat: 23.8850, lng: 90.3970, size: 'sm', minZoom: 12 },
  { name: 'Demra',              lat: 23.7100, lng: 90.4730, size: 'sm', minZoom: 12 },
  { name: 'Jatrabari',          lat: 23.7110, lng: 90.4340, size: 'sm', minZoom: 12 },
  { name: 'Lalbagh',            lat: 23.7192, lng: 90.3886, size: 'sm', minZoom: 12 },
  { name: 'Old Dhaka',          lat: 23.7210, lng: 90.4010, size: 'sm', minZoom: 12 },
  { name: 'Cantonment',         lat: 23.8060, lng: 90.3990, size: 'sm', minZoom: 12 },
  { name: 'Banasree',           lat: 23.7620, lng: 90.4420, size: 'sm', minZoom: 12 },
  { name: 'Pallabi',            lat: 23.8274, lng: 90.3505, size: 'sm', minZoom: 12 },
  { name: 'Ashulia',            lat: 23.8930, lng: 90.3200, size: 'sm', minZoom: 12 },
  { name: 'Aminbazar',          lat: 23.7950, lng: 90.3150, size: 'sm', minZoom: 12 },

  // ── Neighborhoods (zoom 13) ──
  { name: 'Banani',             lat: 23.7930, lng: 90.4023, size: 'xs', minZoom: 13 },
  { name: 'Baridhara',          lat: 23.8020, lng: 90.4210, size: 'xs', minZoom: 13 },
  { name: 'Bashundhara',        lat: 23.8186, lng: 90.4355, size: 'xs', minZoom: 13 },
  { name: 'Badda',              lat: 23.7808, lng: 90.4265, size: 'xs', minZoom: 13 },
  { name: 'Khilkhet',           lat: 23.8290, lng: 90.4222, size: 'xs', minZoom: 13 },
  { name: 'Nikunja',            lat: 23.8310, lng: 90.4120, size: 'xs', minZoom: 13 },
  { name: 'Rupnagar',           lat: 23.7519, lng: 90.3481, size: 'xs', minZoom: 13 },
  { name: 'Shyamoli',           lat: 23.7720, lng: 90.3650, size: 'xs', minZoom: 13 },
  { name: 'Agargaon',           lat: 23.7780, lng: 90.3770, size: 'xs', minZoom: 13 },
  { name: 'Lalmatia',           lat: 23.7530, lng: 90.3680, size: 'xs', minZoom: 13 },
  { name: 'Farmgate',           lat: 23.7570, lng: 90.3870, size: 'xs', minZoom: 13 },
  { name: 'Karwan Bazar',       lat: 23.7510, lng: 90.3930, size: 'xs', minZoom: 13 },
  { name: 'Shahbagh',           lat: 23.7380, lng: 90.3960, size: 'xs', minZoom: 13 },
  { name: 'Ramna',              lat: 23.7400, lng: 90.4060, size: 'xs', minZoom: 13 },
  { name: 'Paltan',             lat: 23.7360, lng: 90.4130, size: 'xs', minZoom: 13 },
  { name: 'Wari',               lat: 23.7210, lng: 90.4140, size: 'xs', minZoom: 13 },
  { name: 'Sutrapur',           lat: 23.7140, lng: 90.4080, size: 'xs', minZoom: 13 },
  { name: 'Kamrangirchar',      lat: 23.7229, lng: 90.3784, size: 'xs', minZoom: 13 },
  { name: 'Hazaribagh',         lat: 23.7348, lng: 90.3698, size: 'xs', minZoom: 13 },
  { name: 'Rayerbazar',         lat: 23.7430, lng: 90.3550, size: 'xs', minZoom: 13 },
  { name: 'Adabor',             lat: 23.7660, lng: 90.3480, size: 'xs', minZoom: 13 },
  { name: 'Shampur',            lat: 23.7060, lng: 90.4400, size: 'xs', minZoom: 13 },
  { name: 'Kadamtali',          lat: 23.7000, lng: 90.4510, size: 'xs', minZoom: 13 },
  { name: 'Mugda',              lat: 23.7350, lng: 90.4360, size: 'xs', minZoom: 13 },
  { name: 'Rampura',            lat: 23.7620, lng: 90.4290, size: 'xs', minZoom: 13 },
  { name: 'Aftabnagar',         lat: 23.7530, lng: 90.4420, size: 'xs', minZoom: 13 },
  { name: 'Hatirjheel',         lat: 23.7700, lng: 90.4150, size: 'xs', minZoom: 13 },
  { name: 'Kafrul',             lat: 23.7920, lng: 90.3850, size: 'xs', minZoom: 13 },
  { name: 'Mirpur DOHS',        lat: 23.8340, lng: 90.3680, size: 'xs', minZoom: 13 },
  { name: 'Shah Ali',           lat: 23.8050, lng: 90.3550, size: 'xs', minZoom: 13 },
  { name: 'Turag',              lat: 23.8780, lng: 90.3530, size: 'xs', minZoom: 13 },
  { name: 'Dakshinkhan',        lat: 23.8530, lng: 90.4350, size: 'xs', minZoom: 13 },
  { name: 'Dia Bari',           lat: 23.8920, lng: 90.3700, size: 'xs', minZoom: 13 },
  { name: 'Uttarkhan',          lat: 23.8650, lng: 90.4300, size: 'xs', minZoom: 13 },

  // ── Micro Areas / Landmarks (zoom 14+) ──
  { name: 'Elephant Road',      lat: 23.7370, lng: 90.3840, size: 'xs', minZoom: 14 },
  { name: 'New Market',         lat: 23.7350, lng: 90.3850, size: 'xs', minZoom: 15 },
  { name: 'Gulshan 1',          lat: 23.7830, lng: 90.4130, size: 'xs', minZoom: 14 },
  { name: 'Gulshan 2',          lat: 23.7960, lng: 90.4170, size: 'xs', minZoom: 14 },
  { name: 'Uttara Sector 3',    lat: 23.8620, lng: 90.3890, size: 'xs', minZoom: 14 },
  { name: 'Uttara Sector 7',    lat: 23.8690, lng: 90.3840, size: 'xs', minZoom: 14 },
  { name: 'Uttara Sector 10',   lat: 23.8760, lng: 90.3940, size: 'xs', minZoom: 14 },
  { name: 'Mirpur 1',           lat: 23.8070, lng: 90.3600, size: 'xs', minZoom: 14 },
  { name: 'Mirpur 10',          lat: 23.8090, lng: 90.3680, size: 'xs', minZoom: 14 },
  { name: 'Mirpur 12',          lat: 23.8200, lng: 90.3640, size: 'xs', minZoom: 14 },
  { name: 'Mohakhali',          lat: 23.7790, lng: 90.3980, size: 'xs', minZoom: 14 },
  { name: 'Tejgaon I/A',        lat: 23.7560, lng: 90.3980, size: 'xs', minZoom: 14 },
  { name: 'Malibagh',           lat: 23.7490, lng: 90.4180, size: 'xs', minZoom: 14 },
  { name: 'Mogbazar',           lat: 23.7480, lng: 90.4080, size: 'xs', minZoom: 14 },
  { name: 'Shantinagar',        lat: 23.7380, lng: 90.4130, size: 'xs', minZoom: 14 },
  { name: 'Chawk Bazar',        lat: 23.7200, lng: 90.3970, size: 'xs', minZoom: 14 },
  { name: 'Sadarghat',          lat: 23.7080, lng: 90.4060, size: 'xs', minZoom: 14 },
  { name: 'Kotwali',            lat: 23.7160, lng: 90.4040, size: 'xs', minZoom: 14 },
  { name: 'Bangshal',           lat: 23.7260, lng: 90.4020, size: 'xs', minZoom: 14 },
  { name: 'Gandaria',           lat: 23.7080, lng: 90.4260, size: 'xs', minZoom: 14 },
  { name: 'Postogola',          lat: 23.6960, lng: 90.4350, size: 'xs', minZoom: 14 },
  { name: 'Matuail',            lat: 23.6930, lng: 90.4600, size: 'xs', minZoom: 14 },
  { name: 'South Keraniganj',   lat: 23.6820, lng: 90.3580, size: 'xs', minZoom: 14 },
  { name: 'Zinzira',            lat: 23.7060, lng: 90.3620, size: 'xs', minZoom: 14 },
  { name: 'Nawabganj',          lat: 23.6600, lng: 90.3300, size: 'xs', minZoom: 14 },

  // ── Rivers & Water Bodies ──
  { name: 'Buriganga River',    lat: 23.7020, lng: 90.4100, size: 'sm', minZoom: 12 },
  { name: 'Turag River',        lat: 23.8700, lng: 90.3300, size: 'sm', minZoom: 12 },
  { name: 'Balu River',         lat: 23.7900, lng: 90.4600, size: 'sm', minZoom: 12 },
  { name: 'Shitalakkhya River', lat: 23.6700, lng: 90.5200, size: 'sm', minZoom: 12 },
  { name: 'Dhaleswari River',   lat: 23.6200, lng: 90.3700, size: 'sm', minZoom: 12 },
];

function createLabelIcon(name: string, size: 'lg' | 'md' | 'sm' | 'xs') {
  const styles: Record<string, string> = {
    lg: 'font-size:15px;font-weight:800;letter-spacing:3px;color:#1e293b;text-shadow:0 0 6px rgba(255,255,255,0.9),0 1px 2px rgba(255,255,255,0.7);',
    md: 'font-size:12px;font-weight:700;letter-spacing:1px;color:#334155;text-shadow:0 0 4px rgba(255,255,255,0.85),0 1px 1px rgba(255,255,255,0.6);',
    sm: 'font-size:10px;font-weight:600;letter-spacing:0.5px;color:#475569;text-shadow:0 0 3px rgba(255,255,255,0.8);',
    xs: 'font-size:9px;font-weight:500;letter-spacing:0.3px;color:#64748b;text-shadow:0 0 3px rgba(255,255,255,0.75);',
  };

  return L.divIcon({
    className: '',
    html: `<div style="white-space:nowrap;font-family:'Inter',system-ui,sans-serif;pointer-events:none;${styles[size]}">${name}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function EnglishLabels() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(Math.round(map.getZoom()));
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map]);

  const visibleLabels = useMemo(
    () => PLACE_LABELS.filter((p) => zoom >= p.minZoom),
    [zoom],
  );

  return (
    <>
      {visibleLabels.map((p) => (
        <Marker
          key={p.name}
          position={[p.lat, p.lng]}
          icon={createLabelIcon(p.name, p.size)}
          interactive={false}
        />
      ))}
    </>
  );
}

// ─── MapFlyTo — flies to selected hotspot ────────────────────────────────
function MapFlyTo() {
  const map = useMap();
  const { selectedHotspotId, zones } = useTelemetryStore();

  useEffect(() => {
    if (selectedHotspotId) {
      const zone = zones.find((z) => z.id === selectedHotspotId);
      if (zone?.center && zone.center.length === 2) {
        map.flyTo([zone.center[0], zone.center[1]], 13, {
          duration: 1.2,
        });
      }
    }
  }, [selectedHotspotId, zones, map]);

  return null;
}

// ─── Map Resize Handler ──────────────────────────────────────────────────
function MapResizeHandler({ isVisible }: { isVisible: boolean }) {
  const map = useMap();
  const prevVisibleRef = useRef(isVisible);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const scheduleInvalidate = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      map.invalidateSize({ animate: false, pan: false });
      rafRef.current = null;
    });
  }, [map]);

  useEffect(() => {
    if (isVisible && !prevVisibleRef.current) {
      const t = setTimeout(() => {
        scheduleInvalidate();
      }, 50);
      return () => clearTimeout(t);
    }
    prevVisibleRef.current = isVisible;
  }, [isVisible, scheduleInvalidate]);

  useEffect(() => {
    const timers = [0, 120, 320].map((delay) =>
      window.setTimeout(() => {
        scheduleInvalidate();
      }, delay),
    );

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [scheduleInvalidate]);

  useEffect(() => {
    const container = map.getContainer();

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width <= 0 || height <= 0) return;

      const prev = lastSizeRef.current;
      if (!prev || Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
        lastSizeRef.current = { width, height };
        scheduleInvalidate();
      }
    };

    handleResize();

    const observer = new ResizeObserver(() => {
      handleResize();
    });

    observer.observe(container);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', handleResize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [map, scheduleInvalidate]);

  return null;
}
// ─── View Bounds ────────────────────────────────────────────────────────
// Pan bounds — the area the user can explore (greater Dhaka metro)
const PAN_BOUNDS: L.LatLngBoundsExpression = [[23.30, 89.80], [24.15, 91.00]];

// ─── FitToView — perfectly fills screen with the Dhaka area on load ─────
function FitToView() {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      map.fitBounds(PAN_BOUNDS, { animate: false, padding: [0, 0] });
    });
  }, [map]);

  return null;
}

// ─── Main MapView ───────────────────────────────────────────────────────────
export function MapView({
  isVisible = true,
  takeDefs = [],
  takeActiveIds = new Set<string>(),
  takeFetchGeoJson,
}: {
  isVisible?: boolean;
  takeDefs?: TakeLayerDef[];
  takeActiveIds?: Set<string>;
  takeFetchGeoJson?: (layerId: string, bbox: string) => Promise<GeoJSON.FeatureCollection | null>;
}) {
  const showHoneycomb = useAppStore((s) => s.showHoneycomb);
  const [maskData, setMaskData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/dhaka_square_mask.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch mask");
        return res.json();
      })
      .then((data) => setMaskData(data))
      .catch((err) => setError((prev) => prev || err.message));
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-red-500">
        Error loading map: {error}
      </div>
    );
  }

  if (!maskData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-zinc-400">
        Loading map...
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={BD_CENTER}
        zoom={BD_ZOOM}
        className="w-full h-full bg-black z-0"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={true}
        minZoom={10}
        maxZoom={18}
        maxBounds={PAN_BOUNDS}
        maxBoundsViscosity={1.0}
      >
        <FitToView />
        <MapFlyTo />
        <MapResizeHandler isVisible={isVisible} />

        {/* Base map — no labels (clean, no Bangla) */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        />

        {/* Black mask — covers everything outside a huge rectangle around Bangladesh */}
        <GeoJSON
          data={maskData}
          interactive={false}
          style={{
            fillColor: "#000000",
            fillOpacity: 1,
            color: "transparent",
            weight: 0,
          }}
        />

        {/* English-only place labels */}
        <EnglishLabels />

        {/* Compact Dhaka honeycomb risk overlay */}
        <MultiScaleHazardLayer visible={showHoneycomb} />

        {/* Take GeoJSON Layers (waterways, buildings, POIs, etc.) */}
        {takeFetchGeoJson && takeDefs.length > 0 && (
          <TakeGeoJsonLayers
            defs={takeDefs}
            activeIds={takeActiveIds}
            fetchGeoJson={takeFetchGeoJson}
          />
        )}

        {/* Roads — always on */}
        <RoadOverlayLayer />

        {/* Employee Coverage Heatmap */}
        <EmployeeHeatmapLayer />

        {/* Employee Markers + Trails */}
        <EmployeeMarkersLayer />
      </MapContainer>
    </div>
  );
}
