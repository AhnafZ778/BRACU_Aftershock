import { useEffect, useMemo } from 'react';
import { Flame, LocateFixed, Radar } from 'lucide-react';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { useAppStore } from '../../store/useAppStore';

const severityColor = (severity?: string) => {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'text-red-300 border-red-500/40 bg-red-500/10';
  if (s === 'high') return 'text-orange-300 border-orange-500/40 bg-orange-500/10';
  return 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10';
};

export function TopHotspotsPanel() {
  const { showTelemetry } = useAppStore();
  const { zones, selectedHotspotId, setSelectedHotspotId } = useTelemetryStore();

  useEffect(() => {
    if (!selectedHotspotId) return;

    const timer = window.setTimeout(() => {
      setSelectedHotspotId(null);
    }, 10_000);

    return () => window.clearTimeout(timer);
  }, [selectedHotspotId, setSelectedHotspotId]);

  const topZones = useMemo(() => {
    const copy = [...(zones || [])];
    copy.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
    return copy.slice(0, 3);
  }, [zones]);

  if (!showTelemetry) return null;

  return (
    <div className="w-[300px] rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-3 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] pointer-events-auto">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-cyan-300" />
          <h3 className="text-[12px] font-semibold tracking-wide text-zinc-100">Top Hotspots</h3>
        </div>
        <span className="text-[10px] text-zinc-400">Live DBSCAN</span>
      </div>

      {topZones.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-zinc-400">
          No active clustered distress hotspots right now.
        </div>
      ) : (
        <div className="space-y-2">
          {topZones.map((zone, idx) => {
            const selected = selectedHotspotId === zone.id;
            return (
              <button
                key={zone.id}
                onClick={() => setSelectedHotspotId(selected ? null : zone.id)}
                className={`w-full rounded-xl border p-2.5 text-left transition-all ${selected ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400">#{idx + 1}</span>
                    <Flame size={12} className="text-red-300" />
                    <span className="text-[11px] font-semibold text-zinc-100">{zone.id}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityColor(zone.severity)}`}>
                    {(zone.severity || 'moderate').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1">
                    <div className="text-zinc-500">Priority</div>
                    <div className="text-zinc-200 font-semibold">{zone.priority_score ?? 0}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1">
                    <div className="text-zinc-500">Agents</div>
                    <div className="text-zinc-200 font-semibold">{zone.agent_count}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1">
                    <div className="text-zinc-500">Radius</div>
                    <div className="text-zinc-200 font-semibold">{zone.radius_km ?? 0}km</div>
                  </div>
                </div>

                <div className="mt-1.5 text-[10px] text-zinc-300 line-clamp-2">
                  {zone.recommended_action || 'Monitor cluster and prepare a rapid response team.'}
                </div>

                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-cyan-300/90">
                  <LocateFixed size={10} />
                  {selected ? 'Focused on map (auto-clear in 10s)' : 'Click to focus map'}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
