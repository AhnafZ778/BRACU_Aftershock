import { useScenarioStore } from '../../store/useScenarioStore';
import { useSimulationStore } from '../../store/useSimulationStore';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-severity-critical',
  CRITICAL: 'bg-severity-critical',
  high: 'bg-severity-high',
  DANGER: 'bg-severity-high',
  moderate: 'bg-severity-moderate',
  WARNING: 'bg-severity-moderate',
  low: 'bg-severity-low',
  safe: 'bg-severity-safe',
  SAFE: 'bg-severity-safe',
  NORMAL: 'bg-severity-safe',
};

export function RankingList() {
  const { localities: scenarioLocalities, selectedLocalityId, setSelectedLocalityId, isCalculating } = useScenarioStore();
  const timeline = useSimulationStore(s => s.timeline);
  const currentStep = useSimulationStore(s => s.currentStep);
  
  const currentSimStep = timeline[currentStep];
  const isSimActive = timeline.length > 0 && currentSimStep;
  
  // Use simulation localities if simulation is active, else scenario localities
  let displayLocalities = scenarioLocalities;
  
  if (isSimActive && currentSimStep.localities) {
    displayLocalities = [...currentSimStep.localities]
      .sort((a, b) => ((b as any).risk_index || 0) - ((a as any).risk_index || 0))
      .map((loc: any) => {
        let normalizedSeverity = 'safe';
        if (loc.severity === 'CRITICAL') normalizedSeverity = 'critical';
        else if (loc.severity === 'DANGER') normalizedSeverity = 'high';
        else if (loc.severity === 'WARNING') normalizedSeverity = 'moderate';
        else if (loc.severity === 'NORMAL') normalizedSeverity = 'safe';
        
        return {
          id: loc.district,
          name: loc.district,
          severity: normalizedSeverity as any, // Cast to any to safely skip TS check for SeverityLevel
          score: Math.round((loc.risk_index || 0) * 100),
          reason: `Wind: ${loc.wind_max_kmh} km/h, Surge: ${loc.surge_m.toFixed(1)}m, Rain: ${loc.rain_mm.toFixed(0)}mm`,
          metrics: loc.metrics ? {
            population: String((loc.metrics as any).population || 0),
            sheltersNearby: String((loc.metrics as any).sheltersNearby || 0),
            healthFacilities: String((loc.metrics as any).healthFacilities || 0),
            roadAccess: (loc.metrics as any).roadAccess || 'Unknown',
          } : {
            population: '0',
            sheltersNearby: '0',
            healthFacilities: '0',
            roadAccess: 'Unknown',
          },
          breakdown: {
            hazardSeverity: Math.round((loc.risk_index || 0) * 100),
            exposedPopulation: 0,
            assetExposure: 0,
            shelterGap: 0,
            vulnerability: 0
          },
          recommendedAction: 'Standby for further info'
        };
      });
  }

  return (
    <div className={`space-y-2 transition-opacity duration-300 ${isCalculating ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
      {displayLocalities.map((loc, i) => {
        const isSelected = loc.id === selectedLocalityId;
        return (
          <button
            key={loc.id}
            onClick={() => setSelectedLocalityId(loc.id)}
            className={`w-full text-left rounded-lg p-3 border transition-colors group ${
              isSelected 
                ? 'bg-ops-surface border-accent-primary/50 shadow-[0_0_10px_rgba(56,189,248,0.1)]' 
                : 'bg-ops-bg border-ops-border hover:border-accent-primary/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-ops-text-muted w-4">#{i + 1}</span>
              <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-accent-primary' : 'text-ops-text group-hover:text-accent-primary/80'}`}>
                {loc.name}
              </span>
              <span className={`ml-auto w-2 h-2 rounded-full ${SEVERITY_COLORS[loc.severity]}`} />
            </div>
            <div className="flex items-center gap-2 pl-6">
              <span className={`text-xs font-mono ${isSelected ? 'text-ops-text' : 'text-ops-text-muted'}`}>
                Score: {loc.score}
              </span>
              <span className="text-[10px] text-ops-text-muted/70 truncate" title={loc.reason}>
                — {loc.reason}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
