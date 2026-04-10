import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { RoadOverlayLayer } from './roads/RoadOverlayLayer';
import { TelemetryLayer } from './TelemetryLayer';

// ─── Bangladesh center & zoom (shows entire country) ────────────────────────
const BD_CENTER: [number, number] = [23.685, 90.356];
const BD_ZOOM = 7;

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

// ─── Main MapView ───────────────────────────────────────────────────────────
export function MapView({
  isVisible = true,
}: {
  isVisible?: boolean;
}) {
  const [maskData, setMaskData] = useState<any>(null);
  const [borderData, setBorderData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the perfect world mask (world polygon with Bangladesh cut out)
    fetch("/perfect_world_mask.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch world mask");
        return res.json();
      })
      .then((data) => setMaskData(data))
      .catch((err) => setError((prev) => prev || err.message));

    // Fetch the Bangladesh border outline
    fetch("/bangladesh_simplified.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch border");
        return res.json();
      })
      .then((data) => setBorderData(data))
      .catch((err) => setError((prev) => prev || err.message));
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-red-500">
        Error loading map: {error}
      </div>
    );
  }

  if (!maskData || !borderData) {
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
        minZoom={6}
        maxZoom={18}
      >
        <MapFlyTo />
        <MapResizeHandler isVisible={isVisible} />

        {/* Google Maps-style tiles (CartoDB Voyager) */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {/* Black mask — everything outside Bangladesh is blacked out */}
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

        {/* Bangladesh border line */}
        <GeoJSON
          data={borderData}
          interactive={false}
          style={{
            fillColor: "transparent",
            fillOpacity: 0,
            color: "rgba(30, 41, 59, 0.6)",
            weight: 2,
          }}
        />

        {/* Roads — always on */}
        <RoadOverlayLayer />

        {/* Telemetry (Agents, Mesh Links, DBSCAN Zones) */}
        <TelemetryLayer />
      </MapContainer>
    </div>
  );
}
