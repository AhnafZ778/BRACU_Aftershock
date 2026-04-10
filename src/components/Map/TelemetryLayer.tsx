import { Polyline, GeoJSON, Popup, CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useTelemetryStore } from '../../store/useTelemetryStore';

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeAlertLatLng = (alert: any): [number, number] | null => {
  const latRaw = toFiniteNumber(alert?.telemetry?.coordinates?.latitude);
  const lngRaw = toFiniteNumber(alert?.telemetry?.coordinates?.longitude);

  if (latRaw == null || lngRaw == null) return null;

  const latInRange = latRaw >= -90 && latRaw <= 90;
  const lngInRange = lngRaw >= -180 && lngRaw <= 180;
  if (latInRange && lngInRange) return [latRaw, lngRaw];

  const swappedLatInRange = lngRaw >= -90 && lngRaw <= 90;
  const swappedLngInRange = latRaw >= -180 && latRaw <= 180;
  if (swappedLatInRange && swappedLngInRange) return [lngRaw, latRaw];

  return null;
};

// Helper for Pulse Animation
const createPulsingIcon = (isCritical: boolean) => {
  const color = isCritical ? '#ef4444' : '#3b82f6'; // red for critical, blue for others
  const animation = isCritical ? 'animation:pulse 1s cubic-bezier(0.4,0,0.6,1) infinite;' : '';
  const shadow = isCritical ? `box-shadow: 0 0 15px ${color};` : `box-shadow: 0 0 8px ${color};`;
  
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div style="width:16px;height:16px;border-radius:50%;background-color:${color};border:2px solid white;${shadow}${animation}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -12],
  });
};

export function TelemetryLayer() {
  const { agents, links, zones, distressSignals, broadcastedAlerts, selectedSosId, selectedHotspotId } = useTelemetryStore();

  // Helper to build coords for Mesh Links
  const getLineString = (sourceId: string, targetId: string) => {
    const s = agents.find(a => a.id === sourceId);
    const t = agents.find(a => a.id === targetId);
    if (!s || !t) return null;
    return [[s.lat, s.lng], [t.lat, t.lng]] as [number, number][];
  };

  return (
    <>
      {/* 1. Rescue Zones (DBSCAN Clusters) */}
      {zones.map((z) => {
        const severity = (z.severity || 'moderate').toLowerCase();
        const zoneColor = severity === 'critical' ? '#d50000' : severity === 'high' ? '#f97316' : '#eab308';
        const isSelectedHotspot = selectedHotspotId === z.id;

        const geojsonData: GeoJSON.Feature = {
          type: 'Feature',
          properties: { id: z.id },
          geometry: z.geometry
        };

        return (
          <GeoJSON
            key={z.id}
            data={geojsonData}
            style={{
              color: zoneColor,
              fillColor: zoneColor,
              fillOpacity: isSelectedHotspot ? 0.32 : 0.2,
              weight: isSelectedHotspot ? 4 : 2,
              dashArray: isSelectedHotspot ? '3, 7' : '10, 10'
            }}
          >
            <Popup className="text-zinc-900 border-none rounded">
               <div className="font-bold" style={{ color: zoneColor }}>
                 {severity.toUpperCase()} Rescue Hotspot
               </div>
               <div className="text-sm">Distress agents: {z.agent_count}</div>
               {typeof z.priority_score === 'number' && (
                 <div className="text-xs mt-1">Priority score: {z.priority_score}/100</div>
               )}
               {typeof z.confidence === 'number' && (
                 <div className="text-xs">Confidence: {z.confidence}%</div>
               )}
               {typeof z.radius_km === 'number' && (
                 <div className="text-xs">Cluster radius: {z.radius_km} km</div>
               )}
               {typeof z.avg_battery === 'number' && (
                 <div className="text-xs">Avg distress battery: {z.avg_battery}%</div>
               )}
               {z.recommended_action && (
                 <div className="text-xs mt-1 font-medium text-zinc-700">{z.recommended_action}</div>
               )}
               {isSelectedHotspot && (
                 <div className="text-xs mt-1 font-semibold text-cyan-700">Currently focused on dashboard</div>
               )}
            </Popup>
          </GeoJSON>
        );
      })}

      {/* 1.25 Selected hotspot center beacon */}
      {zones
        .filter((z) => z.id === selectedHotspotId)
        .map((z) => (
          <Marker
            key={`hotspot-focus-${z.id}`}
            position={[z.center[0], z.center[1]]}
            icon={L.divIcon({
              className: 'bg-transparent',
              html: `<div style="position:relative;width:24px;height:24px;"><div style="position:absolute;inset:0;border-radius:50%;border:3px solid #22d3ee;box-shadow:0 0 20px rgba(34,211,238,0.8);animation:pulse 1.1s cubic-bezier(0.4,0,0.6,1) infinite;"></div><div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:#22d3ee;"></div></div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -14],
            })}
          >
            <Popup className="text-zinc-900 border-none rounded">
              <div className="font-bold text-cyan-700 text-xs">Focused Hotspot</div>
              <div className="text-xs">{z.id}</div>
              <div className="text-xs">Priority: {z.priority_score ?? 0}</div>
            </Popup>
          </Marker>
        ))}

      {/* 1.5 Raw distress pings (unfiltered) */}
      {distressSignals.map((signal) => (
        <CircleMarker
          key={`${signal.agent_id}-${signal.timestamp}`}
          center={[signal.lat, signal.lng]}
          radius={3}
          pathOptions={{
            color: '#ff8a80',
            fillColor: '#ff1744',
            fillOpacity: 0.9,
            weight: 1
          }}
        >
          <Popup className="text-zinc-900 border-none rounded">
            <div className="font-bold text-red-600 text-xs">Distress Signal</div>
            <div className="text-xs">Agent: {signal.agent_id}</div>
            {typeof signal.battery === 'number' && (
              <div className="text-xs">Battery: {signal.battery}%</div>
            )}
          </Popup>
        </CircleMarker>
      ))}

      {/* 2. Mesh Links */}
      {links.map((link, i) => {
        const pts = getLineString(link.source, link.target);
        if (!pts) return null;
        
        // Stronger signal = higher opacity and thicker line
        const opacity = Math.min(1, Math.max(0.1, (link.rssi + 110) / 60));
        
        return (
          <Polyline
            key={`link-${i}`}
            positions={pts}
            pathOptions={{
              color: '#00e5ff',
              weight: 1.5,
              opacity: opacity,
              dashArray: '4, 6'
            }}
          />
        );
      })}

      {/* 3. Moving Agents */}
      {agents.map((a) => {
        const isDistress = a.status === 'distress';
        const color = isDistress ? '#ff1744' : '#00e676';
        
        return (
          <CircleMarker
            key={a.id}
            center={[a.lat, a.lng]}
            radius={isDistress ? 6 : 4}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: 0.8,
              weight: isDistress ? 2 : 1
            }}
          >
            <Popup className="text-zinc-900 border-none rounded">
              <div className="font-bold text-sm mb-1">{a.id}</div>
              <div className="text-xs">
                Status: <span className={isDistress ? 'text-red-500 font-bold' : 'text-green-500'}>{a.status.toUpperCase()}</span>
                <br/>
                Battery: {Math.round(a.battery)}%
                <br/>
                Lat: {a.lat.toFixed(5)}<br/>
                Lng: {a.lng.toFixed(5)}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* 4. Approved Volunteer SOS Units (with Triage Pulse) */}
      {broadcastedAlerts.map(({ alert: v, proximity }) => {
        const markerLatLng = normalizeAlertLatLng(v);
        if (!markerLatLng) return null;

        const isCritical = v.sos_details.severity_level === 'Critical';
        const isSelected = v.event_id === selectedSosId;
        
        // Selected marker gets a large labeled icon with volunteer ID
        const selectedIcon = L.divIcon({
          className: 'bg-transparent',
          html: `<div style="position:relative;">
            <div style="width:24px;height:24px;border-radius:50%;background-color:${isCritical ? '#ef4444' : '#3b82f6'};border:3px solid #fff;box-shadow:0 0 20px ${isCritical ? '#ef4444' : '#3b82f6'}, 0 0 40px ${isCritical ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'};animation:pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite;"></div>
            <div style="position:absolute;top:-32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${isCritical ? '#ef4444' : '#3b82f6'};color:#fff;font-size:11px;font-weight:900;padding:3px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);letter-spacing:0.5px;">${v.volunteer.id}</div>
            <div style="position:absolute;top:34px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.85);color:${isCritical ? '#fca5a5' : '#93c5fd'};font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:0.5px;">${v.sos_details.type}</div>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -40],
        });

        return (
          <Marker
            key={v.event_id}
            position={markerLatLng}
            icon={isSelected ? selectedIcon : createPulsingIcon(isCritical)}
          >
            <Popup className="text-zinc-900 border-none rounded shadow-2xl">
              <div className="font-bold text-blue-600 flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${isCritical ? 'bg-red-500' : 'bg-blue-600'}`}>
                  {isCritical ? 'CRITICAL SOS' : 'APPROVED'}
                </span>
                {v.volunteer.id}
              </div>
              <div className="text-xs mt-2">
                <p className="font-bold text-zinc-800">{v.sos_details.code}: {v.sos_details.type}</p>
                <p className="text-zinc-500 mt-1">{v.volunteer.name} — {v.volunteer.assigned_station}</p>
                <div className="mt-2 pt-2 border-t border-zinc-100 flex justify-between">
                  <span>Battery: {v.telemetry.battery_level}%</span>
                  <span className="text-blue-600 font-bold">{proximity.stations_notified} stations</span>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
