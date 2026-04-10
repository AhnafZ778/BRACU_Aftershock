import { useRef } from 'react';
import { getWsBaseUrl } from '../../config/api';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Battery, Clock, Check, X } from 'lucide-react';

export function VolunteerManagementPanel() {
  const { sosQueue, removeSosFromQueue } = useTelemetryStore();
  const wsRef = useRef<WebSocket | null>(null);

  // Get or create a WS connection for admin actions
  const getWs = (): WebSocket | null => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }
    const ws = new WebSocket(`${getWsBaseUrl()}/ws/telemetry`);
    wsRef.current = ws;
    return ws;
  };

  const handleApprove = (eventId: string) => {
    const ws = getWs();
    if (!ws) return;
    removeSosFromQueue(eventId); // Optimistic UI update
    const send = () => ws.send(JSON.stringify({ type: 'admin_approve_sos', event_id: eventId }));
    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.onopen = () => send();
    }
  };

  const handleReject = (eventId: string) => {
    const ws = getWs();
    if (!ws) return;
    removeSosFromQueue(eventId); // Optimistic UI update
    const send = () => ws.send(JSON.stringify({ type: 'admin_reject_sos', event_id: eventId }));
    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.onopen = () => send();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-300 overflow-hidden">

      <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ scrollbarWidth: 'thin' }}>
        {/* SECTION 1: SOS Request Queue */}
        <section>
          <h3 className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-2 flex items-center gap-2">
            <AlertCircle size={11} className="text-amber-500" />
            Incoming Queue ({sosQueue.length})
          </h3>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {sosQueue.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-zinc-800 rounded-lg">
                  <p className="text-zinc-600 text-xs italic">No pending signals</p>
                </div>
              ) : (
                sosQueue.map((sos) => (
                  <motion.div
                    key={sos.event_id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`p-3 rounded-lg border shadow-sm ${
                      sos.sos_details.severity_level === 'Critical'
                        ? 'bg-red-950/20 border-red-500/30'
                        : 'bg-amber-950/20 border-amber-500/30'
                    }`}
                  >
                    {/* Top row: code badge + time */}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          sos.sos_details.severity_level === 'Critical' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                        }`}>
                          {sos.sos_details.code}
                        </span>
                        <h4 className="text-white font-bold text-xs mt-1">{sos.sos_details.type}</h4>
                      </div>
                      <div className="text-[9px] text-zinc-500 flex items-center gap-1 font-mono">
                        <Clock size={9} />
                        {new Date(sos.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="bg-zinc-950/60 p-1.5 rounded text-center">
                        <p className="text-[8px] text-zinc-500 uppercase font-bold">ID</p>
                        <p className="text-[10px] text-white font-semibold truncate">{sos.volunteer.id}</p>
                      </div>
                      <div className="bg-zinc-950/60 p-1.5 rounded text-center">
                        <p className="text-[8px] text-zinc-500 uppercase font-bold">Battery</p>
                        <div className="flex items-center justify-center gap-0.5">
                          <Battery size={9} className={sos.telemetry.battery_level < 20 ? 'text-red-500' : 'text-emerald-500'} />
                          <span className="text-[10px] text-white font-semibold">{sos.telemetry.battery_level}%</span>
                        </div>
                      </div>
                      <div className="bg-zinc-950/60 p-1.5 rounded text-center">
                        <p className="text-[8px] text-zinc-500 uppercase font-bold">GPS</p>
                        <p className="text-[10px] text-white font-semibold">
                          {sos.telemetry.coordinates.latitude.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Approve / Reject buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(sos.event_id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-all active:scale-95"
                      >
                        <Check size={12} /> APPROVE
                      </button>
                      <button
                        onClick={() => handleReject(sos.event_id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-zinc-700 hover:bg-red-600 text-white text-[10px] font-bold transition-all active:scale-95"
                      >
                        <X size={12} /> REJECT
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>


      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-zinc-900/80 border-t border-zinc-800 text-[9px] text-zinc-500 flex justify-between items-center flex-shrink-0">
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          PROXIMITY RADIUS: 80km
        </span>
        <span className="font-mono uppercase opacity-50">RESILIENCE AI v3.1</span>
      </div>
    </div>
  );
}
