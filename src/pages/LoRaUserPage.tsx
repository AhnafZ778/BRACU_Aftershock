import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useLoRaStore, getSignalQuality, getSignalBars, getSignalColor,
  formatUptime, getAlertIcon, getSeverityColors,
} from '../store/useLoRaStore';
import { useAppStore } from '../store/useAppStore';
import type { LoRaDevice, LoRaAlert, TransmissionEntry } from '../store/useLoRaStore';

import { SchoolsLayer } from '../components/Map/SchoolsLayer';
import { HealthLayer } from '../components/Map/HealthLayer';
import { SheltersLayer } from '../components/Map/SheltersLayer';
import { ReligiousPlacesLayer } from '../components/Map/ReligiousPlacesLayer';
import { RoadOverlayLayer } from '../components/Map/roads/RoadOverlayLayer';
import { EvacuationRouteLayer } from '../components/Map/EvacuationRouteLayer';

import {
  Radio, Satellite, Battery, MapPin, RefreshCw, Activity,
  WifiOff, ArrowUp, ArrowDown, AlertTriangle, ShieldCheck,
  Clock, Signal, Package, ChevronUp, ChevronDown,
  Layers, Cpu, Info, Eye, EyeOff,
  } from 'lucide-react';

/* ── inject keyframes once ───────────────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('lora-kf')) {
  const s = document.createElement('style');
  s.id = 'lora-kf';
  s.textContent = `
    @keyframes lora-ping  { 0%{transform:scale(.95);opacity:.8} 70%,100%{transform:scale(2.5);opacity:0} }
    @keyframes danger-pulse { 0%,100%{opacity:1} 50%{opacity:.87} }
    @keyframes scan-line  { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }
    @keyframes icon-shake { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-9deg)} 75%{transform:rotate(9deg)} }
    @keyframes blink-dot  { 0%,100%{opacity:1} 50%{opacity:.2} }
    @keyframes fade-up    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  `;
  document.head.appendChild(s);
}

/* ── leaflet icon ─────────────────────────────────────────────────────────── */
function createDeviceIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:38px;height:38px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(20,184,166,.28);
           animation:lora-ping 2.1s cubic-bezier(0,0,.2,1) infinite"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(20,184,166,.13);
           animation:lora-ping 2.1s cubic-bezier(0,0,.2,1) infinite .7s"></div>
      <div style="position:absolute;inset:9px;border-radius:50%;background:#14b8a6;
           border:2.5px solid #fff;
           box-shadow:0 0 22px rgba(20,184,166,.95),0 0 6px rgba(0,0,0,.5)"></div>
    </div>`,
    iconSize:[38,38], iconAnchor:[19,19], popupAnchor:[0,-22],
  });
}

function MapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { map.setView([lat, lng], 14, { animate: false }); first.current = false; }
    else { map.panTo([lat, lng], { animate: true, duration: 1.4 }); }
  }, [lat, lng, map]);
  return null;
}

/* ── small reusable widgets ──────────────────────────────────────────────── */
function SignalBars({ rssi }: { rssi: number }) {
  const bars  = getSignalBars(rssi);
  const color = getSignalColor(getSignalQuality(rssi));
  return (
    <div className="flex items-end gap-[3px]">
      {[8, 13, 19, 25, 31].map((h, i) => (
        <div key={i} className="w-2 rounded-sm transition-all duration-500"
          style={{
            height: h,
            background: i < bars ? color : 'rgba(100,116,139,.25)',
            boxShadow:  i < bars ? `0 0 6px ${color}90` : 'none',
          }} />
      ))}
    </div>
  );
}

function BatteryBar({ pct }: { pct: number }) {
  const c = pct > 50 ? '#22c55e' : pct > 20 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2.5 bg-slate-700/60 rounded-full overflow-hidden border border-slate-600/40">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: c, boxShadow: `0 0 8px ${c}55` }} />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color: c }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

/* ── Danger Banner ───────────────────────────────────────────────────────── */
function DangerBanner({ alert }: { alert: LoRaAlert }) {
  const crit = alert.severity === 'critical';
  return (
    <div
      className={`relative flex items-center gap-4 px-5 py-3 text-white shrink-0 overflow-hidden
        ${crit
          ? 'bg-gradient-to-r from-red-950 via-red-800 to-red-950'
          : 'bg-gradient-to-r from-orange-950 via-orange-800 to-orange-950'}`}
      style={{ animation: 'danger-pulse 2.6s ease-in-out infinite' }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,.07) 50%,transparent 100%)',
          animation: 'scan-line 3.5s linear infinite',
        }} />
      <span className="text-2xl shrink-0" style={{ animation: 'icon-shake .7s ease-in-out infinite' }}>
        {getAlertIcon(alert.type)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            {crit ? '⚠ CRITICAL BROADCAST VIA LoRa' : '⚠ HIGH ALERT BROADCAST VIA LoRa'}
          </span>
          <span className="text-[10px] font-mono opacity-50 hidden sm:inline">&bull; {alert.id}</span>
        </div>
        <p className="text-sm font-bold leading-tight truncate">{alert.title}</p>
        <p className="text-xs font-bangla opacity-85 truncate mt-0.5">{alert.title_bn}</p>
      </div>
      <div className="hidden md:flex items-center gap-2 shrink-0 bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
        <span className={`w-2 h-2 rounded-full ${crit ? 'bg-red-300' : 'bg-orange-300'}`}
          style={{ animation: 'blink-dot 1s step-end infinite' }} />
        <span className="text-xs font-bold uppercase tracking-wider">Live Transmission</span>
      </div>
    </div>
  );
}

/* ── Status Bar ──────────────────────────────────────────────────────────── */
function StatusBar({
  device, pollError, lastPoll, countdown, onRefresh, isRefreshing,
}: {
  device: LoRaDevice | null; pollError: string | null; lastPoll: Date | null;
  countdown: number; onRefresh: () => void; isRefreshing: boolean;
}) {
  const online   = device?.online ?? false;
  const sigColor = getSignalColor(device ? getSignalQuality(device.signal.rssi) : 'no-signal');
  const batColor = (device?.battery_pct ?? 100) > 50 ? '#22c55e'
                 : (device?.battery_pct ?? 100) > 20 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2 sm:gap-4 px-4 py-2 bg-ops-surface/90
                    border-b border-ops-border backdrop-blur-sm flex-wrap shrink-0">
      {/* online dot */}
      <div className="flex items-center gap-1.5">
        <div className="relative h-2.5 w-2.5">
          {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? 'bg-teal-400' : 'bg-slate-500'}`} />
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider ${online ? 'text-teal-400' : 'text-slate-500'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <span className="h-4 w-px bg-ops-border hidden sm:block" />
      <span className="text-[11px] font-mono text-ops-text-muted hidden sm:inline">{device?.device_id ?? '—'}</span>
      <span className="h-4 w-px bg-ops-border hidden md:block" />

      <div className="hidden lg:flex items-center gap-4 opacity-40">
        <div className="flex items-center gap-1.5">
          <Signal size={11} className="text-ops-text-muted" />
          <span className="text-xs font-mono" style={{ color: sigColor }}>{device ? `${device.signal.rssi} dBm` : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={11} className="text-ops-text-muted" />
          <span className="text-xs font-mono text-ops-text-muted">
            {device ? `SNR ${device.signal.snr > 0 ? '+' : ''}${device.signal.snr} dB` : 'SNR —'}
          </span>
        </div>
        <div className="items-center gap-1.5 hidden sm:flex">
          <Satellite size={11} className="text-ops-text-muted" />
          <span className="text-xs font-mono text-ops-text-muted">{device?.location.satellites ?? '—'} SATs</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Battery size={11} className="text-ops-text-muted" />
        <span className="text-xs font-mono" style={{ color: batColor }}>
          {device ? `${device.battery_pct.toFixed(0)}%` : '—'}
        </span>
      </div>

      <div className="flex-1" />

      {pollError && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
          <WifiOff size={10} />
          <span className="hidden lg:inline">Simulated data</span>
        </div>
      )}
      <div className="items-center gap-1.5 text-[10px] text-ops-text-muted/60 hidden md:flex">
        <Clock size={10} />
        {lastPoll
          ? `Synced ${lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          : 'Syncing…'}
      </div>
      <button onClick={onRefresh} disabled={isRefreshing}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ops-bg border border-ops-border
                   text-ops-text-muted hover:text-ops-text hover:border-accent-teal/50 transition-all
                   text-[11px] font-medium disabled:opacity-50">
        <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
        <span className="font-mono">{countdown}s</span>
      </button>
    </div>
  );
}

/* ── Left panel ──────────────────────────────────────────────────────────── */
function DeviceVitalsPanel({ device }: { device: LoRaDevice | null }) {
  const quality  = device ? getSignalQuality(device.signal.rssi) : 'no-signal';
  const sigColor = getSignalColor(quality);

  const Row = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-ops-text-muted">{label}</span>
      <span className={`text-[11px] font-mono ${accent ? 'text-accent-teal' : 'text-ops-text'}`}>{value}</span>
    </div>
  );

  return (
    <aside className="w-60 xl:w-64 shrink-0 flex flex-col bg-ops-surface border-r border-ops-border overflow-y-auto">
      <div className="px-4 pt-4 pb-2 shrink-0 flex items-center gap-2">
        <Radio size={13} className="text-accent-teal" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ops-text-muted">Device Vitals</span>
      </div>
      <div className="px-3 pb-4 space-y-3 flex-1">

        {/* station */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border">
          <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50 mb-2">Station</p>
          <p className="text-sm font-semibold text-ops-text leading-snug">{device?.name ?? 'Initialising…'}</p>
          <p className="text-[11px] font-mono text-accent-teal mt-1">{device?.device_id ?? '—'}</p>
          <div className="mt-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide
              ${device?.online
                ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                : 'bg-slate-700/40 text-slate-500 border border-slate-600/30'}`}>
              {device?.online ? '● Online' : '○ Offline'}
            </span>
          </div>
        </div>

        {/* battery */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border mt-2">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Battery size={11} className="text-ops-text-muted" />
            <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50">Power</p>
          </div>
          <BatteryBar pct={device?.battery_pct ?? 0} />
        </div>

        <details className="group mt-2">
          <summary className="text-[9px] uppercase tracking-widest text-ops-text-muted/60 cursor-pointer flex items-center justify-between hover:text-ops-text transition-colors select-none p-2 bg-ops-bg/30 rounded-lg border border-transparent hover:border-ops-border">
            <span>Advanced Diagnostics</span>
            <ChevronDown size={12} className="group-open:-rotate-180 transition-transform" />
          </summary>
          <div className="pt-3 space-y-3 opacity-50 hover:opacity-100 transition-opacity">

        {/* signal */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border space-y-3">
          <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50">Signal Quality</p>
          <div className="flex items-center justify-between">
            <SignalBars rssi={device?.signal.rssi ?? -130} />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ color: sigColor, background: `${sigColor}18`, border: `1px solid ${sigColor}40` }}>
              {quality.replace('-', ' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[11px] text-ops-text-muted">RSSI</span>
            <span className="text-[11px] font-mono" style={{ color: sigColor }}>
              {device ? `${device.signal.rssi} dBm` : '—'}
            </span>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[11px] text-ops-text-muted">SNR</span>
              <span className="text-[11px] font-mono text-ops-text">
                {device ? `${device.signal.snr > 0 ? '+' : ''}${device.signal.snr} dB` : '—'}
              </span>
            </div>
            <div className="h-1.5 bg-ops-border rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: device ? `${Math.min(100, Math.max(0, ((device.signal.snr + 20) / 30) * 100))}%` : '0%',
                  background: sigColor, boxShadow: `0 0 6px ${sigColor}55`,
                }} />
            </div>
          </div>
        </div>

        {/* gps */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border space-y-1.5">
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin size={11} className="text-accent-primary" />
            <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50">GPS Position</p>
            {device && <span className="ml-auto text-[9px] font-bold text-teal-400">✓ Lock</span>}
          </div>
          <Row label="Latitude"   value={device ? `${device.location.lat.toFixed(6)}°` : '—'} />
          <Row label="Longitude"  value={device ? `${device.location.lng.toFixed(6)}°` : '—'} />
          <Row label="Altitude"   value={device ? `${device.location.altitude_m} m`    : '—'} />
          <Row label="Accuracy"   value={device ? `±${device.location.accuracy_m} m`   : '—'} />
          <Row label="Satellites" value={device ? `${device.location.satellites} SVs`  : '—'} />
          <Row label="HDOP"       value={device ? `${device.location.hdop.toFixed(2)}` : '—'} />
        </div>

        {/* lora params */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border space-y-1.5">
          <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50 mb-2">LoRa Parameters</p>
          <Row label="Frequency"   value={device ? `${device.signal.frequency_mhz} MHz`  : '—'} accent />
          <Row label="Spreading"   value={device ? `SF${device.signal.spreading_factor}` : '—'} accent />
          <Row label="Bandwidth"   value={device ? `${device.signal.bandwidth_khz} kHz`  : '—'} accent />
          <Row label="Coding Rate" value={device?.signal.coding_rate ?? '—'}                     accent />
        </div>



        {/* stats */}
        <div className="bg-ops-bg rounded-xl p-3 border border-ops-border space-y-1.5">
          <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50 mb-2">Statistics</p>
          {([
            [<Clock     key="u" size={10} />,                           'Uptime',  device ? formatUptime(device.uptime_s)            : '—'],
            [<ArrowDown key="r" size={10} className="text-teal-400" />, 'Pkts RX', device ? device.packets_received.toLocaleString() : '—'],
            [<ArrowUp   key="t" size={10} className="text-blue-400" />, 'Pkts TX', device ? device.packets_sent.toLocaleString()     : '—'],
          ] as [React.ReactNode, string, string][]).map(([icon, label, value]) => (
            <div key={label} className="flex justify-between items-center">
              <div className="flex items-center gap-1.5 text-ops-text-muted">{icon}<span className="text-[11px]">{label}</span></div>
              <span className="text-[11px] font-mono text-ops-text">{value}</span>
            </div>
          ))}
        </div>

          </div>
        </details>

      </div>
    </aside>
  );
}

/* ── Map panel ───────────────────────────────────────────────────────────── */
/* ── Map Style & Controls ────────────────────────────────────────────────── */
function MapStyleControl() {
  const { mapStyle, setMapStyle } = useAppStore();
  const styles: { id: typeof mapStyle; label: string; icon: any }[] = [
    { id: 'dark', label: 'Dark Matter', icon: <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-700" /> },
    { id: 'light', label: 'Positron', icon: <div className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300" /> },
    { id: 'satellite', label: 'Satellite', icon: <Satellite size={12} /> },
  ];

  return (
    <div className="absolute top-3 left-3 z-[500] flex flex-col gap-1">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-1 flex flex-col shadow-2xl">
        {styles.map(s => (
          <button
            key={s.id}
            onClick={() => setMapStyle(s.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all group
              ${mapStyle === s.id ? 'bg-teal-500/20 text-teal-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          >
            {s.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LayersControl() {
  const { layers, toggleLayer } = useAppStore();
  const layerItems = [
    { id: 'nodes' as const, label: 'LoRa Nodes', icon: <Cpu size={12} /> },
    { id: 'range' as const, label: 'Signal Range', icon: <Activity size={12} /> },
    { id: 'infrastructure' as const, label: 'Critical Infra', icon: <Layers size={12} /> },
  ];

  return (
    <div className="absolute top-40 left-3 z-[500] flex flex-col gap-1">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-1 flex flex-col shadow-2xl">
        {layerItems.map(l => (
          <button
            key={l.id}
            onClick={() => toggleLayer(l.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all
              ${layers[l.id] ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
          >
            {l.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{l.label}</span>
            {layers[l.id] ? <Eye size={10} className="ml-auto opacity-60" /> : <EyeOff size={10} className="ml-auto opacity-40" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoRaDeviceMap({ device }: { device: LoRaDevice }) {
  const { lat, lng, accuracy_m } = device.location;
  const { mapStyle, layers } = useAppStore();
  const icon = createDeviceIcon();

  const tileUrls: Record<string, string> = {
    dark: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  };

  return (
    <div className="w-full h-full relative group">
      <MapContainer center={[lat, lng]} zoom={14} zoomControl={false}
        className="w-full h-full" style={{ background: '#ffffff' }}>
        <TileLayer
          attribution={mapStyle === 'satellite' ? 'Tiles &copy; Esri' : '&copy; CARTO'}
          url={tileUrls[mapStyle]}
        />

        {layers.range && (
          <Circle center={[lat, lng]} radius={5000}
            pathOptions={{ color: '#14b8a6', fillColor: '#14b8a6', fillOpacity: .04, weight: 1, dashArray: '6 5', opacity: .45 }} />
        )}

        <Circle center={[lat, lng]} radius={accuracy_m}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: .18, weight: 1.5, opacity: .75 }} />

        {layers.nodes && <Marker position={[lat, lng]} icon={icon} />}

        {layers.infrastructure && (
          <>
            <SchoolsLayer />
            <HealthLayer />
            <SheltersLayer />
            <ReligiousPlacesLayer />
            <RoadOverlayLayer />
            <EvacuationRouteLayer />
            {/* Simulated Critical Infrastructure in Teknaf area */}
            <Circle center={[21.861, 92.305]} radius={150} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: .2 }} />
            <Circle center={[21.865, 92.312]} radius={200} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: .2 }} />
          </>
        )}

        <MapController lat={lat} lng={lng} />
      </MapContainer>

      <MapStyleControl />
      <LayersControl />

      {/* coordinates overlay */}
      <div className="absolute bottom-3 left-3 z-[500] bg-slate-900/60 backdrop-blur-md
                      border border-slate-700/50 rounded-xl px-4 py-2 font-mono
                      text-[10px] text-slate-400 shadow-xl group-hover:bg-slate-900 transition-all">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 border-r border-slate-700/50 pr-3">
            <span className="text-teal-500 font-bold opacity-70 italic">LAT</span>
            <span className="text-slate-200">{lat.toFixed(6)}°N</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-teal-500 font-bold opacity-70 italic">LNG</span>
            <span className="text-slate-200">{lng.toFixed(6)}°E</span>
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="absolute top-3 right-3 z-[500] bg-slate-900/90 backdrop-blur-md
                      border border-slate-700/60 rounded-2xl p-4 shadow-2xl w-48
                      translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
          <Info size={11} className="text-teal-500" /> Map Intelligence
        </p>
        <div className="space-y-3">
          {[
            { color: '#14b8a6', type: 'dot', label: 'Active Station', val: 'Teknaf Alpha' },
            { color: '#3b82f6', type: 'dot', label: 'GPS Precision', val: `${accuracy_m}m Error` },
            { color: '#14b8a6', type: 'dash', label: 'LoRa Cell', val: '5km Radius' },
            { color: '#f59e0b', type: 'infra', label: 'Power Grid', val: 'Substation X' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-[10px]">
                {item.type === 'dot' ? (
                   <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ background: item.color }} />
                ) : item.type === 'dash' ? (
                   <div className="w-4 h-0 border-t-2 border-dashed opacity-70" style={{ borderColor: item.color }} />
                ) : (
                   <div className="w-2.5 h-2.5 rounded-sm rotate-45" style={{ background: item.color }} />
                )}
                <span className="text-slate-300 font-semibold">{item.label}</span>
              </div>
              <span className="text-[9px] text-slate-500 pl-4.5 opacity-80">{item.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MapLoadingState() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-ops-bg gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-teal-400/25 animate-ping" />
        <div className="absolute inset-3 rounded-full border-2 border-teal-400/40 animate-ping delay-150" />
        <div className="w-16 h-16 rounded-full border-t-2 border-teal-400 animate-spin" />
      </div>
      <p className="text-sm text-ops-text-muted animate-pulse">Acquiring GPS lock…</p>
    </div>
  );
}

/* ── Right panel ─────────────────────────────────────────────────────────── */
function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AlertsPanel({ alerts }: { alerts: LoRaAlert[] }) {
  const active = alerts.filter(a => a.active);
  const past   = alerts.filter(a => !a.active);
  return (
    <aside className="w-72 xl:w-80 shrink-0 flex flex-col bg-ops-surface border-l border-ops-border overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-ops-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-severity-high" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ops-text-muted">
              Broadcast Alerts
            </span>
          </div>
          {active.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"
                style={{ animation: 'blink-dot 1s step-end infinite' }} />
              {active.length} Active
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {active.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <ShieldCheck size={34} className="text-severity-safe opacity-50" />
            <p className="text-sm font-semibold text-severity-safe">All Clear</p>
            <p className="text-xs text-ops-text-muted max-w-[200px] leading-relaxed">
              No active alerts broadcast from this station.
            </p>
          </div>
        )}

        {active.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/50 px-1">
              Active Transmissions
            </p>
            {active.map(alert => {
              const c = getSeverityColors(alert.severity);
              return (
                <div key={alert.id}
                  className={`rounded-xl border p-4 space-y-3 ${c.bg} ${c.border}`}
                  style={{ animation: 'fade-up .35s ease' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none">{getAlertIcon(alert.type)}</span>
                      <div>
                        <p className={`text-sm font-bold leading-tight ${c.text}`}>{alert.title}</p>
                        <p className="text-xs font-bangla text-ops-text-muted mt-0.5">{alert.title_bn}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${c.badge}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[11px] text-ops-text leading-relaxed">{alert.message}</p>
                  </div>
                  <div className="bg-black/20 rounded-lg p-3 border-t border-white/5">
                    <p className="text-xs font-bangla text-ops-text leading-relaxed">{alert.message_bn}</p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-ops-text-muted/70 pt-1">
                    <span className="truncate">📍 {alert.area}</span>
                    <span className="font-mono ml-2 shrink-0">{relTime(alert.timestamp)}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {past.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-ops-text-muted/40 px-1 pt-2">
              Past Transmissions
            </p>
            {past.map(alert => (
              <div key={alert.id}
                className="rounded-xl border border-ops-border bg-ops-bg/50 p-3 flex items-center gap-3 opacity-55 hover:opacity-80 transition-opacity">
                <span className="text-base">{getAlertIcon(alert.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ops-text truncate">{alert.title}</p>
                  <p className="text-[10px] text-ops-text-muted">{relTime(alert.timestamp)}</p>
                </div>
                <span className="text-[9px] text-ops-text-muted/60 uppercase font-mono shrink-0">inactive</span>
              </div>
            ))}
          </>
        )}

      </div>
    </aside>
  );
}

/* ── Transmission Log ────────────────────────────────────────────────────── */
function TransmissionLog({
  entries, isExpanded, onToggle,
}: {
  entries: TransmissionEntry[]; isExpanded: boolean; onToggle: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`shrink-0 border-t border-ops-border bg-ops-bg/50 transition-all duration-300 ${isExpanded ? 'h-44' : 'h-7'}`}>
      {/* toggle header */}
      <button onClick={onToggle}
        className="w-full h-7 flex items-center justify-between px-4 text-ops-text-muted/40 hover:text-ops-text-muted transition-colors">
        <div className="flex items-center gap-2">
          <Package size={10} />
          <span className="text-[9px] font-semibold uppercase tracking-widest">Raw Diagnostics Log</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded opacity-50">
            {entries.length} pkts
          </span>
        </div>
        {isExpanded ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
      </button>

      {/* scrollable log body */}
      {isExpanded && (
        <div ref={logRef} className="h-[calc(100%-36px)] overflow-y-auto font-mono text-[10px] px-4 pb-2 space-y-0.5">
          {entries.map(entry => {
            const isUp = entry.direction === 'uplink';
            return (
              <div key={entry.id}
                className="flex items-center gap-2 py-0.5 border-b border-ops-border/30 hover:bg-ops-surface/30 transition-colors">
                <span className={`w-3 shrink-0 ${isUp ? 'text-teal-400' : 'text-blue-400'}`}>
                  {isUp ? '↑' : '↓'}
                </span>
                <span className="text-ops-text-muted/50 w-20 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-accent-teal/70 w-20 shrink-0">{entry.id}</span>
                <span className="text-ops-text flex-1 truncate">{entry.payload}</span>
                <span className="text-ops-text-muted/50 shrink-0 hidden lg:inline">{entry.rssi} dBm</span>
                <span className="text-ops-text-muted/40 shrink-0 hidden xl:inline">
                  {entry.snr > 0 ? '+' : ''}{entry.snr} dB
                </span>
              </div>
            );
          })}
          <div ref={logRef} />
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export function LoRaUserPage() {
  const {
    device, alerts, transmissionLog,
    isPolling, pollError, lastPoll,
    startPolling, stopPolling, refreshAll,
  } = useLoRaStore();

  const [countdown, setCountdown]     = useState(8);
  const [isLogExpanded, setLogExpanded] = useState(false);
  const [isRefreshing, setRefreshing]  = useState(false);

  /* start / stop polling lifecycle */
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  /* countdown timer */
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 8 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* manual refresh */
  const handleRefresh = async () => {
    setRefreshing(true);
    setCountdown(8);
    await refreshAll();
    setRefreshing(false);
  };

  const activeAlerts = alerts.filter((a: LoRaAlert) => a.active);
  const dangerAlert  = activeAlerts.find((a: LoRaAlert) => a.severity === 'critical')
                    ?? activeAlerts.find((a: LoRaAlert) => a.severity === 'high');

  return (
    <div className="flex flex-col h-full bg-ops-bg overflow-hidden pt-20 sm:pt-24">

      {/* danger banner — only when critical / high alert active */}
      {dangerAlert && <DangerBanner alert={dangerAlert} />}

      {/* top status strip */}
      <StatusBar
        device={device}
        pollError={pollError}
        lastPoll={lastPoll}
        countdown={countdown}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing || !isPolling}
      />

      {/* three-column main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <DeviceVitalsPanel device={device} />

        <div className="flex-1 relative overflow-hidden">
          {device ? <LoRaDeviceMap device={device} /> : <MapLoadingState />}
        </div>

        <AlertsPanel alerts={alerts} />
      </div>

      {/* collapsible transmission log */}
      <TransmissionLog
        entries={transmissionLog}
        isExpanded={isLogExpanded}
        onToggle={() => setLogExpanded(v => !v)}
      />
    </div>
  );
}
