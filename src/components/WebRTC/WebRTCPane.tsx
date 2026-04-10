import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../../config/api';
import { Radio, Wifi, WifiOff, Users, ArrowUpDown, Shield, AlertTriangle, Send, Zap, MapPin } from 'lucide-react';
import { useMeshStore } from '../../store/useMeshStore';
import { useLocationStore } from '../../store/useLocationStore';
import type { CAPAlertJSON } from '../../lib/meshProtocol';

/**
 * Headless WebRTC P2P Mesh Provider.
 * This component manages the signaling and P2P connections and syncs state to useMeshStore.
 * It should be mounted once at the top level of the app.
 */
export function WebRTCProvider() {
  const store = useMeshStore();
  
  useEffect(() => {
    store.init();
    return () => store.shutdown();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const SEVERITY_COLORS: Record<string, string> = {
  Extreme: 'text-red-400 bg-red-500/20 border-red-500/40',
  Severe: 'text-orange-400 bg-orange-500/20 border-orange-500/40',
  Moderate: 'text-amber-400 bg-amber-500/20 border-amber-500/40',
  Minor: 'text-green-400 bg-green-500/20 border-green-500/40',
  Unknown: 'text-zinc-400 bg-zinc-500/20 border-zinc-500/40',
};

const STATUS_CONFIG = {
  online: { icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Online' },
  'mesh-only': { icon: Radio, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Mesh Only' },
  offline: { icon: WifiOff, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Offline' },
};

function AlertCard({ alert }: { alert: CAPAlertJSON }) {
  const info = alert.info?.[0];
  if (!info) return null;
  const sev = info.severity || 'Unknown';
  const colors = SEVERITY_COLORS[sev] || SEVERITY_COLORS.Unknown;
  const time = new Date(alert.sent || Date.now()).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`border rounded-lg p-3 ${colors} transition-all duration-300`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} />
            <span className="text-xs font-bold uppercase tracking-wide">{sev}</span>
            <span className="text-[10px] opacity-60">{time}</span>
          </div>
          <p className="font-bold text-sm leading-tight">{info.headline || info.event}</p>
          {info.instruction && (
            <p className="text-xs mt-1 opacity-80">{info.instruction}</p>
          )}
          {info.areas?.[0] && (
            <p className="text-[10px] mt-1 opacity-50">{info.areas[0].areaDesc}</p>
          )}
        </div>
        <div className="text-[10px] font-mono opacity-40 whitespace-nowrap">
          {alert.identifier.slice(-8)}
        </div>
      </div>
    </div>
  );
}

export function WebRTCPane() {
  const store = useMeshStore();
  const loc = useLocationStore();
  const [demoMode, setDemoMode] = useState(false);
  const StatusCfg = STATUS_CONFIG[store.networkStatus];
  const StatusIcon = StatusCfg.icon;

  const activePeers = Object.values(store.peers).filter(
    (p) => p.channel?.readyState === 'open'
  ).length;

  const sendDemoAlert = async (type: 'cyclone' | 'flood' | 'all_clear') => {
    const myLat = loc.lat ?? 23.8;
    const myLng = loc.lng ?? 90.4;

    const presets: Record<string, any> = {
      cyclone: {
        event: 'ঘূর্ণিঝড়',
        severity: 'Extreme' as const,
        urgency: 'Immediate',
        headline: 'তীব্র ঘূর্ণিঝড় সতর্কতা',
        headline_en: 'Severe Cyclone Warning',
        description: 'কক্সবাজার উপকূলে ক্যাটাগরি ৪ ঘূর্ণিঝড় আসছে। সমস্ত নিচু উপকূলীয় এলাকা থেকে অবিলম্বে সরে যান।',
        instruction: 'এখনই নিকটতম আশ্রয়কেন্দ্রে যান',
        area: 'কক্সবাজার জেলা — টেকনাফ, উখিয়া, মহেশখালী',
        district: 'coxs_bazar',
        nrp_msg_type: 'CYCLONE_WARN',
        center_lat: myLat,
        center_lng: myLng,
        radius_km: 200,
      },
      flood: {
        event: 'বন্যা',
        severity: 'Severe' as const,
        urgency: 'Expected',
        headline: 'আকস্মিক বন্যা সতর্কতা',
        headline_en: 'Flash Flood Warning',
        description: 'উজানে ভারী বৃষ্টিপাত শনাক্ত হয়েছে। সিলেট ও সুনামগঞ্জের নিচু এলাকায় বন্যার সম্ভাবনা।',
        instruction: 'সতর্ক থাকুন এবং বন্যাপ্রবণ এলাকা এড়িয়ে চলুন',
        area: 'সিলেট বিভাগ — সিলেট, সুনামগঞ্জ',
        district: 'sylhet',
        nrp_msg_type: 'FLOOD_WARN',
        center_lat: myLat,
        center_lng: myLng,
        radius_km: 150,
      },
      all_clear: {
        event: 'নিরাপদ',
        severity: 'Minor' as const,
        urgency: 'Past',
        headline: 'বিপদ কেটে গেছে — সব ঠিক আছে',
        headline_en: 'All Clear',
        description: 'ঘূর্ণিঝড়ের বিপদ কেটে গেছে। স্বাভাবিক কাজকর্ম চালিয়ে যেতে পারেন।',
        instruction: 'স্বাভাবিক কাজ চালিয়ে যান',
        area: 'সমস্ত অঞ্চল',
        district: '',
        nrp_msg_type: 'ALL_CLEAR',
        center_lat: 0,
        center_lng: 0,
        radius_km: 0,
      },
    };

    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/cap/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presets[type]),
      });
      if (!resp.ok) throw new Error('Failed');
    } catch {
      const p = presets[type];
      const mockAlert: CAPAlertJSON = {
        identifier: `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'nirapotta.bd',
        sent: new Date().toISOString(),
        status: 'Actual',
        msgType: 'Alert',
        scope: 'Public',
        info: [{
          language: 'bn',
          category: 'Met',
          event: p.event,
          urgency: p.urgency,
          severity: p.severity,
          certainty: 'Observed',
          headline: p.headline,
          headlineEn: p.headline_en,
          description: p.description,
          instruction: p.instruction,
          nrpMsgType: p.nrp_msg_type,
          dialect: 'standard_bengali',
          communityLevel: p.severity === 'Extreme' ? 'critical' : p.severity === 'Severe' ? 'high' : 'safe',
          areas: [{
            areaDesc: p.area,
            circleLat: p.center_lat,
            circleLng: p.center_lng,
            circleRadiusKm: p.radius_km,
          }],
        }],
      };
      store.injectAlert(mockAlert);
    }
  };

  return (
    <div className="w-80 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/60 rounded-xl shadow-2xl text-zinc-300 flex flex-col max-h-[600px]">
      <div className="p-4 border-b border-zinc-700/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Radio size={18} className="text-cyan-400" />
            Mesh Network
          </h3>
          <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-full ${StatusCfg.bg}`}>
            <StatusIcon size={12} className={StatusCfg.color} />
            <span className={StatusCfg.color}>{StatusCfg.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-800/60 rounded-lg p-2">
            <Users size={14} className="mx-auto mb-1 text-cyan-400" />
            <div className="text-lg font-bold text-white">{activePeers}</div>
            <div className="text-[10px] text-zinc-500">Peers</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2">
            <ArrowUpDown size={14} className="mx-auto mb-1 text-emerald-400" />
            <div className="text-lg font-bold text-white">{store.messagesRelayed}</div>
            <div className="text-[10px] text-zinc-500">Relayed</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2">
            <Shield size={14} className="mx-auto mb-1 text-amber-400" />
            <div className="text-lg font-bold text-white">{store.alerts.length}</div>
            <div className="text-[10px] text-zinc-500">Alerts</div>
          </div>
        </div>

        {activePeers > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.values(store.peers)
              .filter((p) => p.channel?.readyState === 'open')
              .map((p) => (
                <span key={p.id} className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">
                  {p.id.slice(0, 12)}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="p-3 border-b border-zinc-700/50">
        <button
          onClick={() => setDemoMode(!demoMode)}
          className="w-full text-xs flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 transition text-zinc-400 hover:text-white"
        >
          <Zap size={12} />
          {demoMode ? 'Hide Demo Controls' : 'Demo: Send CAP Alert'}
        </button>
        {demoMode && (
          <div className="mt-2 space-y-1.5">
            <button
              onClick={() => sendDemoAlert('cyclone')}
              className="w-full text-xs py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/30 transition flex items-center justify-center gap-1.5"
            >
              <Send size={11} /> 🌀 ঘূর্ণিঝড় সতর্কতা (Cyclone)
            </button>
            <button
              onClick={() => sendDemoAlert('flood')}
              className="w-full text-xs py-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 hover:text-orange-200 border border-orange-500/30 transition flex items-center justify-center gap-1.5"
            >
              <Send size={11} /> 🌊 বন্যা সতর্কতা (Flood)
            </button>
            <button
              onClick={() => sendDemoAlert('all_clear')}
              className="w-full text-xs py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 transition flex items-center justify-center gap-1.5"
            >
              <Send size={11} /> ✅ নিরাপদ (All Clear)
            </button>
            <p className="text-[10px] text-zinc-500 text-center mt-1">
              Alerts broadcast to mesh + LoRa hardware simultaneously
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {store.alerts.length === 0 ? (
          <div className="text-center py-8 text-zinc-600">
            <Shield size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No alerts yet</p>
            <p className="text-[10px] mt-1 opacity-50">
              CAP alerts will appear here — relayed via mesh even when offline
            </p>
          </div>
        ) : (
          store.alerts.map((alert) => (
            <AlertCard key={alert.identifier} alert={alert} />
          ))
        )}
      </div>

      <div className="p-2 border-t border-zinc-700/50 space-y-1">
        <div className="flex items-center justify-center gap-2">
          <MapPin size={10} className={loc.lat ? 'text-emerald-400' : 'text-zinc-600'} />
          <span className="text-[10px] font-mono text-zinc-500">
            {loc.lat !== null
              ? `${loc.lat.toFixed(4)}, ${loc.lng!.toFixed(4)}`
              : loc.permissionStatus === 'denied'
                ? 'GPS denied'
                : 'Locating…'}
          </span>
        </div>
        <div className="text-center">
          <span className="text-[10px] text-zinc-600 font-mono">
            ID: {store.peerId} · {store.messagesReceived} recv · {store.messagesRelayed} relay
          </span>
        </div>
      </div>
    </div>
  );
}
