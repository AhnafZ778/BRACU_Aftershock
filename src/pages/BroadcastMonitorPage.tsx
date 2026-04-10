import { useEffect, useRef, useState } from 'react';
import { getWsBaseUrl } from '../config/api';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, MapPin, AlertTriangle, Send, CheckCircle2, Truck, HelpCircle, XCircle, Battery, Wifi, Navigation, Activity } from 'lucide-react';
import { MapView } from '../components/Map/MapView';
import { useMeshStore } from '../store/useMeshStore';

const RESPONSE_OPTIONS = [
  { value: 'acknowledged', label: 'Acknowledged', icon: CheckCircle2, color: 'emerald' },
  { value: 'dispatching', label: 'Dispatching Team', icon: Truck, color: 'blue' },
  { value: 'need_backup', label: 'Need Backup', icon: HelpCircle, color: 'amber' },
  { value: 'unable', label: 'Unable to Respond', icon: XCircle, color: 'red' },
] as const;

interface MonitorAlertEntry {
  eventId: string;
  timestamp: string;
  volunteerId: string;
  volunteerName: string;
  sosType: string;
  sosCode: string;
  severityLevel: string;
  batteryLevel: number;
  networkMode: string;
  latitude: number;
  longitude: number;
  stationsNotified: number;
  totalStations: number;
}

const toSafeString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim() ? value : fallback;
};

const toSafeNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeBroadcastEntry = (entry: any): MonitorAlertEntry | null => {
  const alert = entry?.alert;
  if (!alert || typeof alert !== 'object') return null;

  const eventId = toSafeString(alert?.event_id, '');
  if (!eventId) return null;

  return {
    eventId,
    timestamp: toSafeString(alert?.timestamp, new Date().toISOString()),
    volunteerId: toSafeString(alert?.volunteer?.id, 'Unknown-ID'),
    volunteerName: toSafeString(alert?.volunteer?.name, 'Unknown Volunteer'),
    sosType: toSafeString(alert?.sos_details?.type, 'General SOS'),
    sosCode: toSafeString(alert?.sos_details?.code, 'SOS'),
    severityLevel: toSafeString(alert?.sos_details?.severity_level, 'Moderate'),
    batteryLevel: toSafeNumber(alert?.telemetry?.battery_level, 0),
    networkMode: toSafeString(alert?.telemetry?.network_mode, 'unknown'),
    latitude: toSafeNumber(alert?.telemetry?.coordinates?.latitude, 23.685),
    longitude: toSafeNumber(alert?.telemetry?.coordinates?.longitude, 90.3563),
    stationsNotified: toSafeNumber(entry?.proximity?.stations_notified, 0),
    totalStations: toSafeNumber(entry?.proximity?.total_stations, 10),
  };
};

export function BroadcastMonitorPage() {
  const { broadcastedAlerts, stationResponses, selectedSosId, setSelectedSosId } = useTelemetryStore();
  const { lowBandwidthMode } = useMeshStore();
  const [now, setNow] = useState(Date.now());
  const [openResponseId, setOpenResponseId] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<string>('dispatching');
  const wsRef = useRef<WebSocket | null>(null);

  const isNgoDispatchAlert = (alert: MonitorAlertEntry) => {
    const type = String(alert.sosType || '').toLowerCase();
    const code = String(alert.sosCode || '').toLowerCase();
    return type.includes('ngo dispatch') || code.startsWith('ngo-disp-');
  };

  // tick every second for relative timestamps
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // WS connection for sending responses
  useEffect(() => {
    const wsUrl = `${getWsBaseUrl()}/ws/telemetry`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log("Broadcast Monitor WS Connected to", wsUrl);
    ws.onclose = () => console.log("Broadcast Monitor WS Disconnected");
    ws.onerror = (err) => console.error("Broadcast Monitor WS Error", err);
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const timeAgo = (ts: string) => {
    const diff = Math.max(0, Math.floor((now - new Date(ts).getTime()) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const calculateTriageScore = (alert: MonitorAlertEntry) => {
    const sevMap: Record<string, number> = { 'Critical': 5, 'High': 4, 'Moderate': 3, 'Low': 2, 'Safe': 1 };
    const sev = sevMap[alert.severityLevel] || 1;
    const mins = Math.max(0.1, (now - new Date(alert.timestamp).getTime()) / 60000);
    return (sev * mins).toFixed(1);
  };

  const handleSendResponse = (eventId: string, stationId: number, sosType: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'station_response',
      event_id: eventId,
      station_id: stationId,
      response_type: selectedResponse,
      sos_type: sosType,
      message: RESPONSE_OPTIONS.find(r => r.value === selectedResponse)?.label || selectedResponse
    }));
    
    setOpenResponseId(null);
  };

  const getResponseIcon = (type: string) => {
    const opt = RESPONSE_OPTIONS.find(r => r.value === type);
    if (!opt) return <CheckCircle2 size={10} />;
    const Icon = opt.icon;
    return <Icon size={10} />;
  };

  const getResponseColor = (type: string) => {
    switch (type) {
      case 'acknowledged': return 'text-emerald-400';
      case 'dispatching': return 'text-blue-400';
      case 'need_backup': return 'text-amber-400';
      case 'unable': return 'text-red-400';
      default: return 'text-zinc-400';
    }
  };

  const pinpointSosOnMap = (eventId: string) => {
    // Re-clicking an already-selected SOS should still re-trigger map fly-to.
    if (selectedSosId === eventId) {
      setSelectedSosId(null);
      requestAnimationFrame(() => setSelectedSosId(eventId));
      return;
    }
    setSelectedSosId(eventId);
  };

  const safeBroadcastedAlerts = broadcastedAlerts
    .map((entry) => normalizeBroadcastEntry(entry))
    .filter((entry): entry is MonitorAlertEntry => entry !== null);

  useEffect(() => {
    if (safeBroadcastedAlerts.length === 0) {
      if (selectedSosId !== null) setSelectedSosId(null);
      return;
    }

    const currentStillExists = selectedSosId
      ? safeBroadcastedAlerts.some((a) => a.eventId === selectedSosId)
      : false;

    if (!currentStillExists) {
      setSelectedSosId(safeBroadcastedAlerts[0].eventId);
    }
  }, [safeBroadcastedAlerts, selectedSosId, setSelectedSosId]);

  const sortedAlerts = [...safeBroadcastedAlerts].sort((a, b) => {
    return parseFloat(calculateTriageScore(b)) - parseFloat(calculateTriageScore(a));
  });

  const selectedData = sortedAlerts.find(a => a.eventId === selectedSosId) || sortedAlerts[0];
  const selectedIsNgoDispatch = selectedData ? isNgoDispatchAlert(selectedData) : false;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 overflow-hidden relative pt-20">
      
      {/* WebRTC handled globally via RightPanel */}

      {/* ── Header ───────────────────────────── */}
      <header className="relative px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur shrink-0 flex items-center justify-between z-[1000] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/10">
            <Radio size={20} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-white font-black text-lg tracking-tight flex items-center gap-2">
              Control Station Admin
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            </h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Triage Engine Active — Broadcast to {safeBroadcastedAlerts.length > 0 ? safeBroadcastedAlerts[0].totalStations || 10 : 10} nearest assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono pr-80">
          {/* Global controls moved to RightPanel */}
        </div>
      </header>

      {/* ── Main Dashboard Layout ────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        {safeBroadcastedAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 absolute inset-0 z-50 bg-zinc-950">
            <div className="w-20 h-20 rounded-full bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center">
              <AlertTriangle size={32} className="text-zinc-700" />
            </div>
            <div>
              <p className="text-zinc-500 text-sm font-semibold">No SOS Broadcasts</p>
              <p className="text-zinc-600 text-xs mt-1 max-w-xs">
                Awaiting field signals...
              </p>
            </div>
          </div>
        ) : (
          <>
            {lowBandwidthMode ? (
              /* TEXT-ONLY LOW BANDWIDTH MODE */
              <div className="h-full overflow-y-auto w-full max-w-7xl mx-auto p-8 custom-scrollbar">
                <div className="mb-6 flex justify-between items-end border-b border-zinc-800 pb-4">
                  <div>
                    <h2 className="text-white font-black text-2xl tracking-tight">Active Dispatches</h2>
                    <p className="text-zinc-500 text-xs mt-1 font-mono">{safeBroadcastedAlerts.length} Units on Site</p>
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 font-bold font-mono">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> MAP ENGINE DISABLED
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedAlerts.map((alert) => {
                    const isCritical = alert.severityLevel === 'Critical';
                    const score = calculateTriageScore(alert);
                    return (
                      <div key={alert.eventId} className={`p-4 rounded-xl border ${isCritical ? 'bg-red-950/20 border-red-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center gap-2">
                             <div className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${isCritical ? 'bg-red-500 text-white' : 'bg-emerald-500 text-zinc-950'}`}>
                               {alert.severityLevel}
                             </div>
                             <span className="text-white font-bold text-sm tracking-tight">{alert.sosType}</span>
                           </div>
                           <span className="text-xl font-black text-zinc-500 tracking-tighter" title="Priority Score">U-{score}</span>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono space-y-1 mb-4">
                           <p className="text-white">{alert.volunteerName} ({alert.volunteerId})</p>
                           <p>Time: {timeAgo(alert.timestamp)}</p>
                           <p>Battery: {alert.batteryLevel}% | Net: {alert.networkMode}</p>
                           <p>Stations: {alert.stationsNotified}/{alert.totalStations}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* THREE-PANE LAYOUT */
              <div className="flex h-full">
                
                {/* PANE 1: Triage Rail */}
                <div className="w-80 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/40 backdrop-blur flex flex-col z-[100] shadow-2xl relative">
                  <div className="p-4 border-b border-zinc-800 bg-zinc-950/80 shrink-0">
                    <h2 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex justify-between items-center">
                      Triage Queue
                      <span className="px-2 py-0.5 bg-zinc-800 rounded font-mono text-[9px]">{sortedAlerts.length}</span>
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {sortedAlerts.map((alert) => {
                      const isCritical = alert.severityLevel === 'Critical';
                      const isNgoDispatch = isNgoDispatchAlert(alert);
                      const isSelected = selectedSosId === alert.eventId || (!selectedSosId && selectedData?.eventId === alert.eventId);
                      const score = calculateTriageScore(alert);
                      
                      return (
                        <div 
                          key={alert.eventId}
                          onClick={() => {
                            pinpointSosOnMap(alert.eventId);
                            if (isNgoDispatch) {
                              // NGO dispatch alerts are already acted upon in Control Panel.
                              // In Broadcast Monitor, click should only pin/fly-to location.
                              setOpenResponseId(null);
                            }
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected 
                              ? (isCritical ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)] ring-1 ring-red-500/50' : 'bg-zinc-800 border-zinc-600 ring-1 ring-zinc-500/50') 
                              : (isCritical ? 'bg-red-950/10 border-red-500/20 hover:border-red-500/30' : 'bg-zinc-950/50 border-zinc-800/80 hover:border-zinc-700')
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                             <div className="flex items-center gap-2">
                               {isCritical && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                               <span className={`text-[10px] font-black uppercase ${isCritical ? 'text-red-400' : 'text-emerald-400'}`}>
                                 {alert.sosType}
                               </span>
                               {isNgoDispatch && (
                                 <span className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[8px] font-black uppercase tracking-wider">
                                   NGO Dispatch
                                 </span>
                               )}
                             </div>
                             <span className="text-zinc-600 font-mono text-[10px] font-bold" title="Triage priority multiplier">
                               U-{score}
                             </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 space-y-0.5">
                            <p className="flex items-center justify-between text-zinc-400 font-mono">
                              <span>{alert.volunteerId}</span>
                              <span className="text-zinc-600">{timeAgo(alert.timestamp)}</span>
                            </p>
                            <p className="flex items-center gap-3 pt-1 mt-1 border-t border-zinc-800/50">
                              <span className="flex items-center gap-1" title="Battery"><Battery size={10} className={alert.batteryLevel < 20 ? 'text-red-500' : ''} /> {alert.batteryLevel}%</span>
                              <span className="flex items-center gap-1" title="Network"><Wifi size={10} /> {alert.networkMode.replace('_', '')}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PANE 2: Central Geospatial Map */}
                <div className="flex-1 relative z-0 h-full bg-black">
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />
                  <MapView performanceMode="lite" />
                  {/* Map overlay hint */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
                    <span className="px-3 py-1 bg-zinc-900/80 backdrop-blur rounded-full text-[10px] font-mono text-zinc-400 border border-zinc-800/80 flex items-center gap-2 shadow-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      Global Dispatch Map
                    </span>
                  </div>
                  {selectedData && selectedIsNgoDispatch && (
                    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
                      <span className="px-3 py-1 bg-cyan-500/10 backdrop-blur rounded-full text-[10px] font-mono text-cyan-300 border border-cyan-500/30 flex items-center gap-2 shadow-xl">
                        <MapPin size={10} />
                        NGO Dispatch: location pin only
                      </span>
                    </div>
                  )}
                </div>

                {/* PANE 3: Dispatch Handshake Panel */}
                {selectedData && !selectedIsNgoDispatch && (
                  <div className="w-80 flex-shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col z-[100] shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
                    <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/40">
                      <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Navigation size={14} className="text-blue-500" />
                        Assets & Dispatch
                      </h2>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                      {/* Vitals Card */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-5"><Activity size={64} /></div>
                        <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-3">Vitals Card</h3>
                        <div className="space-y-3">
                           <div className="flex justify-between items-center text-xs">
                             <span className="text-zinc-400">Battery Priority</span>
                             <span className={`font-mono font-bold ${selectedData.batteryLevel < 20 ? 'text-red-500' : 'text-emerald-500'}`}>{selectedData.batteryLevel}%</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                             <span className="text-zinc-400">Connectivity</span>
                             <span className="font-mono text-blue-400">{selectedData.networkMode.includes('WebSocket') ? '4G/WIFI' : selectedData.networkMode.toUpperCase()}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                             <span className="text-zinc-400">SOS Type</span>
                             <span className="font-bold text-white uppercase">{selectedData.sosType}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                             <span className="text-zinc-400">Location</span>
                             <span className="font-mono text-blue-400 flex items-center gap-1">
                               <MapPin size={10} /> 
                               {selectedData.latitude.toFixed(3)}, {selectedData.longitude.toFixed(3)}
                             </span>
                           </div>
                        </div>
                      </div>

                      {/* Station Responses / Recommendation Engine Mockup */}
                      <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-3 border-b border-zinc-800 pb-2">Status Lifecycle</h3>
                      
                      <div className="space-y-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-red-900/40 border border-red-500 flex items-center justify-center shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          </div>
                          <div className="text-xs">
                            <p className="text-zinc-300 font-bold">Unassigned</p>
                            <p className="text-zinc-600 font-mono text-[9px]">Received {timeAgo(selectedData.timestamp)}</p>
                          </div>
                        </div>
                        {stationResponses[selectedData.eventId]?.map((r, i) => (
                          <div key={i} className="flex items-start gap-3 relative">
                            <div className="absolute top-[-20px] left-2.5 w-px h-5 bg-zinc-800" />
                            <div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 z-10 text-emerald-500">
                              <CheckCircle2 size={12} />
                            </div>
                            <div className="text-xs bg-zinc-900 flex-1 p-2 rounded border border-zinc-800">
                              <p className="text-zinc-300 font-bold flex justify-between">
                                {r.station_name}
                                <span className={getResponseColor(r.response_type)}>{getResponseIcon(r.response_type)}</span>
                              </p>
                              <p className="text-zinc-500 text-[10px] mt-1 line-clamp-2">{r.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Dispatch Actions */}
                      <button
                        onClick={() => setOpenResponseId(openResponseId === selectedData.eventId ? null : selectedData.eventId)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                      >
                        <Send size={16} />
                        One-Tap Dispatch
                      </button>
                      <p className="text-[9px] text-zinc-500 text-center font-mono uppercase tracking-widest">Global P2P Relay</p>

                      {/* Slide down actions if opened */}
                      <AnimatePresence>
                        {openResponseId === selectedData.eventId && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-3"
                          >
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
                              <select 
                                value={selectedResponse}
                                onChange={(e) => setSelectedResponse(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                              >
                                {RESPONSE_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSendResponse(selectedData.eventId, 999, selectedData.sosType)}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                >
                                  Confirm Target
                                </button>
                                <button
                                  onClick={() => setOpenResponseId(null)}
                                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold rounded-lg transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
