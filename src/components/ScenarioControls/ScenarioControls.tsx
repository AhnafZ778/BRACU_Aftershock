import { useEffect, useState } from 'react';
import { useScenarioStore } from '../../store/useScenarioStore';
import { RefreshCw, Wind, Waves, Mountain, Flame, Activity } from 'lucide-react';

export function ScenarioControls() {
  const { liveEvents, fetchLiveThreats, lastRefreshTime, isCalculating } = useScenarioStore();
  const [countdown, setCountdown] = useState(300); // 5 minutes

  // Auto-refresh logic
  useEffect(() => {
    fetchLiveThreats();
    const interval = setInterval(() => {
      fetchLiveThreats();
      setCountdown(300);
    }, 300000); // 5 minutes

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [fetchLiveThreats]);

  // Derive Stats
  const storms = liveEvents.filter(e => e.category === 'severeStorms').length;
  const floods = liveEvents.filter(e => e.category === 'floods').length;
  const landslides = liveEvents.filter(e => e.category === 'landslides').length;
  const wildfires = liveEvents.filter(e => e.category === 'wildfires').length;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </div>
          <span className="text-sm font-bold text-white uppercase tracking-wider">Live System</span>
        </div>
        <div className="text-xs text-zinc-400 flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${isCalculating ? 'animate-spin' : ''}`} />
          {formatTime(countdown)}
        </div>
      </div>

      {/* Global Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Wind className="w-5 h-5 text-cyan-400" />} label="Storms" count={storms} />
        <StatCard icon={<Waves className="w-5 h-5 text-green-400" />} label="Floods" count={floods} />
        <StatCard icon={<Mountain className="w-5 h-5 text-yellow-500" />} label="Landslides" count={landslides} />
        <StatCard icon={<Flame className="w-5 h-5 text-red-500" />} label="Wildfires" count={wildfires} />
      </div>

      {/* Manual Refresh */}
      <button 
        onClick={() => {
          fetchLiveThreats();
          setCountdown(300);
        }}
        disabled={isCalculating}
        className="w-full flex items-center justify-center gap-2 py-2 mt-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700 disabled:opacity-50"
      >
        <Activity className="w-4 h-4" />
        <span className="text-sm font-semibold">Force Data Sync</span>
      </button>

      {/* Timestamp */}
      {lastRefreshTime && (
        <div className="text-center mt-2 text-[10px] text-zinc-600">
          Last sync: {lastRefreshTime.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, count }: { icon: React.ReactNode, label: string, count: number }) {
  return (
    <div className="bg-ops-bg border border-ops-border rounded-lg p-3 flex flex-col items-center justify-center hover:border-accent-primary/50 transition-colors">
      <div className="mb-1">{icon}</div>
      <div className="text-xl font-bold text-white">{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-ops-text-muted">{label}</div>
    </div>
  );
}
