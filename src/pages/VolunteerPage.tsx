import { useState, useEffect } from 'react';
import { getWsBaseUrl } from '../config/api';
import { Radio, BatteryLow, Wifi, WifiOff, MapPin } from 'lucide-react';
import { SOSGrid } from '../components/Volunteer/SOSGrid';
import type { SOSCategory } from '../components/Volunteer/SOSGrid';
import { SlideToConfirm } from '../components/Volunteer/SlideToConfirm';

function generateVolunteerId(): string {
  return 'VOL-' + Math.floor(100 + Math.random() * 900);
}

interface SOSPayload {
  event_id: string;
  timestamp: string;
  volunteer: {
    id: string;
    name: string;
    assigned_station: string;
  };
  current_assignment: {
    task_id: string;
    description: string;
    status: string;
  };
  sos_details: {
    type: string;
    code: string;
    severity_level: string;
  };
  telemetry: {
    coordinates: { latitude: number; longitude: number };
    location_accuracy_meters: number;
    battery_level: number;
    network_mode: string;
  };
}

export function VolunteerPage() {
  const [volunteerId] = useState(generateVolunteerId);
  const [selectedCategory, setSelectedCategory] = useState<SOSCategory | null>(null);
  const [sentPayload, setSentPayload] = useState<SOSPayload | null>(null);
  const [battery] = useState(() => Math.floor(10 + Math.random() * 60));
  const [coords, setCoords] = useState({ lat: 23.8103, lng: 90.4125 });
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Attempt GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { /* keep default Dhaka coords */ }
      );
    }
  }, []);

  // WebSocket for broadcasting
  useEffect(() => {
    const wsUrl = `${getWsBaseUrl()}/ws/telemetry`;

    console.log("Volunteer Portal connecting to WS:", wsUrl);
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      console.log("Volunteer Portal WS Connected");
      setWsConnected(true);
    };
    socket.onclose = () => {
      console.log("Volunteer Portal WS Disconnected");
      setWsConnected(false);
    };
    setWs(socket);
    return () => socket.close();
  }, []);

  const handleConfirm = () => {
    if (!selectedCategory) return;

    const payload: SOSPayload = {
      event_id: `sos_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      volunteer: {
        id: volunteerId,
        name: 'Field Team Lead',
        assigned_station: 'STATION-04-DHAKA-SOUTH',
      },
      current_assignment: {
        task_id: `TSK-${Math.floor(100 + Math.random() * 900)}`,
        description: 'Active field deployment',
        status: 'interrupted',
      },
      sos_details: {
        type: selectedCategory.label_en,
        code: selectedCategory.code,
        severity_level: selectedCategory.severity,
      },
      telemetry: {
        coordinates: { latitude: coords.lat, longitude: coords.lng },
        location_accuracy_meters: parseFloat((2 + Math.random() * 10).toFixed(1)),
        battery_level: battery,
        network_mode: wsConnected ? 'WebSocket' : 'Mesh_P2P',
      },
    };

    // Send over WebSocket if available
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'volunteer_sos', payload }));
    }

    setSentPayload(payload);
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setSentPayload(null);
  };

  const colorKey = selectedCategory
    ? selectedCategory.id === 'medical_evac' ? 'red'
    : selectedCategory.id === 'stranded' ? 'orange'
    : selectedCategory.id === 'route_blocked' ? 'yellow'
    : selectedCategory.id === 'supply_critical' ? 'blue'
    : 'black'
    : 'red';

  // ─── SENT CONFIRMATION SCREEN ─────────────────────────────
  if (sentPayload) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center mb-6 animate-pulse">
          <Radio size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-black text-white mb-2">SOS Dispatched</h1>
        <p className="text-lg text-green-400 font-bold mb-1">
          {sentPayload.sos_details.code} — {sentPayload.sos_details.type}
        </p>
        <p className="text-zinc-500 text-sm mb-6">
          Payload transmitted at {new Date(sentPayload.timestamp).toLocaleTimeString()}
        </p>

        {/* JSON Debug Panel */}
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-left overflow-auto max-h-64 mb-6">
          <p className="text-[10px] uppercase text-zinc-500 font-bold mb-2">Transmitted Payload</p>
          <pre className="text-[11px] text-green-300 font-mono whitespace-pre-wrap">
            {JSON.stringify(sentPayload, null, 2)}
          </pre>
        </div>

        <button
          onClick={handleReset}
          className="w-full max-w-md py-4 rounded-xl bg-zinc-800 text-white font-bold text-lg hover:bg-zinc-700 transition-colors"
        >
          New SOS / নতুন সংকেত
        </button>
      </div>
    );
  }

  // ─── SLIDE-TO-CONFIRM SCREEN ──────────────────────────────
  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xl font-black text-white text-center">
            Confirm {selectedCategory.label_en}
          </h2>
          <p className="text-center text-zinc-500 text-sm mt-1">
            {selectedCategory.label_bn} — {selectedCategory.code}
          </p>
        </div>

        {/* Big Icon */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className={`w-28 h-28 rounded-3xl ${selectedCategory.bg} flex items-center justify-center ${selectedCategory.color}`}>
            {selectedCategory.icon}
          </div>
          <p className="text-zinc-400 text-sm max-w-xs text-center px-4">
            Slide the bar below to broadcast this SOS signal. Your GPS coordinates, battery level, and mission context will be automatically attached.
          </p>
        </div>

        {/* Slider */}
        <SlideToConfirm
          label={selectedCategory.label_en}
          color={colorKey}
          onConfirm={handleConfirm}
          onCancel={() => setSelectedCategory(null)}
        />
      </div>
    );
  }

  // ─── MAIN GRID SCREEN ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-white font-black text-lg">
            🚨 SOS Portal
          </span>
          <span className="text-zinc-600 text-xs font-mono">{volunteerId}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-zinc-400">
            <MapPin size={12} />
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <BatteryLow size={12} /> {battery}%
          </span>
          <span className={`flex items-center gap-1 ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
            {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {wsConnected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-zinc-500 text-sm text-center">
          Tap the emergency type below / নিচে জরুরি ধরন নির্বাচন করুন
        </p>
      </div>

      {/* Fat Finger Grid */}
      <SOSGrid onSelect={setSelectedCategory} disabled={false} />
    </div>
  );
}
