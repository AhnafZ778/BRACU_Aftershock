import { useEffect, useRef, useState } from 'react';
import { getWsBaseUrl } from '../config/api';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTelemetryStore } from '../store/useTelemetryStore';
import { useMeshStore } from '../store/useMeshStore';
import { useLocationStore } from '../store/useLocationStore';
import { LayoutDashboard, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { DashboardPage } from '../pages/DashboardPage';

// ─── Inline Nav — Dashboard & Broadcast only ─────────────────────────────
const NAV_ITEMS = [
  { name: 'Dashboard', url: '/dashboard',  icon: LayoutDashboard },
  { name: 'Broadcast', url: '/broadcast-monitor', icon: Radio      },
];

function InlineNav() {
  const location = useLocation();
  const [active, setActive] = useState('Dashboard');

  useEffect(() => {
    const match = NAV_ITEMS.find(i => i.url === location.pathname);
    if (match) setActive(match.name);
  }, [location.pathname]);

  return (
    <div className="flex items-center gap-0.5 md:gap-1 bg-slate-900/60 border border-slate-700/50 backdrop-blur-lg py-1 px-1 rounded-full shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = active === item.name;
        return (
          <Link
            key={item.name}
            to={item.url}
            onClick={() => setActive(item.name)}
            className={cn(
              'relative cursor-pointer text-xs lg:text-sm font-semibold px-2.5 py-1.5 lg:px-4 lg:py-2 rounded-full transition-colors whitespace-nowrap',
              'text-slate-400 hover:text-blue-400',
              isActive && 'bg-slate-800 text-blue-500',
            )}
          >
            <span className="hidden md:inline">{item.name}</span>
            <span className="md:hidden"><Icon size={16} strokeWidth={2.5} /></span>
            {isActive && (
              <motion.div
                layoutId="lamp-inline"
                className="absolute inset-0 w-full bg-blue-500/5 rounded-full -z-10"
                initial={false}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500 rounded-t-full">
                  <div className="absolute w-12 h-6 bg-blue-500/20 rounded-full blur-md -top-2 -left-2" />
                  <div className="absolute w-8 h-6 bg-blue-500/20 rounded-full blur-md -top-1" />
                  <div className="absolute w-4 h-4 bg-blue-500/20 rounded-full blur-sm top-0 left-2" />
                </div>
              </motion.div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export function AppLayout() {
  const { setTelemetry, setSosQueue, addBroadcastedAlert, addStationResponse } = useTelemetryStore();
  const location = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manuallyClosedRef = useRef(false);

  // Start GPS tracking + mesh network on mount
  useEffect(() => {
    useLocationStore.getState().init();
    useMeshStore.getState().init();
    return () => {
      useLocationStore.getState().stop();
      useMeshStore.getState().shutdown();
    };
  }, []);

  // Send location updates to the backend WebSocket every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const loc = useLocationStore.getState();
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && loc.lat !== null) {
        ws.send(JSON.stringify({ type: 'location_update', lat: loc.lat, lng: loc.lng }));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const wsUrl = `${getWsBaseUrl()}/ws/telemetry`;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (manuallyClosedRef.current) return;
      if (reconnectTimerRef.current !== null) return;

      const delay = Math.min(8000, 1000 * Math.max(1, reconnectAttemptsRef.current));
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectTelemetry();
      }, delay);
    };

    const connectTelemetry = () => {
      if (manuallyClosedRef.current) return;

      console.log("Connecting to Global Telemetry WS:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        const loc = useLocationStore.getState();
        if (loc.lat !== null) {
          ws.send(JSON.stringify({ type: 'location_update', lat: loc.lat, lng: loc.lng }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry_update') {
            setTelemetry({
              agents: data.agents,
              mesh_links: data.mesh_links,
              rescue_zones: data.rescue_zones,
              distress_signals: data.distress_signals
            });
          } else if (data.type === 'sos_queue_update') {
            setSosQueue(data.queue || [], data.broadcasted || []);
          } else if (data.type === 'sos_approved_broadcast') {
            addBroadcastedAlert(data.alert, data.proximity);
          } else if (data.type === 'sos_station_response') {
            addStationResponse(data.event_id, data.response);
          } else if (data.type === 'cap_alert') {
            useMeshStore.getState().injectAlert(data.alert, data.hmac);
          }
        } catch (err) {
          console.error("Global Telemetry parsing error", err);
        }
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* no-op */ }
      };

      ws.onclose = () => {
        if (manuallyClosedRef.current) return;
        reconnectAttemptsRef.current += 1;
        scheduleReconnect();
      };
    };

    manuallyClosedRef.current = false;
    clearReconnectTimer();
    connectTelemetry();

    return () => {
      manuallyClosedRef.current = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try { ws.close(); } catch { /* no-op */ }
      }
    };
  }, [setTelemetry, setSosQueue, addBroadcastedAlert, addStationResponse]);

  return (
    <div className="flex flex-col h-screen w-screen bg-ops-bg text-ops-text font-sans overflow-hidden relative">

      {/* Header — simplified: just logo + nav */}
      <header
        className="absolute top-0 left-0 w-full z-[150] pointer-events-none"
        style={{ padding: '16px 20px' }}
      >
        <div className="flex items-center justify-center w-full">
          {/* Center: Nav tabs */}
          <div className="pointer-events-auto">
            <InlineNav />
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 w-full h-full relative z-0">
        <div style={{ display: location.pathname === '/dashboard' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <DashboardPage isVisible={location.pathname === '/dashboard'} />
        </div>
        {location.pathname !== '/dashboard' && <Outlet />}
      </main>
    </div>
  );
}
