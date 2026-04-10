import { useState, useEffect, useRef } from 'react';
import { getWsBaseUrl } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { BatteryLow, Wifi, WifiOff, MapPin, CheckCircle, Clock, XCircle, Loader2, Bell, Shield, MessageSquare, Radio, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SOSGrid } from '../components/Volunteer/SOSGrid';
import type { SOSCategory } from '../components/Volunteer/SOSGrid';
import { SlideToConfirm } from '../components/Volunteer/SlideToConfirm';
import { useTelemetryStore } from '../store/useTelemetryStore';

function generateVolunteerId(): string {
  return 'VOL-' + Math.floor(100 + Math.random() * 900);
}

export function VolunteerViewPage() {
  const navigate = useNavigate();
  const [volunteerId] = useState(generateVolunteerId);
  const [selectedCategory, setSelectedCategory] = useState<SOSCategory | null>(null);
  const [battery] = useState(() => Math.floor(10 + Math.random() * 60));
  const [coords, setCoords] = useState({ lat: 23.8103, lng: 90.4125 });
  const [wsConnected, setWsConnected] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Store actions/state
  const { sosStatus, setSosStatus, stationResponses, addStationResponse } = useTelemetryStore();
  const activeEventIdRef = useRef<string | null>(null);

  // Sync ref with store
  useEffect(() => {
    activeEventIdRef.current = sosStatus.event_id;
  }, [sosStatus.event_id]);

  // GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  // WebSocket
  useEffect(() => {
    const wsUrl = `${getWsBaseUrl()}/ws/telemetry`;
    
    console.log("Volunteer connecting to:", wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("Volunteer WS connected");
      setWsConnected(true);
    };
    socket.onclose = () => {
      console.log("Volunteer WS disconnected");
      setWsConnected(false);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { sosStatus: currentStatus } = useTelemetryStore.getState();
        const myEventId = currentStatus.event_id;

        console.log(`[Volunteer WS] Incoming: ${data.type}`, data);

        // 1. Initial Data / Queue Updates (Independent of active SOS)
        if (data.type === 'sos_queue_update') {
          // Handle initial history if provided
          if (data.station_responses) {
            console.log("[Volunteer WS] Hydrating response history:", data.station_responses);
            Object.entries(data.station_responses).forEach(([eid, resList]: [string, any]) => {
              resList.forEach((res: any) => addStationResponse(eid, res));
            });
          }

          // Check for broadcast status if an event is active
          if (myEventId) {
            const inBroadcast = (data.broadcasted || []).find((s: any) => s.event_id === myEventId);
            if (inBroadcast && currentStatus.status === 'queued') {
              console.log("Redundancy match: SOS found in broadcast list. Updating to approved.");
              setSosStatus(myEventId, 'approved', data.stations_notified || 0);
            }
          }
        }

        // 2. Status/Ack updates (Require active event ID)
        if (myEventId) {
          if (data.type === 'sos_received_ack' && data.event_id === myEventId) {
            setSosStatus(data.event_id, 'queued');
          } 
          else if (data.type === 'sos_status_update' && data.event_id === myEventId) {
            setSosStatus(data.event_id, data.status, data.stations_notified || 0);
          }
        }

        // 2. Global Station Responses (Independent of active SOS)
        if (data.type === 'sos_station_response') {
          console.log(`[Volunteer WS] Response for ${data.event_id}:`, data.response);
          addStationResponse(data.event_id, data.response);
        }
      } catch (err) {
        console.error("Volunteer WS error:", err);
      }
    };
    wsRef.current = socket;
    return () => socket.close();
  }, [setSosStatus, addStationResponse]);

  const handleConfirm = () => {
    if (!selectedCategory) return;
    const eventId = `sos_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    // Set status to queued locally immediately
    setSosStatus(eventId, 'queued');

    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      volunteer: { id: volunteerId, name: 'Field Team Lead', assigned_station: 'STATION-04-DHAKA-SOUTH' },
      current_assignment: { task_id: `TSK-${Math.floor(100 + Math.random() * 900)}`, description: 'Active field deployment', status: 'interrupted' },
      sos_details: { type: selectedCategory.label_en, code: selectedCategory.code, severity_level: selectedCategory.severity },
      telemetry: {
        coordinates: { latitude: coords.lat, longitude: coords.lng },
        location_accuracy_meters: parseFloat((2 + Math.random() * 10).toFixed(1)),
        battery_level: battery,
        network_mode: wsConnected ? 'WebSocket' : 'Mesh_P2P',
      },
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'volunteer_sos_submit', payload }));
    }
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setSosStatus(null, 'idle');
  };

  const colorKey = selectedCategory
    ? selectedCategory.id === 'medical_evac' ? 'red'
    : selectedCategory.id === 'stranded' ? 'orange'
    : selectedCategory.id === 'route_blocked' ? 'yellow'
    : selectedCategory.id === 'supply_critical' ? 'blue'
    : 'black'
    : 'red';

  const getResponseAccentClass = (responseType: string) => {
    if (responseType === 'dispatching') return 'bg-emerald-500';
    if (responseType === 'acknowledged') return 'bg-blue-500';
    if (responseType === 'unable') return 'bg-red-500';
    if (responseType === 'central_alert') return 'bg-cyan-400';
    return 'bg-amber-500';
  };

  const getResponseAccentGlowClass = (responseType: string) => {
    if (responseType === 'dispatching') return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    if (responseType === 'acknowledged') return 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]';
    if (responseType === 'unable') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
    if (responseType === 'central_alert') return 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.45)]';
    return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
  };

  const getResponseBadgeClass = (responseType: string) => {
    if (responseType === 'dispatching') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (responseType === 'acknowledged') return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    if (responseType === 'unable') return 'bg-red-500/10 text-red-400 border border-red-500/20';
    if (responseType === 'central_alert') return 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30';
    return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  };

  const getResponseTypeLabel = (responseType: string) => {
    if (responseType === 'central_alert') return 'Central Alert Response';
    return responseType;
  };

  // Current SOS responses - prioritize store but fallback to ref-safe check
  const currentResponses = sosStatus.event_id 
    ? (stationResponses[sosStatus.event_id] || []) 
    : [];

  // ─── STATUS SCREEN (Queued / Approved / Rejected) ──────────────
  if (sosStatus.status !== 'idle') {
    const isApproved = sosStatus.status === 'approved';
    const isRejected = sosStatus.status === 'rejected';
    const isWaiting = sosStatus.status === 'queued';

    return (
      <div
        className="min-h-screen bg-zinc-950 flex flex-col items-center px-3 sm:px-6 pt-3 sm:pt-6 text-center overflow-y-auto"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        {/* Persistent Header for Status Screen */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4 bg-zinc-900/40 p-2.5 sm:p-3 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <span className="text-zinc-100 text-[10px] font-black uppercase tracking-widest">
              {wsConnected ? 'Link Active' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button 
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-blue-400 text-[10px] font-bold tracking-widest uppercase"
              title="Return Home"
            >
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </button>
            <button 
            onClick={() => window.location.reload()}
            className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-emerald-500 transition-all text-zinc-400 hover:text-emerald-400"
            title="Force Sync"
          >
            <Radio size={16} />
          </button>
          <button 
            onClick={() => setShowNotifications(true)}
            className="relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-900 border-2 border-zinc-800 hover:border-blue-500 shadow-lg shadow-blue-500/10 transition-all active:scale-90 group"
          >
            <Bell size={18} className="text-zinc-100 group-hover:text-blue-400 transition-colors" />
            {Object.values(stationResponses).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 bg-blue-600 rounded-full text-[11px] font-black flex items-center justify-center text-white ring-2 ring-zinc-950 shadow-[0_0_10px_rgba(37,99,235,0.5)]">
                {Object.values(stationResponses).flat().length}
              </span>
            )}
          </button>
        </div>
      </div>

        <div className="flex-shrink-0 flex flex-col items-center justify-center w-full max-w-md">
          {/* Status Icon */}
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-2xl ${
            isApproved ? 'bg-emerald-600 shadow-emerald-500/20' : isRejected ? 'bg-red-600 shadow-red-500/20' : 'bg-amber-600 shadow-amber-500/20'
          }`}>
            {isApproved ? <CheckCircle size={48} className="text-white" /> :
             isRejected ? <XCircle size={48} className="text-white" /> :
             <Loader2 size={48} className="text-white animate-spin" />}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {isApproved ? 'SOS Approved' : isRejected ? 'SOS Rejected' : 'Awaiting Review'}
          </h1>

          <p className={`text-base sm:text-lg font-bold mb-1 ${
            isApproved ? 'text-emerald-400' : isRejected ? 'text-red-400' : 'text-amber-400'
          }`}>
            {selectedCategory?.code} — {selectedCategory?.label_en}
          </p>

          {isWaiting && (
            <div className="mt-4 flex items-center gap-2 text-zinc-400 text-sm justify-center">
              <Clock size={16} />
              <span>In Control Station queue. Admin review in progress.</span>
            </div>
          )}

          {/* ─── NOTIFICATION PANEL (Premium UI) ─── */}
          <div className="mt-8 w-full max-w-md pb-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Bell size={12} className="text-blue-500" /> Notifications
              </h3>
              <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                {Object.values(stationResponses).flat().length} Total
              </span>
            </div>

            <div className="space-y-4">
              {/* Current Active SOS Header / Status */}
              <div className={`bg-zinc-900/40 border ${isApproved ? 'border-emerald-500/30' : isRejected ? 'border-red-500/30' : 'border-amber-500/30'} rounded-2xl p-4 text-left backdrop-blur-md relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 p-2 opacity-20">
                  <Shield size={24} className={isApproved ? 'text-emerald-500' : isRejected ? 'text-red-500' : 'text-amber-500'} />
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isApproved ? 'bg-emerald-500' : isRejected ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isApproved ? 'text-emerald-400' : isRejected ? 'text-red-400' : 'text-amber-400'}`}>
                    {isWaiting ? 'Pending Review' : isApproved ? 'Active Broadcast' : 'System Notice'}
                  </span>
                </div>
                
                <p className="text-[10px] text-zinc-500 font-mono mb-2">EVENT ID: {sosStatus.event_id}</p>
                <p className="text-white text-xs font-bold leading-relaxed">
                  {isWaiting 
                    ? "Your emergency signal has been received and is currently in the admin queue for priority review."
                    : isApproved 
                    ? `Signal approved and broadcasted to ${sosStatus.stations_notified || 'nearby'} control stations.`
                    : "Admin has reviewed and closed/rejected this signal. Please see history below."}
                </p>
                
                {(isWaiting || (isApproved && currentResponses.length === 0)) && (
                  <div className="mt-4 flex items-center gap-3 py-2.5 px-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                    <Loader2 size={12} className="text-blue-400 animate-spin" />
                    <span className="text-[10px] text-zinc-400 italic">
                      {isWaiting ? "Waiting for admin validation..." : "Listening for control station feedback..."}
                    </span>
                  </div>
                )}
              </div>

              {/* Response Feed (Sorted by Time) */}
              <div className="space-y-3">
                <AnimatePresence>
                  {[...currentResponses]
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((res, ridx) => (
                      <motion.div
                        key={`${sosStatus.event_id}-${res.timestamp}-${ridx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left shadow-xl backdrop-blur-sm relative"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter mb-0.5">
                              {res.station_name}
                            </span>
                            <span className="text-[8px] text-zinc-600 font-mono">STATION ID: {res.station_id}</span>
                          </div>
                          <div className="text-[9px] text-zinc-500 font-mono">
                            {new Date(res.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className={`mt-1 h-2 w-1 rounded-full shrink-0 ${getResponseAccentGlowClass(res.response_type)}`} />
                          <div className="flex-1">
                            <p className="text-white text-sm font-semibold leading-relaxed mb-2">
                              {res.message}
                            </p>
                            
                            {/* ✨ NEW RICH CONTENT BLOCK START ✨ */}
                            {res.chief_name && (
                              <div className="mb-3 bg-zinc-950/50 rounded-lg border border-zinc-800/80 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] font-mono leading-relaxed">
                                <div>
                                  <span className="text-zinc-600 uppercase font-bold block">Responder</span>
                                  <span className="text-zinc-300 font-bold">{res.chief_name} ({res.chief_id})</span>
                                </div>
                                <div>
                                  <span className="text-zinc-600 uppercase font-bold block">Assigned Team</span>
                                  <span className="text-blue-400 font-bold">{res.admin_team_name}</span>
                                </div>
                                <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-t border-zinc-800/50 pt-2 mt-1">
                                  <span><span className="text-zinc-600">Station Capacity:</span> <span className="text-emerald-400">{res.station_capacity}%</span></span>
                                  <span><span className="text-zinc-600">SOS Ref:</span> <span className="text-zinc-400">{res.event_id_ref || sosStatus.event_id}</span></span>
                                </div>
                              </div>
                            )}
                            {/* ✨ NEW RICH CONTENT BLOCK END ✨ */}

                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${getResponseBadgeClass(res.response_type)}`}>
                                {getResponseTypeLabel(res.response_type)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {isRejected && (
            <div className="mt-4 bg-red-950/30 border border-red-700/50 rounded-xl p-4 w-full">
              <p className="text-red-300 text-sm font-bold mb-1">❌ Signal Rejected</p>
              <p className="text-zinc-400 text-xs">
                Marked as invalid by admin. Please re-evaluate or resend if appropriate.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleReset}
          className="my-4 sm:my-8 w-full max-w-md py-3 sm:py-4 rounded-xl bg-zinc-800 text-white font-bold text-base sm:text-lg hover:bg-zinc-700 transition-all active:scale-95 flex-shrink-0"
          style={{ marginBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          New SOS / নতুন সংকেত
        </button>

        {/* ─── NOTIFICATION OVERLAY ─── */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div 
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
            >
              <div className="px-3 sm:px-4 py-3 border-b border-zinc-900 flex items-center justify-between gap-3 sticky top-0 bg-zinc-950/80 backdrop-blur-xl" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Bell size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white leading-none">Notifications</h2>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">SOS Feedback History</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="px-3 py-2 sm:p-3 bg-zinc-900 rounded-xl sm:rounded-2xl text-zinc-400 hover:text-white transition-colors"
                >
                  <span className="text-[11px] sm:text-xs font-bold px-1 sm:px-2">CLOSE</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {Object.keys(stationResponses).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-12">
                    <MessageSquare size={48} className="mb-4" />
                    <p className="text-sm font-bold">No feedback received yet.</p>
                    <p className="text-xs mt-1">When an admin responds to your SOS, it will appear here even if you refresh the page.</p>
                    <p className="text-[10px] mt-4 font-mono">DEBUG: Store persistent key exists? {JSON.stringify(Object.keys(stationResponses))}</p>
                  </div>
                ) : (
                  Object.entries(stationResponses)
                    .sort((a, b) => {
                      const tA = a[1][0]?.timestamp || '';
                      const tB = b[1][0]?.timestamp || '';
                      return tB.localeCompare(tA);
                    }) // Sort SOS groups by newest response
                    .map(([eventId, responses]) => (
                      <div key={eventId} className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <div className="h-px flex-1 bg-zinc-900" />
                          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-950 px-2">SOS REF: {eventId}</span>
                          <div className="h-px flex-1 bg-zinc-900" />
                        </div>
                        
                        {[...responses].sort((a,b) => b.timestamp.localeCompare(a.timestamp)).map((res, ridx) => (
                          <div key={ridx} className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 relative overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-1 ${getResponseAccentClass(res.response_type)}`} />
                            
                            <div className="flex justify-between items-start mb-3">
                              <span className="text-[10px] font-black text-zinc-100 uppercase tracking-widest">{res.station_name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {new Date(res.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>

                            <p className="text-zinc-200 text-sm font-semibold leading-relaxed mb-4">
                              {res.message}
                            </p>
                            
                            {res.chief_name && (
                              <div className="mb-3 bg-zinc-950/80 rounded-lg border border-zinc-800/80 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] font-mono leading-relaxed">
                                <div>
                                  <span className="text-zinc-600 uppercase font-bold block">Responder</span>
                                  <span className="text-zinc-300 font-bold">{res.chief_name} ({res.chief_id})</span>
                                </div>
                                <div>
                                  <span className="text-zinc-600 uppercase font-bold block">Assigned Team</span>
                                  <span className="text-blue-400 font-bold">{res.admin_team_name}</span>
                                </div>
                                <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-t border-zinc-800/50 pt-2 mt-1">
                                  <span><span className="text-zinc-600">Station Capacity:</span> <span className="text-emerald-400">{res.station_capacity}%</span></span>
                                  <span><span className="text-zinc-600">SOS Ref:</span> <span className="text-zinc-400">{res.event_id_ref || eventId}</span></span>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${getResponseAccentClass(res.response_type)}`} />
                                <span className="text-[10px] font-black text-zinc-400 tracking-[0.2em] uppercase">{getResponseTypeLabel(res.response_type)}</span>
                              </div>
                              <span className="text-[9px] text-zinc-600 font-mono">STATION-ID: {res.station_id}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── SLIDE-TO-CONFIRM SCREEN ──────────────────────────────
  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="p-3 sm:p-4 border-b border-zinc-800">
          <h2 className="text-lg sm:text-xl font-black text-white text-center">
            Confirm {selectedCategory.label_en}
          </h2>
          <p className="text-center text-zinc-500 text-xs sm:text-sm mt-1">
            {selectedCategory.label_bn} — {selectedCategory.code}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-3">
          <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl ${selectedCategory.bg} flex items-center justify-center ${selectedCategory.color} shadow-2xl`}>
            {selectedCategory.icon}
          </div>
          <p className="text-zinc-400 text-sm max-w-xs text-center px-2 sm:px-4">
            Slide below to submit this SOS to the Control Station for review. Your GPS, battery, and mission context will be attached.
          </p>
        </div>
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
    <div className="min-h-screen bg-zinc-950 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 bg-zinc-900/40 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-black text-base sm:text-lg">Volunteer View</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-blue-400 text-[10px] font-bold tracking-widest uppercase"
            title="Return Home"
          >
            <Home size={14} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-emerald-500 transition-all text-zinc-400 hover:text-emerald-400"
            title="Force Sync"
          >
            <Radio size={16} />
          </button>
          <button 
            onClick={() => setShowNotifications(true)}
            className="relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-900 border-2 border-zinc-800 hover:border-blue-500 shadow-lg shadow-blue-500/10 transition-all active:scale-90 group"
          >
            <Bell size={18} className="sm:w-5 sm:h-5 text-zinc-100 group-hover:text-blue-400 transition-colors" />
            {Object.values(stationResponses).flat().length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 bg-blue-600 rounded-full text-[11px] font-black flex items-center justify-center text-white ring-2 ring-zinc-950 shadow-[0_0_10px_rgba(37,99,235,0.5)]">
                {Object.values(stationResponses).flat().length}
              </span>
            )}
          </button>
        </div>
        <div className="w-full flex items-center justify-between text-[10px] sm:text-xs mt-1.5">
          <span className="flex items-center gap-1 text-zinc-400 truncate max-w-[45%]">
            <MapPin size={11} />
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <BatteryLow size={11} /> {battery}%
          </span>
          <span className={`flex items-center gap-1 ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
            {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsConnected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div className="px-3 sm:px-4 pt-4 pb-2">
        <p className="text-zinc-500 text-sm text-center font-bold uppercase tracking-widest">
          Select Emergency Type
        </p>
        <p className="text-zinc-600 text-[10px] text-center mt-1">
          নিচে জরুরি ধরন নির্বাচন করুন
        </p>
      </div>
      <SOSGrid onSelect={setSelectedCategory} disabled={false} />

      {/* ─── NOTIFICATION OVERLAY (MAIN) ─── */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-50 bg-zinc-950 flex flex-col"
          >
            <div className="px-3 sm:px-4 py-3 border-b border-zinc-900 flex items-center justify-between gap-3 sticky top-0 bg-zinc-950/80 backdrop-blur-xl" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Bell size={20} className="text-blue-500" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-none">Notifications</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">SOS Feedback History</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNotifications(false)}
                className="px-3 py-2 sm:p-3 bg-zinc-900 rounded-xl sm:rounded-2xl text-zinc-400 hover:text-white transition-colors"
              >
                <span className="text-[11px] sm:text-xs font-bold px-1 sm:px-2">CLOSE</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {Object.keys(stationResponses).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-12">
                  <MessageSquare size={48} className="mb-4" />
                  <p className="text-sm font-bold">No feedback received yet.</p>
                  <p className="text-xs mt-1">When an admin responds to your SOS, it will appear here even if you refresh the page.</p>
                </div>
              ) : (
                Object.entries(stationResponses)
                  .sort((a, b) => {
                    const timeA = a[1][0]?.timestamp ? new Date(a[1][0].timestamp).getTime() : 0;
                    const timeB = b[1][0]?.timestamp ? new Date(b[1][0].timestamp).getTime() : 0;
                    return timeB - timeA;
                  })
                  .map(([eventId, responses]) => (
                    <div key={eventId} className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-px flex-1 bg-zinc-900" />
                        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-950 px-2">SOS REF: {eventId}</span>
                        <div className="h-px flex-1 bg-zinc-900" />
                      </div>
                      
                      {[...responses].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((res, ridx) => (
                        <div key={ridx} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 relative overflow-hidden group shadow-xl">
                          <div className={`absolute top-0 left-0 bottom-0 w-1 ${getResponseAccentClass(res.response_type)}`} />
                          
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-[10px] font-black text-zinc-100 uppercase tracking-widest">{res.station_name}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {new Date(res.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-zinc-200 text-sm font-semibold leading-relaxed mb-4">
                            {res.message}
                          </p>

                          {res.chief_name && (
                            <div className="mb-3 bg-zinc-950/80 rounded-lg border border-zinc-800/80 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] font-mono leading-relaxed">
                              <div>
                                <span className="text-zinc-600 uppercase font-bold block">Responder</span>
                                <span className="text-zinc-300 font-bold">{res.chief_name} ({res.chief_id})</span>
                              </div>
                              <div>
                                <span className="text-zinc-600 uppercase font-bold block">Assigned Team</span>
                                <span className="text-blue-400 font-bold">{res.admin_team_name}</span>
                              </div>
                                <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 border-t border-zinc-800/50 pt-2 mt-1">
                                <span><span className="text-zinc-600">Station Capacity:</span> <span className="text-emerald-400">{res.station_capacity}%</span></span>
                                <span><span className="text-zinc-600">SOS Ref:</span> <span className="text-zinc-400">{res.event_id_ref || eventId}</span></span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${getResponseAccentClass(res.response_type)}`} />
                              <span className="text-[10px] font-black text-zinc-400 tracking-[0.2em] uppercase">{getResponseTypeLabel(res.response_type)}</span>
                            </div>
                            <span className="text-[9px] text-zinc-600 font-mono">STATION-ID: {res.station_id}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
