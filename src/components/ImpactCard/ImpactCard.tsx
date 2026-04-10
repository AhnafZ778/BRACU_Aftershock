import { useScenarioStore } from '../../store/useScenarioStore';
import { useSimulationStore } from '../../store/useSimulationStore';

const SEVERITY_COLORS = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  moderate: 'bg-severity-moderate',
  low: 'bg-severity-low',
  safe: 'bg-severity-safe',
};

export function ImpactCard() {
  const { localities, selectedLocalityId, isCalculating } = useScenarioStore();
  const isSimLoaded = useSimulationStore(s => s.isLoaded);
  const timeline = useSimulationStore(s => s.timeline);
  const currentStep = useSimulationStore(s => s.currentStep);
  
  const isSimActive = isSimLoaded && timeline.length > 0;
  const currentSimStep = isSimActive ? timeline[currentStep] : null;

  let displayLocalities = localities;
  
  if (isSimActive && currentSimStep?.localities) {
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
          severity: normalizedSeverity as any,
          score: Math.round((loc.risk_index || 0) * 100),
          reason: `Wind: ${loc.wind_max_kmh} km/h, Surge: ${loc.surge_m?.toFixed(1) || '0.0'}m, Rain: ${loc.rain_mm?.toFixed(0) || '0'}mm`,
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

  const locality = displayLocalities.find(loc => loc.id === selectedLocalityId) || displayLocalities[0];

  if (!locality) return null;

  const { breakdown, metrics } = locality;

  return (
    <div className={`space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 transition-opacity ${isCalculating ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
      {/* Locality Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-3 h-3 rounded-full ${SEVERITY_COLORS[locality.severity]}`} />
          <span className="text-sm font-semibold text-ops-text">{locality.name}</span>
        </div>
        <p className="text-xs text-ops-text-muted capitalize">
          {locality.severity} • Score: {locality.score}/100
        </p>
      </div>

      {/* Score Breakdown */}
      <div className="bg-ops-bg rounded-lg p-3 border border-ops-border space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-ops-text-muted font-semibold mb-2">
          Score Breakdown
        </p>
        {[
          { label: 'Hazard Severity', value: breakdown.hazardSeverity, weight: '35%', color: 'bg-severity-critical' },
          { label: 'Exposed Population', value: breakdown.exposedPopulation, weight: '25%', color: 'bg-severity-high' },
          { label: 'Asset Exposure', value: breakdown.assetExposure, weight: '20%', color: 'bg-severity-moderate' },
          { label: 'Shelter Gap', value: breakdown.shelterGap, weight: '10%', color: 'bg-accent-teal' },
          { label: 'Vulnerability', value: breakdown.vulnerability, weight: '10%', color: 'bg-accent-primary' },
        ].map(({ label, value, weight, color }) => (
          <div key={label}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-ops-text-muted">{label} <span className="text-[9px] opacity-70">({weight})</span></span>
              <span className="text-ops-text font-mono">{value}</span>
            </div>
            <div className="h-1.5 bg-ops-border rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${color} transition-all duration-500`} 
                style={{ width: `${value}%` }} 
              />
            </div>
          </div>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Population', value: metrics.population },
          { label: 'Shelters Nearby', value: metrics.sheltersNearby },
          { label: 'Health Facilities', value: metrics.healthFacilities },
          { label: 'Road Access', value: metrics.roadAccess },
        ].map(({ label, value }) => (
          <div key={label} className="bg-ops-bg rounded-lg p-2.5 border border-ops-border">
            <p className="text-[10px] text-ops-text-muted">{label}</p>
            <p className="text-sm font-semibold text-ops-text">{value}</p>
          </div>
        ))}
      </div>

      {/* Action Recommendation */}
      <div className={`rounded-lg p-3 border ${
        locality.severity === 'critical' ? 'bg-severity-critical/10 border-severity-critical/20' :
        locality.severity === 'high' ? 'bg-severity-high/10 border-severity-high/20' :
        'bg-ops-bg border-ops-border'
      }`}>
        <p className={`text-xs font-semibold mb-1 ${
          locality.severity === 'critical' ? 'text-severity-critical' :
          locality.severity === 'high' ? 'text-severity-high' :
          'text-ops-text'
        }`}>Recommended Action</p>
        <p className="text-xs text-ops-text-muted">
          {locality.recommendedAction}
        </p>
      </div>
    </div>
  );
}
