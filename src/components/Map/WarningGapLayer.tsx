import { CircleMarker, Tooltip } from 'react-leaflet';
import { useCopilotStore } from '../../store/useCopilotStore';

const GAP_COLOR: Record<string, string> = {
  likely_reached: '#34d399',
  partial_reach: '#f59e0b',
  unverified_gap: '#ef4444',
};

export function WarningGapLayer() {
  const data = useCopilotStore((s) => s.data);
  if (!data || data.top_localities.length === 0) return null;

  return (
    <>
      {data.top_localities.map((loc) => {
        if (!loc.lat || !loc.lon) return null;
        const color = GAP_COLOR[loc.warning_gap_band] || '#f59e0b';
        return (
          <CircleMarker
            key={loc.locality_code}
            center={[loc.lat, loc.lon]}
            radius={Math.max(5, Math.min(12, loc.warning_gap_score / 8))}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.3, weight: 2 }}
          >
            <Tooltip direction="top">
              <div className="text-xs">
                <div className="font-semibold">{loc.locality_name}</div>
                <div>Current risk: {loc.current_risk}</div>
                <div>Projected risk: {loc.projected_risk}</div>
                <div>Warning gap: {loc.warning_gap_score} ({loc.warning_gap_band})</div>
                <div className="mt-1 text-zinc-300">{loc.warning_gap_rationale}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
