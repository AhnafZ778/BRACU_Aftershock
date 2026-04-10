/**
 * SosAlertLayer — Renders pulsing SOS markers on the map.
 *
 * When an employee presses the SOS button on the Employee Portal,
 * a dramatic pulsing marker appears at their exact position on the dashboard map.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEmployeeStore, type SosAlert } from '../../store/useEmployeeStore';

// Inject keyframes once
const STYLE_ID = 'sos-alert-keyframes';
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes sosPulse {
      0%   { transform: scale(1);   opacity: 1; }
      50%  { transform: scale(1.6); opacity: 0.4; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes sosGlow {
      0%, 100% { box-shadow: 0 0 12px var(--sos-color), 0 0 24px var(--sos-color); }
      50%      { box-shadow: 0 0 24px var(--sos-color), 0 0 48px var(--sos-color); }
    }
  `;
  document.head.appendChild(style);
}

function createSosIcon(alert: SosAlert) {
  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <div style="position:relative;width:40px;height:40px;--sos-color:${alert.color};">
        <!-- Expanding pulse ring -->
        <div style="
          position:absolute; inset:-8px;
          border-radius:50%;
          border:3px solid ${alert.color};
          animation: sosPulse 1.5s ease-out infinite;
        "></div>
        <!-- Core dot -->
        <div style="
          position:absolute; inset:0;
          border-radius:50%;
          background: radial-gradient(circle at 35% 35%, ${alert.color}, ${alert.color}bb);
          border: 3px solid #fff;
          animation: sosGlow 1.2s ease-in-out infinite;
          display:flex; align-items:center; justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <!-- Name label -->
        <div style="
          position:absolute;
          top:-30px; left:50%; transform:translateX(-50%);
          white-space:nowrap;
          background:${alert.color};
          color:#fff;
          font-size:11px;
          font-weight:800;
          padding:3px 10px;
          border-radius:6px;
          box-shadow:0 2px 12px rgba(0,0,0,0.4);
          letter-spacing:0.04em;
          font-family:'Inter',system-ui,sans-serif;
        ">⚠ ${alert.employeeName}</div>
        <!-- Area label -->
        <div style="
          position:absolute;
          bottom:-22px; left:50%; transform:translateX(-50%);
          white-space:nowrap;
          background:rgba(0,0,0,0.85);
          color:${alert.color};
          font-size:9px;
          font-weight:700;
          padding:2px 8px;
          border-radius:4px;
          letter-spacing:0.06em;
          text-transform:uppercase;
          font-family:'Inter',system-ui,sans-serif;
        ">SOS · ${alert.area}</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -36],
  });
}

export function SosAlertLayer() {
  const map = useMap();
  const { sosAlerts } = useEmployeeStore();
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    ensureKeyframes();
  }, []);

  useEffect(() => {
    const markers = markersRef.current;
    const activeTimestamps = new Set(sosAlerts.map((a) => a.timestamp));

    // Remove markers for cleared alerts
    for (const [ts, marker] of markers) {
      if (!activeTimestamps.has(ts)) {
        map.removeLayer(marker);
        markers.delete(ts);
      }
    }

    // Add new markers
    for (const alert of sosAlerts) {
      if (markers.has(alert.timestamp)) continue;

      const marker = L.marker([alert.lat, alert.lng], {
        icon: createSosIcon(alert),
        zIndexOffset: 9999, // Always on top
      })
        .bindPopup(`
          <div style="font-family:'Inter',system-ui,sans-serif;padding:4px 0;min-width:180px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${alert.color};box-shadow:0 0 8px ${alert.color};"></span>
              <span style="font-size:14px;font-weight:700;color:#f1f5f9;">SOS Alert</span>
            </div>
            <div style="font-size:11px;color:#94a3b8;line-height:1.7;">
              <div>👤 <strong>${alert.employeeName}</strong></div>
              <div>📍 ${alert.area}</div>
              <div>🆔 ${alert.employeeId}</div>
              <div>🕐 ${new Date(alert.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        `, { closeButton: false, maxWidth: 240 })
        .addTo(map);

      markers.set(alert.timestamp, marker);
    }
  }, [sosAlerts, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, m] of markersRef.current) map.removeLayer(m);
      markersRef.current.clear();
    };
  }, [map]);

  return null;
}
