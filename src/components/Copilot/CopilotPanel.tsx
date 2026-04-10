import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cpu, ShieldAlert, Sparkles } from 'lucide-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useCopilotStore } from '../../store/useCopilotStore';

const MIN_PREDICT_DELAY_MS = 3000;
const MAX_PREDICT_DELAY_MS = 15000;

function estimateDataFactorCount(step: any): number {
  if (!step) return 120;

  const localityImpactsCount = step.locality_impacts ? Object.keys(step.locality_impacts).length : 0;
  const localitiesCount = Array.isArray(step.localities) ? step.localities.length : 0;
  const zonesCount = Array.isArray(step.zones) ? step.zones.length : 0;

  // Weighted factor budget to mimic heavier processing for dense steps.
  const total = localityImpactsCount * 8 + localitiesCount * 4 + zonesCount * 15;
  return Math.max(60, total);
}

function getRandomPredictDelayMs(dataFactorCount: number): number {
  const normalized = Math.max(0, Math.min(1, dataFactorCount / 1200));
  const adaptiveMin = MIN_PREDICT_DELAY_MS + normalized * 4000; // 3s -> 7s
  const adaptiveMax = 9000 + normalized * 6000; // 9s -> 15s
  const sampled = adaptiveMin + Math.random() * (adaptiveMax - adaptiveMin);
  return Math.max(MIN_PREDICT_DELAY_MS, Math.min(MAX_PREDICT_DELAY_MS, Math.round(sampled)));
}

const riskTone: Record<string, string> = {
  critical: 'text-red-300 border-red-500/40 bg-red-900/20',
  high: 'text-orange-300 border-orange-500/40 bg-orange-900/20',
  moderate: 'text-amber-300 border-amber-500/40 bg-amber-900/20',
  low: 'text-emerald-300 border-emerald-500/40 bg-emerald-900/20',
};

const gapTone: Record<string, string> = {
  likely_reached: 'text-emerald-300 border-emerald-500/40 bg-emerald-900/15',
  partial_reach: 'text-amber-300 border-amber-500/40 bg-amber-900/15',
  unverified_gap: 'text-red-300 border-red-500/40 bg-red-900/15',
};

export function CopilotPanel() {
  const isLoaded = useSimulationStore((s) => s.isLoaded);
  const currentStep = useSimulationStore((s) => s.currentStep);
  const stepData = useSimulationStore((s) => s.timeline[s.currentStep]);
  const data = useCopilotStore((s) => s.data);
  const isLoading = useCopilotStore((s) => s.isLoading);
  const error = useCopilotStore((s) => s.error);
  // selectedBranchId and isSimLoaded mostly unused now due to on-demand fetching
  const setSelectedBranchId = useCopilotStore((s) => s.setSelectedBranchId);
  const fetchedStepIndex = useCopilotStore((s) => s.fetchedStepIndex);
  const fetchState = useCopilotStore((s) => s.fetchState);
  const [predictPhase, setPredictPhase] = useState<'idle' | 'simulating' | 'requesting'>('idle');
  const [simulatedDelayMs, setSimulatedDelayMs] = useState<number>(0);
  const [loadingTick, setLoadingTick] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const predictTimerRef = useRef<number | null>(null);
  const predictStepRef = useRef<number | null>(null);
  const predictStartedAtRef = useRef<number | null>(null);
  const dataFactorCount = useMemo(() => estimateDataFactorCount(stepData), [stepData]);
  const simulatedSeconds = simulatedDelayMs > 0 ? (simulatedDelayMs / 1000).toFixed(1) : '0.0';
  const isPredicting = isLoading || predictPhase === 'simulating' || predictPhase === 'requesting';

  const simulatingMessages = [
    'Triangulating storm vectors and pressure gradients...',
    'Synthesizing locality vulnerability signatures...',
    'Ranking warning-delivery gaps and channel fit...',
  ];
  const requestingMessages = [
    'Fetching trajectory envelopes from the Copilot core...',
    'Validating branch confidence and risk deltas...',
    'Composing operational summary and priority stats...',
  ];
  const loadingMessage =
    predictPhase === 'simulating'
      ? simulatingMessages[loadingTick % simulatingMessages.length]
      : requestingMessages[loadingTick % requestingMessages.length];

  useEffect(() => {
    return () => {
      if (predictTimerRef.current !== null) {
        window.clearTimeout(predictTimerRef.current);
        predictTimerRef.current = null;
      }
      predictStepRef.current = null;
      predictStartedAtRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Cancel an in-flight simulated delay if user jumps to another simulation step.
    if (predictPhase !== 'simulating') return;
    if (predictStepRef.current === currentStep) return;
    if (predictTimerRef.current !== null) {
      window.clearTimeout(predictTimerRef.current);
      predictTimerRef.current = null;
    }
    predictStepRef.current = null;
    predictStartedAtRef.current = null;
    setPredictPhase('idle');
    setSimulatedDelayMs(0);
    setProgressPct(0);
  }, [currentStep, predictPhase]);

  useEffect(() => {
    if (!isPredicting) return;
    const id = window.setInterval(() => setLoadingTick((t) => t + 1), 950);
    return () => window.clearInterval(id);
  }, [isPredicting]);

  useEffect(() => {
    if (!isPredicting) {
      setProgressPct(0);
      return;
    }

    const id = window.setInterval(() => {
      if (predictPhase === 'simulating' && simulatedDelayMs > 0 && predictStartedAtRef.current) {
        const elapsed = Date.now() - predictStartedAtRef.current;
        const simProgress = Math.min(90, Math.round((elapsed / simulatedDelayMs) * 90));
        setProgressPct((p) => (simProgress > p ? simProgress : p));
        return;
      }

      // During request phase, keep moving but reserve completion for actual response.
      setProgressPct((p) => Math.min(98, p + Math.max(0.6, (98 - p) * 0.09)));
    }, 120);

    return () => window.clearInterval(id);
  }, [isPredicting, predictPhase, simulatedDelayMs]);

  const startPrediction = () => {
    if (!isLoaded) return;
    if (predictPhase !== 'idle' || isLoading) return;

    const delayMs = getRandomPredictDelayMs(dataFactorCount);
    setSimulatedDelayMs(delayMs);
    setProgressPct(0);
    setPredictPhase('simulating');
    predictStepRef.current = currentStep;
    predictStartedAtRef.current = Date.now();

    predictTimerRef.current = window.setTimeout(() => {
      predictTimerRef.current = null;
      setPredictPhase('requesting');
      setProgressPct((p) => Math.max(p, 90));
      void fetchState(currentStep).finally(() => {
        setProgressPct(100);
        window.setTimeout(() => {
          predictStepRef.current = null;
          predictStartedAtRef.current = null;
          setPredictPhase('idle');
          setSimulatedDelayMs(0);
          setProgressPct(0);
        }, 220);
      });
    }, delayMs);
  };

  const selectedBranch = data?.forecast_branches.find((b) => b.id === data.selected_branch_id);
  const alternativeBranches = data?.forecast_branches
    .filter((b) => b.id !== data.selected_branch_id)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2) || [];
  const top = data?.top_localities[0];

  const validationTone =
    data?.cap_validation.status === 'valid'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-900/20'
      : data?.cap_validation.status === 'warning'
        ? 'text-amber-300 border-amber-500/40 bg-amber-900/20'
        : 'text-red-300 border-red-500/40 bg-red-900/20';

  const handleSelectBranch = (branchId: string) => {
    setSelectedBranchId(branchId);
    void fetchState(currentStep, { forceRefresh: true });
  };

  const needsPrediction = fetchedStepIndex !== currentStep;

  return (
    <div className="h-full w-full bg-zinc-950 text-zinc-200 overflow-y-auto p-4 space-y-4">
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-3">
        <div className="flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wide font-semibold">
          <Sparkles size={14} />
          Forecast Brief
        </div>
        <p className="mt-2 text-sm leading-snug text-zinc-200">
          {!needsPrediction ? data?.operational_summary : 'Waiting for deterministic scenario computation...'}
        </p>
        {!needsPrediction && selectedBranch && (
          <div className="mt-2 rounded border border-cyan-500/40 bg-cyan-950/25 p-2 text-[11px] text-cyan-100">
            <p className="font-semibold">Branch focus: {selectedBranch.label} • {Math.round(selectedBranch.confidence * 100)}% confidence</p>
            <p className="text-cyan-100/85">{selectedBranch.rationale}</p>
            <p className="text-cyan-100/75">This branch currently drives locality ranking and warning-delivery priorities.</p>
          </div>
        )}

        {!needsPrediction && data && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-zinc-700 bg-zinc-950/70 p-2 text-zinc-300">
              <div className="text-zinc-500">Mode</div>
              <div className="font-semibold text-zinc-100">{data.forecast_mode.replace('_', ' ')}</div>
            </div>
            <div className="rounded border border-zinc-700 bg-zinc-950/70 p-2 text-zinc-300">
              <div className="text-zinc-500">Confidence</div>
              <div className="font-semibold text-zinc-100">{Math.round((data.forecast_confidence || 0) * 100)}%</div>
            </div>
            <div className="rounded border border-zinc-700 bg-zinc-950/70 p-2 text-zinc-300">
              <div className="text-zinc-500">Live Freshness</div>
              <div className="font-semibold text-zinc-100">
                {typeof data.forecast_provenance?.freshness_minutes === 'number'
                  ? `${Math.round(data.forecast_provenance.freshness_minutes)} min`
                  : 'n/a'}
              </div>
            </div>
            <div className="rounded border border-zinc-700 bg-zinc-950/70 p-2 text-zinc-300">
              <div className="text-zinc-500">Obs Sources</div>
              <div className="font-semibold text-zinc-100">{data.forecast_provenance?.source_count ?? 0}</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {isPredicting && (
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-6 text-sm text-cyan-200">
          <div className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/15 blur-2xl animate-pulse"></div>
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-indigo-400/15 blur-2xl animate-pulse"></div>

          <div className="relative z-10 flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/60 border-t-transparent"></div>
              <Sparkles size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-300 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-cyan-300/90 font-semibold">
                <Cpu size={13} className="animate-pulse" />
                Copilot Processing Pipeline
              </div>
              <div className="mt-1 text-sm text-cyan-100">{loadingMessage}</div>
            </div>
          </div>

          <div className="relative z-10 mt-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-cyan-200/90">
              <span>Data factors</span>
              <span className="font-semibold">{dataFactorCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-cyan-200/90">
              <span>Estimated cycle</span>
              <span className="font-semibold">~{simulatedSeconds}s</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-cyan-100/90">
              <Activity size={12} className="animate-pulse" />
              <span>Generating path candidates and locality statistics</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-cyan-100/85">
              <span>Progress</span>
              <span className="font-semibold">{Math.max(1, Math.round(progressPct))}%</span>
            </div>
          </div>

          <div className="relative z-10 mt-4 h-2 w-full overflow-hidden rounded-full bg-cyan-950/70 border border-cyan-700/40">
            <div
              className="h-full bg-gradient-to-r from-cyan-400/60 via-cyan-300/95 to-indigo-300/70"
              style={{ width: `${Math.max(2, progressPct)}%`, transition: 'width 160ms linear' }}
            ></div>
          </div>

          <div className="relative z-10 mt-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-bounce" style={{ animationDelay: '120ms' }}></span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-bounce" style={{ animationDelay: '240ms' }}></span>
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '360ms' }}></span>
            <span className="text-[11px] text-cyan-100/80 ml-1">Analyzing</span>
          </div>
        </div>
      )}

      {needsPrediction && !isLoading && predictPhase === 'idle' && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 pt-8 pb-8 text-center space-y-4">
          <div className="bg-cyan-500/10 p-3 rounded-full border border-cyan-500/20">
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">AI Copilot Standing By</h3>
            <p className="text-sm text-zinc-400 max-w-[260px] mx-auto leading-relaxed">
              Launch path prediction for this step and generate updated trajectory plus locality statistics.
            </p>
          </div>
          <button
            onClick={startPrediction}
            disabled={!isLoaded || predictPhase !== 'idle' || isLoading}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-cyan-600 to-indigo-600 px-6 py-2.5 font-semibold text-white shadow-[0_0_20px_rgba(8,145,178,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(8,145,178,0.5)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100"></div>
            <Sparkles size={16} className="animate-pulse" />
            <span>Predict Path</span>
          </button>
        </div>
      )}

      {!needsPrediction && data && (
        <>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Current vs Projected Risk</div>
            {top ? (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-zinc-700 bg-zinc-950/80 p-2">
                  <div className="text-zinc-500">Current</div>
                  <div className="text-zinc-100 text-lg font-semibold">{top.current_risk}</div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-950/80 p-2">
                  <div className="text-zinc-500">Projected</div>
                  <div className="text-zinc-100 text-lg font-semibold">{top.projected_risk}</div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-950/80 p-2">
                  <div className="text-zinc-500">Delta</div>
                  <div className={`text-lg font-semibold ${top.projected_delta >= 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                    {top.projected_delta >= 0 ? '+' : ''}{top.projected_delta}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">No locality risk available yet.</div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Forecast Branch Selection</div>
            {selectedBranch ? (
              <div className="rounded-lg border border-cyan-500/50 bg-cyan-900/20 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-100">{selectedBranch.label}</span>
                  <span className="text-cyan-300">{Math.round(selectedBranch.confidence * 100)}%</span>
                </div>
                <div className="mt-1 text-xs text-zinc-300">{selectedBranch.landfall_window}</div>
                <div className="mt-1 text-xs text-zinc-400">{selectedBranch.rationale}</div>
              </div>
            ) : null}

            {alternativeBranches.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Alternative branches (de-emphasized)</p>
                {alternativeBranches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch.id)}
                    className="w-full rounded border border-zinc-700 bg-zinc-950/50 px-2 py-1.5 text-left hover:border-zinc-500"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{branch.label}</span>
                      <span className="text-zinc-500">{Math.round(branch.confidence * 100)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Warning Gap Intelligence</div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-2">
                <div className="text-emerald-300 text-lg font-semibold">{data.warning_gap_summary.likely_reached}</div>
                <div className="text-zinc-300">Likely</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-2">
                <div className="text-amber-300 text-lg font-semibold">{data.warning_gap_summary.partial_reach}</div>
                <div className="text-zinc-300">Partial</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-2">
                <div className="text-red-300 text-lg font-semibold">{data.warning_gap_summary.unverified_gap}</div>
                <div className="text-zinc-300">Gap</div>
              </div>
            </div>
            {top && (
              <div className={`mt-2 rounded-lg border p-2 text-xs ${gapTone[top.warning_gap_band] || gapTone.partial_reach}`}>
                <div className="font-semibold">{top.warning_gap_rationale}</div>
                <div className="mt-1 text-zinc-300">Confidence: {Math.round(top.warning_confidence * 100)}% | Gap score: {top.warning_gap_score}</div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Top Localities (Risk + Delivery Gap)</div>
            {data.top_localities.slice(0, 4).map((loc) => (
              <div key={loc.locality_code} className="rounded-lg border border-zinc-700 bg-black/30 p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{loc.locality_name}</div>
                    <div className="text-[11px] text-zinc-500">{loc.district_name}</div>
                  </div>
                  <div className={`text-[10px] px-2 py-0.5 rounded border ${riskTone[loc.risk_band] || riskTone.low}`}>
                    {loc.risk_band.toUpperCase()}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-zinc-700 bg-zinc-900/60 p-1.5">
                    <div className="text-zinc-500">Current Risk</div>
                    <div className="text-zinc-100 font-semibold">{loc.current_risk}</div>
                  </div>
                  <div className="rounded border border-zinc-700 bg-zinc-900/60 p-1.5">
                    <div className="text-zinc-500">Projected Risk</div>
                    <div className="text-zinc-100 font-semibold">{loc.projected_risk}</div>
                  </div>
                </div>
                <div className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] ${gapTone[loc.warning_gap_band] || gapTone.partial_reach}`}>
                  <ShieldAlert size={11} />
                  {loc.warning_gap_band.replace('_', ' ')} | gap {loc.warning_gap_score}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">{loc.warning_gap_rationale}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Action Timeline (Why Now)</div>
            {top ? (
              <div className="space-y-1.5 text-xs">
                {Object.entries(top.action_timeline).map(([k, v]) => (
                  <div key={k} className="rounded border border-zinc-700 bg-zinc-950/80 p-2">
                    <div className="text-cyan-300 font-semibold">{k}</div>
                    <div className="text-zinc-300 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">No action timeline available.</div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Channel Plan</div>
            {top ? (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {top.channel_plan.map((c) => (
                    <span key={c} className="rounded border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-200">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-zinc-400">{top.channel_rationale}</div>
              </>
            ) : (
              <div className="text-xs text-zinc-500">No channel plan available.</div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">CAP Preview</div>
            <div className="space-y-1 text-xs">
              <div><span className="text-zinc-500">Event:</span> {data.cap_alert_preview.event}</div>
              <div><span className="text-zinc-500">Urgency:</span> {data.cap_alert_preview.urgency}</div>
              <div><span className="text-zinc-500">Severity:</span> {data.cap_alert_preview.severity}</div>
              <div><span className="text-zinc-500">Certainty:</span> {data.cap_alert_preview.certainty}</div>
              <div><span className="text-zinc-500">Area:</span> {data.cap_alert_preview.area.join(', ') || 'N/A'}</div>
              <div><span className="text-zinc-500">Channels:</span> {data.cap_alert_preview.channel_plan.join(', ') || 'N/A'}</div>
              <div className="pt-1 text-zinc-300">{data.cap_alert_preview.instructions}</div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Validation Status</div>
            <div className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${validationTone}`}>
              {data.cap_validation.status === 'valid' ? (
                <CheckCircle2 size={13} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={13} className="text-amber-400" />
              )}
              {data.cap_validation.status.toUpperCase()}
            </div>
            {data.cap_validation.issues.length > 0 ? (
              <div className="mt-2 space-y-1">
                {data.cap_validation.issues.map((issue) => (
                  <div key={issue.code} className="rounded border border-zinc-700 bg-zinc-950/80 p-2 text-xs">
                    <div className="text-amber-300 font-semibold">{issue.code}</div>
                    <div className="text-zinc-300">{issue.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-400">No validation issues.</div>
            )}
          </div>

        </>
      )}
    </div>
  );
}
