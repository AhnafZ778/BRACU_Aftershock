import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Usb, Wifi, WifiOff, Send, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
  ArrowUp, ArrowDown, Activity, Cpu, Zap, X, Globe,
  Monitor, Server, MousePointer,
} from 'lucide-react';
import {
  useHardwareStore,
  BAUD_OPTIONS,
  type HardwareLogEntry,
  type DivisionOption,
} from '../../store/useHardwareStore';

// ─────────────────────────────────────────────────────────────────────────────
// Styles injected once
// ─────────────────────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('hw-kf')) {
  const s = document.createElement('style');
  s.id = 'hw-kf';
  s.textContent = `
    @keyframes hw-ping   { 0%{transform:scale(.9);opacity:.8} 70%,100%{transform:scale(2.2);opacity:0} }
    @keyframes hw-in     { from{opacity:0;transform:translateY(-8px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function reltime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log row
// ─────────────────────────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: HardwareLogEntry }) {
  const icon =
    entry.direction === 'tx'  ? <ArrowUp    size={9} className="text-blue-400 shrink-0"    /> :
    entry.direction === 'ack' ? <CheckCircle size={9} className="text-emerald-400 shrink-0" /> :
    entry.direction === 'rx'  ? <ArrowDown   size={9} className="text-teal-400 shrink-0"    /> :
                                <Activity    size={9} className="text-slate-500 shrink-0"   />;

  const txt =
    entry.level === 'transmit' ? 'text-blue-300'    :
    entry.level === 'ack'      ? 'text-emerald-300' :
    entry.level === 'error'    ? 'text-red-400'     :
    entry.level === 'rx'       ? 'text-teal-300'    : 'text-slate-400';

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono
                    border-b border-white/5 hover:bg-white/[0.03] transition-colors">
      {icon}
      <span className="text-slate-600 w-16 shrink-0 tabular-nums">
        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      {entry.msg_id && <span className="text-teal-500/50 w-10 shrink-0">{entry.msg_id}</span>}
      <span className={`flex-1 truncate ${txt}`}>{entry.text}</span>
      {entry.extra && <span className="text-slate-600 shrink-0">{entry.extra}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Select wrapper
// ─────────────────────────────────────────────────────────────────────────────
function HwSelect({ value, onChange, disabled, children, className = '' }:
  { value: string | number; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none bg-[#0e1117] border border-white/10 rounded-lg
                   px-3 py-1.5 text-[11px] text-slate-200 font-mono pr-6 focus:outline-none
                   focus:border-teal-500/40 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        {children}
      </select>
      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function HardwareGatewayPanel() {
  const {
    serialMode, webSerialSupported, webSerialPortSelected, webSerialPortLabel,
    status, ports, presets, divisions, isConnecting, isDisconnecting, isTransmitting,
    selectedPort, selectedBaud, selectedNodeId, selectedMsgType,
    selectedRegion, selectedDivision,
    activeZoneDistrictName,
    customPayload, currentTranslation, isTranslating,
    log, error,
    detectSerialMode, setSerialMode, requestWebSerialPort,
    fetchPorts, fetchPresets, fetchDivisions, fetchRegions, fetchStatus, fetchLog,
    connect, disconnect, transmit,
    setSelectedPort, setSelectedBaud,
    setSelectedMsgType, setSelectedRegion, setSelectedDivision,
    setCustomPayload, clearError,
  } = useHardwareStore();

  const [logOpen, setLogOpen]     = useState(true);
  const logEnd  = useRef<HTMLDivElement>(null);

  // ── Init on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    detectSerialMode();
    fetchPresets();
    fetchStatus();
    fetchRegions();
    fetchDivisions();
    // Only fetch backend ports if in backend mode
    if (serialMode === 'backend') {
      fetchPorts();
    }
  }, []);

  // ── Keep UI synced with backend state and changing USB ports ──────────────
  useEffect(() => {
    const t = setInterval(() => {
      fetchStatus();
      const current = useHardwareStore.getState();
      if (current.status?.connected) {
        fetchLog();
      } else if (current.serialMode === 'backend') {
        fetchPorts();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [fetchLog, fetchPorts, fetchStatus]);

  // ── Scroll log ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (logOpen) logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  const connected    = status?.connected ?? false;
  const ackCount     = log.filter(e => e.level === 'ack').length;
  const activePreset = presets.find(p => p.code === selectedMsgType);
  const activeDivision: DivisionOption | undefined = divisions.find(d => d.id === selectedDivision);
  const activeDistrict = activeDivision?.districts.find(d => d.id === selectedRegion);

  // Filter divisions to only show the one matching the active zone's district
  const filteredDivisions = useMemo(() => {
    if (!activeZoneDistrictName) return divisions;
    const normalizedName = activeZoneDistrictName.toLowerCase().trim();
    const matched = divisions.filter(div =>
      div.districts.some(d => {
        const label = d.label.toLowerCase();
        return label.includes(normalizedName) || normalizedName.includes(d.id);
      })
    );
    return matched.length > 0 ? matched : divisions;
  }, [divisions, activeZoneDistrictName]);

  // The native 3-part translation for OLED preview
  const nativeObj = currentTranslation?.native_text;
  const nativeName   = typeof nativeObj === 'object' && nativeObj ? nativeObj.name   : null;
  const nativeSignal = typeof nativeObj === 'object' && nativeObj ? nativeObj.signal : null;
  const nativeAction = typeof nativeObj === 'object' && nativeObj ? nativeObj.action : null;

  const isWebSerial = serialMode === 'webserial';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-slate-300">
      {/* Header bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/8 shrink-0
                      bg-gradient-to-r from-teal-500/5 to-transparent">
        <div className="relative flex h-2 w-2 shrink-0">
          {connected && (
            <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60"
              style={{ animation: 'hw-ping 2s ease-in-out infinite' }} />
          )}
          <span className={`relative h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        </div>
        <Usb size={12} className="text-teal-400 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 flex-1">
          LoRa Hardware Gateway
        </span>
        <div className="flex items-center gap-2">
          {(status?.packets_sent ?? 0) > 0 && (
            <span className="text-[9px] font-mono text-blue-400/60">{status!.packets_sent} TX</span>
          )}
          {ackCount > 0 && (
            <span className="text-[9px] font-mono text-emerald-400/60">{ackCount} ACK</span>
          )}
        </div>
      </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-950/50 border-b border-red-500/20 shrink-0">
              <AlertTriangle size={11} className="text-red-400 shrink-0" />
              <p className="text-[10px] text-red-400 flex-1 leading-snug">{error}</p>
              <button onClick={clearError} className="text-red-400/50 hover:text-red-300">
                <X size={10} />
              </button>
            </div>
          )}

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 p-3 space-y-3"
               style={{ scrollbarWidth: 'none' }}>

            {/* ── Serial Mode Selector ──────────────────────────────────── */}
            <section className="rounded-xl border border-white/8 bg-white/[0.03] p-3 space-y-2.5">
              <p className="text-[9px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Cpu size={9} /> Connection Mode
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSerialMode('webserial')}
                  disabled={!webSerialSupported}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium
                    border transition-all duration-200
                    ${isWebSerial
                      ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                      : 'bg-white/[0.03] text-slate-500 border-white/8 hover:text-slate-300 hover:border-white/15'
                    }
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                  title={webSerialSupported ? 'Connect via browser (works with cloud hosting)' : 'Web Serial requires Chrome/Edge'}
                >
                  <Monitor size={10} />
                  Browser USB
                </button>
                <button
                  onClick={() => setSerialMode('backend')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium
                    border transition-all duration-200
                    ${!isWebSerial
                      ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                      : 'bg-white/[0.03] text-slate-500 border-white/8 hover:text-slate-300 hover:border-white/15'
                    }`}
                  title="Connect via backend server (only works when server runs locally)"
                >
                  <Server size={10} />
                  Backend Serial
                </button>
              </div>
              {isWebSerial && !webSerialSupported && (
                <p className="text-[9px] text-amber-400/70 pl-0.5">
                  ⚠ Web Serial API not available. Use Chrome or Edge browser.
                </p>
              )}
              {isWebSerial && webSerialSupported && (
                <p className="text-[9px] text-teal-400/50 pl-0.5">
                  ✓ Browser connects directly to your USB device — works with cloud hosting
                </p>
              )}
              {!isWebSerial && (
                <p className="text-[9px] text-slate-500/70 pl-0.5">
                  ⓘ Backend serial only works when the server runs on the same machine as the ESP32
                </p>
              )}
            </section>

            {/* ── Serial Connection ──────────────────────────────────────── */}
            <section className="rounded-xl border border-white/8 bg-white/[0.03] p-3 space-y-2.5">
              <p className="text-[9px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Usb size={9} /> Serial Connection
              </p>

              {/* ─── Web Serial Mode ─────────────────────────────────────── */}
              {isWebSerial ? (
                <>
                  {/* Port selection button (requires user gesture) */}
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={requestWebSerialPort}
                      disabled={connected}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium
                        border border-white/10 bg-white/[0.04] text-slate-300
                        hover:text-teal-300 hover:border-teal-500/30 hover:bg-teal-500/5
                        transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MousePointer size={11} />
                      {webSerialPortSelected ? 'Change USB Port' : 'Select USB Port'}
                    </button>

                    <HwSelect
                      value={selectedBaud}
                      onChange={v => setSelectedBaud(Number(v))}
                      disabled={connected}
                      className="w-24"
                    >
                      {BAUD_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </HwSelect>
                  </div>

                  {/* Show selected port info */}
                  {webSerialPortSelected && (
                    <p className="text-[9px] text-teal-400/60 font-mono truncate pl-0.5 flex items-center gap-1">
                      <CheckCircle size={8} className="text-teal-400/40 shrink-0" />
                      {webSerialPortLabel ?? 'Port selected'}
                    </p>
                  )}

                  {/* Connect / Disconnect */}
                  <button
                    onClick={connected ? disconnect : connect}
                    disabled={connected ? isDisconnecting : (isConnecting || !webSerialPortSelected)}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg
                      text-xs font-bold uppercase tracking-wider transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${connected
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                  >
                    {connected
                      ? isDisconnecting
                        ? <><RefreshCw size={11} className="animate-spin" /> Disconnecting…</>
                        : <><WifiOff size={11} /> Disconnect</>
                      : isConnecting
                        ? <><RefreshCw size={11} className="animate-spin" /> Connecting…</>
                        : <><Wifi size={11} /> Connect to Gateway</>
                    }
                  </button>
                </>
              ) : (
                /* ─── Backend Serial Mode (original UI) ────────────────────── */
                <>
                  <div className="flex gap-2">
                    <HwSelect value={selectedPort} onChange={setSelectedPort} disabled={connected} className="flex-1">
                      {ports.length === 0
                        ? <option value="">No ports found</option>
                        : ports.map(p => <option key={p.device} value={p.device}>{p.device}</option>)
                      }
                    </HwSelect>
                    <HwSelect value={selectedBaud} onChange={v => setSelectedBaud(Number(v))} disabled={connected} className="w-24">
                      {BAUD_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </HwSelect>
                    <button onClick={fetchPorts} disabled={connected} title="Refresh ports"
                      className="px-2.5 rounded-lg border border-white/10 bg-white/[0.04]
                                 text-slate-400 hover:text-teal-400 hover:border-teal-500/30
                                 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      <RefreshCw size={11} />
                    </button>
                  </div>

                  {selectedPort && (
                    <p className="text-[9px] text-slate-600 font-mono truncate pl-0.5">
                      {ports.find(p => p.device === selectedPort)?.description ?? '—'}
                    </p>
                  )}

                  <button
                    onClick={connected ? disconnect : connect}
                    disabled={connected ? isDisconnecting : (isConnecting || !selectedPort)}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg
                      text-xs font-bold uppercase tracking-wider transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${connected
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                  >
                    {connected
                      ? isDisconnecting
                        ? <><RefreshCw size={11} className="animate-spin" /> Disconnecting…</>
                        : <><WifiOff size={11} /> Disconnect</>
                      : isConnecting
                        ? <><RefreshCw size={11} className="animate-spin" /> Connecting…</>
                        : <><Wifi size={11} /> Connect to Gateway</>
                    }
                  </button>
                </>
              )}
            </section>

            {/* ── Target Region & Dialect ────────────────────────── */}
            <section className="rounded-xl border border-amber-500/15 bg-amber-950/10 p-3 space-y-2.5">
              <p className="text-[9px] uppercase tracking-widest text-amber-400/60 flex items-center gap-1.5">
                <Globe size={9} /> Target Region & Dialect
              </p>

              {/* Division selector */}
              <div>
                <label className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 block">Division</label>
                <HwSelect value={selectedDivision} onChange={setSelectedDivision}>
                  <option value="">— Select Division —</option>
                  {filteredDivisions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </HwSelect>
              </div>

              {/* District selector (cascading from division) */}
              {activeDivision && (
                <div>
                  <label className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 block">District</label>
                  <HwSelect value={selectedRegion} onChange={setSelectedRegion}>
                    <option value="">— All Districts —</option>
                    {activeDivision.districts.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.label} {d.dialect !== 'standard_bengali' ? `(${d.dialect_label})` : ''}
                      </option>
                    ))}
                  </HwSelect>
                </div>
              )}

              {activeDistrict && (
                <p className="text-[9px] text-teal-400/60 pl-0.5 flex items-center gap-1">
                  <Globe size={8} />
                  Dialect: <span className="font-medium text-teal-400">{activeDistrict.dialect_label}</span>
                </p>
              )}

              {/* ── OLED Native Translation Preview (3-line format) ─── */}
              {selectedRegion && selectedMsgType !== 'CUSTOM' && (
                <div className="rounded-lg border border-amber-500/20 bg-black/30 px-3 py-2.5 space-y-1">
                  <p className="text-[8px] uppercase tracking-widest text-amber-400/50 flex items-center gap-1.5">
                    🗣️ OLED Preview (0.96")
                    {isTranslating && <RefreshCw size={8} className="animate-spin text-amber-400/40" />}
                  </p>
                  {nativeName ? (
                    <div className="bg-black rounded-md border border-slate-700 p-2 font-mono space-y-0.5">
                      <p className="text-[10px] text-amber-300 leading-tight">{nativeName}</p>
                      <p className="text-[16px] font-bold text-red-400 leading-tight">{nativeSignal}</p>
                      <p className="text-[10px] text-amber-300 leading-tight">{nativeAction}</p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-amber-400/40 italic">Select a message type above</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Compose Transmission ──────────────────────────────────── */}
            <section className={`rounded-xl border p-3 space-y-2.5 transition-all duration-200
              ${connected
                ? 'border-teal-500/20 bg-teal-500/[0.03]'
                : 'border-white/5 bg-white/[0.015] opacity-50 pointer-events-none'
              }`}
            >
              <p className="text-[9px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Send size={9} /> Compose Transmission
              </p>



              {/* Message Type */}
              <div>
                <label className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 block">Message Type</label>
                <HwSelect value={selectedMsgType} onChange={setSelectedMsgType}>
                  {presets.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                </HwSelect>
              </div>

              {/* Payload */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] text-slate-600 uppercase tracking-wider">Payload</label>
                  <span className={`text-[9px] font-mono ${customPayload.length > 70 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {customPayload.length}/80
                  </span>
                </div>
                <textarea
                  value={customPayload}
                  onChange={e => setCustomPayload(e.target.value)}
                  placeholder={activePreset?.default_msg || 'Enter message…'}
                  maxLength={80}
                  rows={2}
                  className="w-full bg-[#0e1117] border border-white/10 rounded-lg px-3 py-2
                             text-[11px] text-slate-200 placeholder-slate-600 font-mono
                             resize-none focus:outline-none focus:border-teal-500/40 transition-colors"
                />
              </div>

              {/* Wire preview */}
              <div className="rounded-lg border border-white/6 bg-black/40 px-3 py-2">
                <p className="text-[8px] uppercase tracking-widest text-slate-600 mb-1">Serial wire preview</p>
                <p className="text-[10px] font-mono text-teal-400/70 break-all leading-relaxed">
                  <span className="text-slate-500">NRP|</span>
                  {selectedNodeId}<span className="text-slate-500">|</span>
                  {selectedMsgType}<span className="text-slate-500">|</span>
                  <span className="text-slate-300">
                    {(customPayload || activePreset?.default_msg || '…').slice(0, 35)}
                    {(customPayload || activePreset?.default_msg || '').length > 35 ? '…' : ''}
                  </span>
                  {nativeName && (
                    <span className="text-amber-400/70"> [{nativeName}|{nativeSignal}|{nativeAction}]</span>
                  )}
                  <span className="text-slate-500">|????</span>
                </p>
              </div>

              {/* Transmit */}
              <button
                onClick={transmit}
                disabled={!connected || isTransmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                  text-xs font-bold uppercase tracking-wider transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  bg-blue-600/15 text-blue-300 border border-blue-500/25
                  hover:bg-blue-600/25 hover:border-blue-400/40
                  hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]"
              >
                {isTransmitting
                  ? <><RefreshCw size={12} className="animate-spin" /> Transmitting…</>
                  : <><Send size={12} /> Transmit via LoRa</>
                }
              </button>

              {/* Last ACK */}
              {status?.last_ack && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                                bg-emerald-500/8 border border-emerald-500/15">
                  <CheckCircle size={10} className="text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-emerald-400 font-mono">
                      ACK: <span className="font-bold">{status.last_ack}</span>
                    </p>
                    {status.last_ack_ts && (
                      <p className="text-[9px] text-slate-600">{reltime(status.last_ack_ts)}</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── Gateway Status ────────────────────────────────────────── */}
            {connected && status && (
              <section className="rounded-xl border border-white/8 bg-white/[0.03] p-3 space-y-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <Cpu size={9} /> Gateway Status
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    ['Mode', isWebSerial ? 'Browser USB' : 'Backend'],
                    ['Port',  status.port ?? '—'],
                    ['Baud',  status.baud.toString()],
                    ['TX',    status.packets_sent.toString()],
                    ['ACKs',  ackCount.toString()],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-[10px]">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-mono text-slate-300">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>{/* end scrollable body */}

          {/* ── Transmission Log (sticky bottom) ─────────────────────── */}
          <div className={`border-t border-white/8 shrink-0 transition-all duration-300
                          ${logOpen ? 'max-h-36' : 'max-h-[26px]'} overflow-hidden`}>
            <button
              onClick={() => setLogOpen(v => !v)}
              className="w-full h-[26px] flex items-center justify-between px-3
                         text-slate-600 hover:text-slate-400 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Zap size={9} />
                <span className="text-[8px] font-semibold uppercase tracking-widest">Transmission Log</span>
                <span className="text-[8px] font-mono opacity-50">{log.length}</span>
              </div>
              {logOpen ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
            </button>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(9rem - 26px)' }}>
              {log.length === 0 ? (
                <p className="text-center text-[9px] text-slate-700 py-3 font-mono">No transmissions yet</p>
              ) : (
                log.map(e => <LogRow key={e.id} entry={e} />)
              )}
            </div>
          </div>
        </div>
  );
}
