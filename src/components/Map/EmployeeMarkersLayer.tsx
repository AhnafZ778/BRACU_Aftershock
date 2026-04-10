/**
 * EmployeeMarkersLayer — Renders employee dots and trail polylines on the map.
 *
 * Each employee is shown as a pulsing colored dot with a popup.
 * Their trail is rendered as a faded polyline behind them.
 */
import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useEmployeeStore } from '../../store/useEmployeeStore';

export function EmployeeMarkersLayer() {
  const map = useMap();
  const { employees, showEmployees } = useEmployeeStore();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const trailsRef = useRef<Map<string, L.Polyline>>(new Map());

  useEffect(() => {
    const markers = markersRef.current;
    const trails = trailsRef.current;

    if (!showEmployees) {
      // Remove all
      for (const [, m] of markers) map.removeLayer(m);
      for (const [, t] of trails) map.removeLayer(t);
      markers.clear();
      trails.clear();
      return;
    }

    // Update or create markers and trails
    for (const emp of employees) {
      // ── Trail polyline ──
      const trailCoords = emp.trail.map(([lat, lng]) => [lat, lng] as L.LatLngExpression);
      
      if (trails.has(emp.id)) {
        trails.get(emp.id)!.setLatLngs(trailCoords);
      } else if (trailCoords.length > 1) {
        const trail = L.polyline(trailCoords, {
          color: emp.color,
          weight: 2.5,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: '4, 6',
        }).addTo(map);
        trails.set(emp.id, trail);
      }

      // ── Employee marker ──
      const icon = L.divIcon({
        className: 'bg-transparent',
        html: `
          <div style="position:relative;width:20px;height:20px;">
            <div style="
              position:absolute;inset:0;
              border-radius:50%;
              background:${emp.color};
              border:2px solid rgba(255,255,255,0.9);
              box-shadow:0 0 12px ${emp.color}88, 0 0 24px ${emp.color}44;
              animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
            "></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -14],
      });

      if (markers.has(emp.id)) {
        markers.get(emp.id)!.setLatLng([emp.lat, emp.lng]);
        markers.get(emp.id)!.setIcon(icon);
      } else {
        const marker = L.marker([emp.lat, emp.lng], { icon })
          .bindPopup(`
            <div style="font-family:'Inter',system-ui,sans-serif;min-width:160px;padding:4px 0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${emp.color};display:inline-block;box-shadow:0 0 6px ${emp.color};"></span>
                <span style="font-size:14px;font-weight:700;color:#f1f5f9;">${emp.name}</span>
              </div>
              <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
                <div>📍 <strong>${emp.area}</strong></div>
                <div>🆔 ${emp.id}</div>
                <div>📊 ${emp.trail.length} points logged</div>
                <div>🔋 Status: <span style="color:${emp.status === 'active' ? '#22c55e' : '#eab308'};font-weight:600;">${emp.status.toUpperCase()}</span></div>
              </div>
            </div>
          `, { closeButton: false, maxWidth: 220 })
          .addTo(map);
        markers.set(emp.id, marker);
      }
    }

    // Cleanup removed employees
    for (const [id] of markers) {
      if (!employees.find((e) => e.id === id)) {
        map.removeLayer(markers.get(id)!);
        markers.delete(id);
        if (trails.has(id)) {
          map.removeLayer(trails.get(id)!);
          trails.delete(id);
        }
      }
    }
  }, [employees, showEmployees, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, m] of markersRef.current) map.removeLayer(m);
      for (const [, t] of trailsRef.current) map.removeLayer(t);
      markersRef.current.clear();
      trailsRef.current.clear();
    };
  }, [map]);

  return null;
}
