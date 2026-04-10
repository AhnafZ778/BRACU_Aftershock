import { useState, useEffect } from 'react';
import { useMapEvents, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAppStore } from '../../store/useAppStore';
import { fetchEvacuationRoute, triggerRoutingWarmup } from '../../services/mapDataAccess';

const startIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width:14px;height:14px;border-radius:50%;background-color:#22c55e;border:2px solid #fff;box-shadow:0 0 8px #22c55e;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const endIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div style="width:14px;height:14px;border-radius:50%;background-color:#ef4444;border:2px solid #fff;box-shadow:0 0 8px #ef4444;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function EvacuationRouteLayer() {
  const { showRouting } = useAppStore();
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const map = useMap();

  useMapEvents({
    click(e) {
      if (!showRouting) return;
      const { lat, lng } = e.latlng;
      if (!startPoint) {
        setStartPoint([lat, lng]);
      } else if (!endPoint) {
        setEndPoint([lat, lng]);
      } else {
        setStartPoint([lat, lng]);
        setEndPoint(null);
        setRouteCoords([]);
      }
    }
  });

  useEffect(() => {
    if (!showRouting) {
      setStartPoint(null);
      setEndPoint(null);
      setRouteCoords([]);
      return;
    }
    // Warm routing engine when user enables routing mode.
    triggerRoutingWarmup().catch(() => undefined);
  }, [showRouting]);

  useEffect(() => {
    if (startPoint && endPoint && showRouting) {
      setLoading(true);
      fetchEvacuationRoute(
        { lat: startPoint[0], lng: startPoint[1] },
        { lat: endPoint[0], lng: endPoint[1] }
      )
      .then(data => {
        if (data.route && data.route.geometry && data.route.geometry.coordinates) {
          const coords = data.route.geometry.coordinates.map((coord: any) => [coord[1], coord[0]] as [number, number]);
          if (coords.length > 0) {
              setRouteCoords(coords);
              map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] });
          }
        } else if (data.error) {
          console.error('[EvacuationRoute] Backend error:', data.error);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    }
  }, [startPoint, endPoint, showRouting, map]);

  if (!showRouting) return null;

  return (
    <>
      {startPoint && (
        <Marker position={startPoint} icon={startIcon}>
          <Popup className="text-zinc-900 font-sans">
            <div className="font-bold">Evacuation Start</div>
            <div className="text-xs text-zinc-500">
              {startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}
            </div>
          </Popup>
        </Marker>
      )}
      {endPoint && (
        <Marker position={endPoint} icon={endIcon}>
          <Popup className="text-zinc-900 font-sans">
            <div className="font-bold">Safe Zone</div>
            <div className="text-xs text-zinc-500">
              {loading ? 'Calculating safe route...' : `${endPoint[0].toFixed(4)}, ${endPoint[1].toFixed(4)}`}
            </div>
          </Popup>
        </Marker>
      )}
      {routeCoords.length > 0 && (
        <Polyline 
          positions={routeCoords} 
          pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.9, dashArray: '8, 8' }} 
        />
      )}
    </>
  );
}
