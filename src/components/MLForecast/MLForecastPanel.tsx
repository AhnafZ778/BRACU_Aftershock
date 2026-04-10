import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, TrendingDown, TrendingUp, Activity, AlertTriangle, CheckCircle2, Play, Pause, RefreshCw } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';

// Types
interface MLStatus {
  ml_available: boolean;
  tensorflow_installed: boolean;
  lstm_loaded: boolean;
  convlstm_loaded: boolean;
  model_info?: {
    lstm: { name: string; version: string; performance: string };
    convlstm: { name: string; version: string; performance: string };
  };
}

interface MLPrediction {
  lstm_pressure_hpa: number;
  lstm_wind_kt: number;
  blended_pressure_hpa: number;
  blended_wind_kt: number;
  confidence: number;
  model_version: string;
  blend_alpha: number;
  forecast_steps: number[];
  forecast_wind_kt: number[];
  context?: {
    sst: number;
    precip: number;
    u_wind: number;
    v_wind: number;
  };
  field_forecast?: number[][][][]; // [4, 50, 50, 2]
}

interface MLForecastPanelProps {
  currentStep?: {
    storm_wind_kt?: number;
    storm_pres_hpa?: number;
    ml_predictions?: MLPrediction;
    phase?: string;
    hour_offset?: number;
    environmental_context?: {
      temp_sea_surface_celsius: number;
      precipitation_mm_hr: number;
    };
  };
  timeline?: any[];
  currentStepIdx?: number;
}

export function MLForecastPanel({ currentStep, timeline, currentStepIdx = 0 }: MLForecastPanelProps) {
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const isPlaying = useSimulationStore(s => s.isPlaying);
  const play = useSimulationStore(s => s.play);
  const pause = useSimulationStore(s => s.pause);

  useEffect(() => {
    fetch('/api/ml/status')
      .then((r) => r.json())
      .then((data) => {
        setMlStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setMlStatus({ ml_available: false, tensorflow_installed: false, lstm_loaded: false, convlstm_loaded: false });
        setLoading(false);
      });
  }, []);

  const pred = currentStep?.ml_predictions;
  const stormWind = currentStep?.storm_wind_kt ?? 0;
  const stormPres = currentStep?.storm_pres_hpa ?? 1013;
  
  // Extract history for trends (last 12 steps = ~72h simulation if 6h steps, or ~18h if 1.5h steps)
  const historyWindow = 12;
  const history = timeline?.slice(Math.max(0, currentStepIdx - historyWindow), currentStepIdx + 1) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <Activity className="animate-spin mr-2" size={18} /> Loading ML Status...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-700 pb-10">
      {/* ML Service Status */}
      <div className={`rounded-xl border p-3 ${mlStatus?.ml_available
        ? 'border-emerald-500/30 bg-emerald-950/20'
        : 'border-amber-500/30 bg-amber-950/20'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {mlStatus?.ml_available ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="text-amber-400" />
            )}
            <span className={`text-sm font-semibold ${mlStatus?.ml_available ? 'text-emerald-300' : 'text-amber-300'}`}>
              {mlStatus?.ml_available ? 'ML Service Active' : 'ML Service Offline'}
            </span>
          </div>
          <button 
            onClick={() => {
              setLoading(true);
              fetch('/api/ml/status').then(r => r.json()).then(d => { setMlStatus(d); setLoading(false); });
            }}
            className="p-1 px-2 rounded-lg bg-zinc-800/40 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 border border-zinc-700/50"
          >
            <RefreshCw size={10} /> Sync
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <StatusDot label="TF Core" active={mlStatus?.tensorflow_installed} />
          <StatusDot label="LSTM Predictor" active={mlStatus?.lstm_loaded} />
          <StatusDot label="ConvLSTM Field" active={mlStatus?.convlstm_loaded} />
          <StatusDot label="GEE Sink" active={!!currentStep?.environmental_context} />
        </div>
      </div>

      {/* GEE Environmental Trends - THE DATASETS FROM GEE FOLDER */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
             <Activity size={12} className="text-emerald-500" /> GEE Environmental Context
          </h4>
          <span className="text-[9px] text-zinc-600 font-mono">ERA5/OISST Augmented</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 h-24">
           {/* SST Trend */}
           <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-zinc-500 uppercase">Sea Surface Temp</span>
                <span className="text-xs font-bold text-emerald-400">{currentStep?.environmental_context?.temp_sea_surface_celsius.toFixed(1)}°C</span>
              </div>
              <div className="flex-1 flex items-end gap-0.5">
                {history.map((h, i) => {
                  const val = h.environmental_context?.temp_sea_surface_celsius ?? 28;
                  const hgt = ((val - 25) / 5) * 100; // Range 25-30
                  return (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-sm bg-emerald-500/40 border-t border-emerald-400/30 transition-all duration-300 ${i === history.length-1 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]' : ''}`}
                      style={{ height: `${Math.max(10, Math.min(100, hgt))}%` }}
                    />
                  );
                })}
              </div>
           </div>
           {/* Precip Trend */}
           <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-zinc-500 uppercase">Precipitation</span>
                <span className="text-xs font-bold text-blue-400">{currentStep?.environmental_context?.precipitation_mm_hr.toFixed(2)}mm/h</span>
              </div>
              <div className="flex-1 flex items-end gap-0.5">
                {history.map((h, i) => {
                  const val = h.environmental_context?.precipitation_mm_hr ?? 0;
                  const hgt = (val / 15) * 100; // Max 15mm/h
                  return (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-sm bg-blue-500/40 border-t border-blue-400/30 transition-all duration-300 ${i === history.length-1 ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.3)]' : ''}`}
                      style={{ height: `${Math.max(5, Math.min(100, hgt))}%` }}
                    />
                  );
                })}
              </div>
           </div>
        </div>
      </div>

      {/* Intensity Prediction Card */}
      <AnimatePresence>
        {pred && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 to-zinc-950/30 p-3"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-indigo-400" />
                <span className="text-sm font-semibold text-indigo-300 tracking-tight">AI Intensity Blending</span>
              </div>
              <ConfidenceBadge confidence={pred.confidence} />
            </div>

            <div className="space-y-2">
              <ComparisonRow
                label="Core Pressure"
                parametric={stormPres}
                ml={pred.lstm_pressure_hpa}
                blended={pred.blended_pressure_hpa}
                unit="hPa"
                lowerIsBetter={true}
              />
              <ComparisonRow
                label="Maximum Sustained Wind"
                parametric={stormWind}
                ml={pred.lstm_wind_kt}
                blended={pred.blended_wind_kt}
                unit="kt"
                lowerIsBetter={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pressure Trend: History + ML Forecast */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
         <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <TrendingDown size={14} /> Pressure Lifecycle (hPa)
            </h4>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-600" /><span className="text-[8px] text-zinc-500 uppercase">History</span></div>
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /><span className="text-[8px] text-zinc-500 uppercase">AI Forecast</span></div>
            </div>
         </div>

         <div className="flex items-end gap-1 h-28 px-1">
            {/* History Section */}
            {history.map((h, i) => {
              const val = h.storm_pres_hpa ?? 1010;
              const height = ((1015 - val) / 100) * 100; // Relative to 1015-915
              return (
                <div key={`h-${i}`} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                   <div className="absolute -top-6 hidden group-hover:block bg-zinc-800 text-white text-[9px] px-2 py-1 rounded z-20 whitespace-nowrap">{val.toFixed(0)} hPa</div>
                   <div 
                    className="w-full bg-zinc-700/30 border-t border-zinc-600/50 rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(8, height)}%` }}
                   />
                   <span className="text-[6px] text-zinc-700 font-bold uppercase">H</span>
                </div>
              );
            })}
            
            {/* Divider */}
            <div className="w-px h-full bg-zinc-800 mx-0.5" />

            {/* AI Forecast Section */}
            {(pred?.forecast_steps || []).map((pres, i) => {
              const height = ((1015 - pres) / 100) * 100;
              return (
                <div key={`f-${i}`} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                  <div className="absolute -top-6 hidden group-hover:block bg-indigo-900 text-white text-[9px] px-2 py-1 rounded z-20 whitespace-nowrap underline decoration-indigo-400">{pres.toFixed(1)} hPa</div>
                  <div 
                    className="w-full bg-indigo-500/60 border-t border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)] rounded-t-sm transition-all duration-700"
                    style={{ height: `${Math.max(12, height)}%` }}
                  />
                  <span className="text-[6px] text-indigo-500 font-extrabold uppercase mt-1">+{ (i + 1) * 6 }h</span>
                </div>
              );
            })}
         </div>
      </div>

      {/* Wind Trend: History + ML Forecast */}
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
         <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={14} /> Wind Intensity (kt)
            </h4>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-zinc-600" /><span className="text-[8px] text-zinc-500 uppercase">Actual</span></div>
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-[8px] text-zinc-500 uppercase">AI Projection</span></div>
            </div>
         </div>

         <div className="flex items-end gap-1 h-28 px-1">
            {/* History Section */}
            {history.map((h, i) => {
              const val = h.storm_wind_kt ?? 0;
              const height = (val / 180) * 100; // Relative to 180kt max
              return (
                <div key={`h-w-${i}`} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                   <div className="absolute -top-6 hidden group-hover:block bg-zinc-800 text-white text-[9px] px-2 py-1 rounded z-20 whitespace-nowrap">{val.toFixed(0)} kt</div>
                   <div 
                    className="w-full bg-zinc-700/30 border-t border-zinc-600/50 rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(5, height)}%` }}
                   />
                   <span className="text-[6px] text-zinc-700 font-bold uppercase">H</span>
                </div>
              );
            })}
            
            {/* Divider */}
            <div className="w-px h-full bg-zinc-800 mx-0.5" />

            {/* AI Forecast Section */}
            {(pred?.forecast_wind_kt || []).map((wind, i) => {
              const height = (wind / 180) * 100;
              return (
                <div key={`f-w-${i}`} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                  <div className="absolute -top-6 hidden group-hover:block bg-emerald-900 text-white text-[9px] px-2 py-1 rounded z-20 whitespace-nowrap underline decoration-emerald-400">{wind.toFixed(1)} kt</div>
                  <div 
                    className="w-full bg-emerald-500/60 border-t border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)] rounded-t-sm transition-all duration-700"
                    style={{ height: `${Math.max(8, height)}%` }}
                  />
                  <span className="text-[6px] text-emerald-500 font-extrabold uppercase mt-1">+{ (i + 1) * 6 }h</span>
                </div>
              );
            })}
         </div>
      </div>

      {/* No Predictions Available State */}
      {!pred && mlStatus?.ml_available && stormWind > 0 && (
        <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/20 p-6 text-center text-sm text-zinc-500">
          <Brain size={24} className="mx-auto mb-3 text-indigo-500 opacity-60 animate-pulse" />
          <div className="mb-2 font-semibold text-zinc-400">Synchronizing with GEE Datasets...</div>
          <div className="text-[10px] text-zinc-600 mb-4 max-w-[200px] mx-auto uppercase tracking-tighter">
            Waiting for sufficient environmental context to initialize AI forecasting window
          </div>
          <button
            onClick={isPlaying ? pause : play}
            className={`px-5 py-2 rounded-full text-xs font-black uppercase transition-all tracking-widest inline-flex items-center gap-2 mx-auto shadow-lg hover:scale-105 active:scale-95 ${
              isPlaying 
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/40' 
                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/40 shadow-emerald-500/10'
            }`}
          >
            {isPlaying ? <><Pause size={14} /> Pause Stream</> : <><Play size={14} /> Resume Evolution</>}
          </button>
        </div>
      )}

      {!pred && !mlStatus?.ml_available && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 text-center text-sm text-zinc-500">
          <AlertTriangle size={20} className="mx-auto mb-2 text-red-500 opacity-60" />
          <div className="text-zinc-400 font-bold mb-1">ML Backend Disconnected</div>
          <p className="text-[10px] text-zinc-600">
            Environment check failed: TensorFlow or Model weights missing in <code className="text-red-900/60 italic">backend/ml_service/models/</code>.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Sub-Components ────────────────────────────────────────────── */

function StatusDot({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]' : 'bg-zinc-700'}`} />
      <span className={active ? "text-zinc-300" : "text-zinc-600"}>{label}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = (confidence * 100).toFixed(0);
  const color =
    confidence >= 0.7 ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40' :
    confidence >= 0.4 ? 'text-amber-400 bg-amber-950/40 border-amber-500/40' :
    'text-red-400 bg-red-950/40 border-red-500/40';
  return (
    <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border backdrop-blur-md shadow-lg ${color}`}>
      {pct}% AI Confidence
    </span>
  );
}

function ComparisonRow({
  label,
  parametric,
  ml,
  blended,
  unit,
  lowerIsBetter,
}: {
  label: string;
  parametric: number;
  ml: number;
  blended: number;
  unit: string;
  lowerIsBetter: boolean;
}) {
  const delta = ml - parametric;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="bg-zinc-950/40 rounded-lg p-2.5 border border-zinc-800/30">
      <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-2 border-b border-zinc-800 pb-1">{label}</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[7px] text-zinc-600 uppercase font-black">Holland</div>
          <div className="text-zinc-400 font-mono font-bold">{parametric.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[7px] text-indigo-500 uppercase font-black">LSTM-AI</div>
          <div className="font-mono flex items-center gap-1">
            <span className="text-indigo-300 font-bold">{ml.toFixed(1)}</span>
            {delta !== 0 && (
              <span className={`text-[8px] font-black flex items-center ${better ? 'text-emerald-400' : 'text-amber-400'}`}>
                {better ? <TrendingDown size={8} strokeWidth={3} /> : <TrendingUp size={8} strokeWidth={3} />}
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[7px] text-cyan-500 uppercase font-black tracking-tighter">Sync-Blend</div>
          <div className="text-cyan-400 font-mono font-black italic">{blended.toFixed(1)}</div>
        </div>
      </div>
      <div className="text-[7px] text-zinc-700 mt-1.5 text-right font-bold tracking-widest uppercase">{unit} Intensity</div>
    </div>
  );
}
