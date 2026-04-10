import { useCallback, useEffect, useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { VisualizationToggle } from '../Map/VisualizationToggle';
import { scenarioGenerateUrl, scenarioListUrl, scenarioPresetsUrl, simulationEventUrl } from '../../config/api';
import { useCopilotStore } from '../../store/useCopilotStore';

interface SimulationPanelProps {
  embedded?: boolean;
}

type ControlledPreset = {
  preset_id: string;
  name: string;
  description: string;
  confidence_tier?: string;
  profile?: {
    season_bucket?: string;
    genesis_region?: string;
    target_intensity_class?: string;
    landfall_bias?: string;
    speed_profile_bias?: string;
    recurvature_bias?: string;
  };
};

function deriveCyclonePhaseLabel(phase?: string, hourOffset?: number) {
  const normalized = (phase || '').toLowerCase();
  if (normalized.includes('landfall')) return 'Landfall';
  if (normalized.includes('post')) return 'Post-landfall';
  if (normalized.includes('intens')) return 'Intensification';
  if (typeof hourOffset === 'number') {
    if (hourOffset <= -18) return 'Formation';
    if (hourOffset <= -6) return 'Intensification';
    if (hourOffset <= 0) return 'Pre-landfall';
    if (hourOffset <= 6) return 'Landfall';
    return 'Post-landfall';
  }
  return 'Formation';
}

export function SimulationPanel({ embedded = false }: SimulationPanelProps) {
  const isLoaded = useSimulationStore(s => s.isLoaded);
  const isPlaying = useSimulationStore(s => s.isPlaying);
  const play = useSimulationStore(s => s.play);
  const pause = useSimulationStore(s => s.pause);
  const {
    currentStep, totalSteps, timeline, eventName,
    zoneStatuses, pendingApprovals, buzzerActive,
    reset, setStep, approveZone, loadTimeline
  } = useSimulationStore();
  const setCopilotEventId = useCopilotStore((s) => s.setEventId);

  const eventIdFromUrl = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('event_id') || params.get('event') || 'sidr_2007';
  })();

  const [activeEventId, setActiveEventId] = useState(eventIdFromUrl);
  const [scenarioSeed, setScenarioSeed] = useState('');
  const [seasonBucket, setSeasonBucket] = useState('post_monsoon');
  const [genesisRegion, setGenesisRegion] = useState('south_central_bob');
  const [intensityClass, setIntensityClass] = useState('very_severe');
  const [landfallBias, setLandfallBias] = useState('east');
  const [speedProfileBias, setSpeedProfileBias] = useState('normal');
  const [recurvatureBias, setRecurvatureBias] = useState('normal');
  const [controlledPresets, setControlledPresets] = useState<ControlledPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [recentScenarios, setRecentScenarios] = useState<string[]>([]);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [useAdvancedOverrides, setUseAdvancedOverrides] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  const loadEvent = useCallback(async (eventId: string) => {
    try {
      const backendRes = await fetch(simulationEventUrl(eventId));
      if (backendRes.ok) {
        const data = await backendRes.json();
        if (!data.error) {
          loadTimeline(data);
          setCopilotEventId(data.event_id || eventId);
          setActiveEventId(data.event_id || eventId);
          return;
        }
      }

      const localCandidates = [
        `/replay_${eventId}_v4.json`,
        `/replay_${eventId}.json`,
        '/replay_sidr_2007.json',
      ];

      for (const path of localCandidates) {
        const res = await fetch(path);
        if (!res.ok) continue;
        const data = await res.json();
        loadTimeline(data);
        setCopilotEventId(data.event_id || eventId);
        setActiveEventId(data.event_id || eventId);
        return;
      }

      throw new Error(`Unable to load simulation for ${eventId}`);
    } catch (err) {
      console.error('Failed to load simulation:', err);
      throw err;
    }
  }, [loadTimeline, setCopilotEventId]);

  // Load initial event if not already loaded
  useEffect(() => {
    if (!isLoaded) {
      loadEvent(eventIdFromUrl).catch(() => undefined);
    }
  }, [isLoaded, eventIdFromUrl, loadEvent]);

  useEffect(() => {
    fetch(scenarioPresetsUrl())
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load controlled presets');
        return res.json();
      })
      .then((data) => {
        const presets = Array.isArray(data.items) ? data.items as ControlledPreset[] : [];
        setControlledPresets(presets);
        if (presets.length > 0) {
          setSelectedPresetId((prev) => prev || String(presets[0].preset_id || ''));
        }
      })
      .catch(() => {
        setControlledPresets([]);
      });

    fetch(scenarioListUrl())
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load scenarios');
        return res.json();
      })
      .then((data) => {
        const ids = (data.items || []).map((item: any) => String(item.scenario_id)).filter(Boolean);
        setRecentScenarios(ids.slice(0, 12));
      })
      .catch(() => {
        setRecentScenarios([]);
      });
  }, []);

  useEffect(() => {
    const preset = controlledPresets.find((item) => item.preset_id === selectedPresetId);
    const p = preset?.profile;
    if (!p) return;
    setSeasonBucket(p.season_bucket || 'post_monsoon');
    setGenesisRegion(p.genesis_region || 'south_central_bob');
    setIntensityClass(p.target_intensity_class || 'very_severe');
    setLandfallBias(p.landfall_bias || 'east');
    setSpeedProfileBias(p.speed_profile_bias || 'normal');
    setRecurvatureBias(p.recurvature_bias || 'normal');
  }, [controlledPresets, selectedPresetId]);

  const onGenerateScenario = async () => {
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      const seed = scenarioSeed.trim() || String(Date.now());
      const body: Record<string, unknown> = {};

      if (!useAdvancedOverrides && selectedPresetId) {
        body.preset_id = selectedPresetId;
      } else {
        body.seed = seed;
        body.profile = {
          season_bucket: seasonBucket,
          genesis_region: genesisRegion,
          target_intensity_class: intensityClass,
          landfall_bias: landfallBias,
          speed_profile_bias: speedProfileBias,
          recurvature_bias: recurvatureBias,
        };
      }

      const res = await fetch(scenarioGenerateUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Scenario generation failed');
      const data = await res.json();
      if (data.error) throw new Error(String(data.error));

      const scenarioId = String(data.scenario_id || '');
      if (!scenarioId) throw new Error('Scenario id missing in response');

      setRecentScenarios((prev) => [scenarioId, ...prev.filter((id) => id !== scenarioId)].slice(0, 12));
      await loadEvent(scenarioId);
    } catch (err: any) {
      setScenarioError(err?.message || 'Failed to generate scenario');
    } finally {
      setScenarioBusy(false);
    }
  };

  const onSelectScenario = async (scenarioId: string) => {
    if (!scenarioId) return;
    setScenarioError(null);
    try {
      await loadEvent(scenarioId);
    } catch {
      setScenarioError(`Could not load scenario ${scenarioId}`);
    }
  };

  // Standalone rendering is deprecated; simulation UI should only appear inside RightPanel tabs.
  if (!embedded) return null;

  if (!isLoaded || timeline.length === 0) {
    return (
      <div className="h-full w-full bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
        Loading simulation timeline...
      </div>
    );
  }

  const stepData = timeline[currentStep];
  const cyclonePhase = deriveCyclonePhaseLabel(stepData.phase, stepData.hour_offset);

  return (
    <div className="h-full w-full bg-zinc-950 text-zinc-300 overflow-y-auto p-4">
      
      {/* Header & Controls */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
            <span className="text-xl">🌪️</span> {eventName}
          </h2>
          <div className="text-xs text-ops-text-muted mt-1 font-mono">
            Event: {activeEventId}
            <span className="mx-2 text-zinc-600">|</span>
            {stepData.timestamp ? new Date(stepData.timestamp).toLocaleString('en-US', { 
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            }) : 'Historical Data'} 
            {stepData.hour_offset !== undefined && (
              <span className="ml-2 text-purple-400">T{stepData.hour_offset >= 0 ? '+' : ''}{stepData.hour_offset}h</span>
            )}
          </div>
          <div className="mt-2 inline-flex rounded border border-cyan-500/40 bg-cyan-900/20 px-2 py-1 text-[11px] text-cyan-200">
            Cyclone phase: {cyclonePhase}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded border border-white/10 bg-zinc-900/70 p-3">
        <button
          type="button"
          onClick={() => setIsGeneratorOpen((prev) => !prev)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="text-[10px] uppercase tracking-wider text-ops-text-muted font-bold">Generate Cyclone</div>
          <span className="text-xs text-zinc-400">{isGeneratorOpen ? '▾' : '▸'}</span>
        </button>

        {isGeneratorOpen && (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-ops-text-muted font-bold">
              Controlled Scenario Presets
            </div>
            <div className="grid gap-2 text-xs">
              {controlledPresets.map((preset) => {
                const selected = selectedPresetId === preset.preset_id;
                return (
                  <button
                    key={preset.preset_id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(preset.preset_id);
                      setUseAdvancedOverrides(false);
                    }}
                    className={`rounded border px-2 py-2 text-left ${selected ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500'}`}
                  >
                    <p className="text-xs font-semibold">{preset.name}</p>
                    <p className="text-[11px] text-zinc-400">{preset.description}</p>
                    {preset.confidence_tier && (
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-cyan-300">Confidence: {preset.confidence_tier}</p>
                    )}
                  </button>
                );
              })}
              {controlledPresets.length === 0 && (
                <div className="rounded border border-zinc-700 bg-zinc-900/40 px-2 py-2 text-[11px] text-zinc-400">
                  Controlled presets unavailable. Falling back to advanced manual profile mode.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <input
                value={scenarioSeed}
                onChange={(e) => setScenarioSeed(e.target.value)}
                placeholder="Optional seed"
                className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200"
              />
              <button
                type="button"
                onClick={onGenerateScenario}
                disabled={scenarioBusy}
                className="rounded bg-cyan-700/70 hover:bg-cyan-600/80 disabled:opacity-60 px-2 py-1 font-semibold"
              >
                {scenarioBusy ? 'Generating...' : useAdvancedOverrides || !selectedPresetId ? 'Generate Advanced Scenario' : 'Generate Preset Scenario'}
              </button>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-zinc-300">
              <input
                type="checkbox"
                checked={useAdvancedOverrides}
                onChange={(e) => setUseAdvancedOverrides(e.target.checked)}
                className="accent-cyan-500"
              />
              Enable advanced manual overrides (expert mode)
            </label>

            <details className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-xs text-zinc-400">
              <summary className="cursor-pointer select-none text-zinc-300">Advanced parameters</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={seasonBucket} onChange={(e) => setSeasonBucket(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="pre_monsoon">Pre-Monsoon</option>
                  <option value="monsoon">Monsoon</option>
                  <option value="post_monsoon">Post-Monsoon</option>
                </select>
                <select value={genesisRegion} onChange={(e) => setGenesisRegion(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="south_central_bob">South-Central BoB</option>
                  <option value="southeast_bob">Southeast BoB</option>
                  <option value="east_central_bob">East-Central BoB</option>
                  <option value="northwest_bob">Northwest BoB</option>
                </select>

                <select value={intensityClass} onChange={(e) => setIntensityClass(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                  <option value="very_severe">Very Severe</option>
                  <option value="super">Super</option>
                </select>
                <select value={landfallBias} onChange={(e) => setLandfallBias(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="west">West</option>
                  <option value="central">Central</option>
                  <option value="east">East</option>
                </select>

                <select value={speedProfileBias} onChange={(e) => setSpeedProfileBias(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="slower">Slower Motion</option>
                  <option value="normal">Normal Motion</option>
                  <option value="faster">Faster Motion</option>
                </select>
                <select value={recurvatureBias} onChange={(e) => setRecurvatureBias(e.target.value)} className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200">
                  <option value="low">Low Recurvature</option>
                  <option value="normal">Normal Recurvature</option>
                  <option value="high">High Recurvature</option>
                </select>
              </div>
            </details>

            <div className="flex items-center gap-2 text-xs">
              <label className="text-zinc-400">Recent</label>
              <select
                defaultValue=""
                onChange={(e) => onSelectScenario(e.target.value)}
                className="flex-1 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-zinc-200"
              >
                <option value="">Select generated scenario</option>
                {recentScenarios.map((scenarioId) => (
                  <option key={scenarioId} value={scenarioId}>{scenarioId}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadEvent('sidr_2007').catch(() => undefined)}
                className="rounded bg-zinc-700/70 hover:bg-zinc-600/80 px-2 py-1"
              >
                Load Sidr
              </button>
            </div>
            {scenarioError && <div className="text-[11px] text-rose-400">{scenarioError}</div>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-5">
        <button 
          onClick={isPlaying ? pause : play}
          className={`flex-1 py-1.5 rounded text-xs font-bold uppercase transition-colors ${
            isPlaying ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
          }`}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button 
          onClick={reset}
          className="px-3 py-1.5 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-700 text-xs font-bold uppercase transition-colors"
        >
          ⏮ Reset
        </button>
      </div>

      <div className="mb-5">
        <div className="flex justify-between text-[10px] text-ops-text-muted uppercase mb-1">
          <span>{timeline[0].phase}</span>
          <span className="font-bold text-red-400">{stepData.phase}</span>
          <span>{timeline[timeline.length - 1].phase}</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max={totalSteps - 1} 
          value={currentStep}
          onChange={(e) => setStep(parseInt(e.target.value))}
          className="w-full accent-purple-500"
        />
      </div>

      {/* Cyclone Visualizer Mode */}
      <h3 className="text-[10px] uppercase tracking-wider text-ops-text-muted font-bold mb-2">
        Map Visualization Mode
      </h3>
      <VisualizationToggle />

      {/* Dynamic Threat Escalation Statuses */}
      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
        <h3 className="text-[10px] uppercase tracking-wider text-ops-text-muted font-bold border-b border-white/10 pb-1">
          Zone Status (Escalation Protocol)
        </h3>
        
        {(stepData.zones || stepData.localities || []).map((zoneItem: any) => {
          const levelKey = zoneItem.level || zoneItem.code || zoneItem.name;
          const status = zoneStatuses[levelKey] || 'SAFE';
          const isPending = pendingApprovals[levelKey] || false;
          const isBuzzing = buzzerActive[levelKey] || false;
          
          let statusStyle = "bg-slate-800/50 text-slate-400 border-slate-700";
          if (status === 'CRITICAL') statusStyle = "bg-red-900/20 text-red-500 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]";
          if (status === 'WATCH') statusStyle = "bg-yellow-900/20 text-yellow-500 border-yellow-500/50";

          return (
            <div key={levelKey} className={`p-3 rounded-lg border ${statusStyle} transition-all duration-300 relative overflow-hidden`}>
              
              {/* Background Flash Effect */}
              {isBuzzing && <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />}
              
              <div className="flex justify-between items-start mb-2 relative z-10">
                <span className="text-xs font-bold">{zoneItem.zone || zoneItem.name}</span>
                <span className={`text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded ${
                  status === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' : 
                  status === 'WATCH' ? 'bg-yellow-500 text-black' : 
                  'bg-slate-700 text-slate-300'
                }`}>
                  {status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] relative z-10">
                {zoneItem.wind_kmh !== undefined ? (
                  <>
                    <div>Wind: <span className="font-mono text-white">{zoneItem.wind_kmh} km/h</span></div>
                    <div>Rain: <span className="font-mono text-white">{zoneItem.rain_mm} mm/h</span></div>
                    <div>Flood Risk: <span className={zoneItem.flood_risk > 75 ? 'text-red-400 font-bold' : 'text-white'}>{zoneItem.flood_risk}%</span></div>
                    <div>Stations Offline: <span className={zoneItem.stations_offline > 0 ? 'text-orange-400' : 'text-slate-400'}>{zoneItem.stations_offline}/{zoneItem.stations_total}</span></div>
                  </>
                ) : (
                  <>
                    <div>Live DZI: <span className={(zoneItem.live_dzi || 0) > 75 ? 'text-red-400 font-bold' : 'text-white'}>{Math.round(zoneItem.live_dzi || 0)}/100</span></div>
                    <div>Max Wind: <span className="font-mono text-white">{zoneItem.wind_max_kmh} km/h</span></div>
                    <div>Total Rain: <span className="font-mono text-white">{zoneItem.rain_mm.toFixed(1)} mm</span></div>
                    <div>Peak Surge: <span className="font-mono text-white">{zoneItem.surge_m.toFixed(2)} m</span></div>
                  </>
                )}
              </div>

              {/* Station Master Interaction */}
              {isPending && (
                <div className="mt-3 pt-2 border-t border-yellow-500/30 relative z-10">
                  <div className="text-[10px] text-yellow-500/80 mb-1.5 flex items-center justify-between">
                    <span>⚠️ Station Master Action Required</span>
                  </div>
                  <button 
                    onClick={() => approveZone(levelKey)}
                    className="w-full py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs rounded transition-colors shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                  >
                    🔔 APPROVE BUZZER
                  </button>
                </div>
              )}
              
              {isBuzzing && (
                <div className="mt-2 text-[10px] font-bold text-red-500 flex items-center gap-1 relative z-10">
                  <span className="buzzer-active inline-block">🔔</span> BUZZERS ACTIVE (OVERRIDE)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
