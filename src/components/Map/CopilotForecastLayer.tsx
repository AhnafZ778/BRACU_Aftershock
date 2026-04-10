import { CircleMarker, Polyline, Popup, Tooltip } from 'react-leaflet';
import { useCopilotStore } from '../../store/useCopilotStore';
import { useSimulationStore } from '../../store/useSimulationStore';

const BRANCH_COLORS: Record<string, string> = {
  baseline: '#22d3ee',
  east_drift: '#818cf8',
  west_drift: '#f59e0b',
  slower_intense: '#ef4444',
  faster_weaker: '#34d399',
};

export function CopilotForecastLayer() {
  const data = useCopilotStore((s) => s.data);
  const selectedBranchId = useCopilotStore((s) => s.selectedBranchId);
  const fetchedStepIndex = useCopilotStore((s) => s.fetchedStepIndex);
  const currentStep = useSimulationStore((s) => s.currentStep);
  const activeBranchId = selectedBranchId ?? data?.selected_branch_id;

  if (!data || data.forecast_branches.length === 0 || fetchedStepIndex !== currentStep) {
    return null;
  }

  return (
    <>
      {data.forecast_branches.map((branch) => {
        const color = BRANCH_COLORS[branch.id] || '#22d3ee';
        const isSelected = activeBranchId === branch.id;

        // Use positions directly from branch points.
        // The backend now prepends the storm's current position (hour_offset=0)
        // so the polyline naturally starts from the storm icon.
        const positions = branch.points.map((p) => [p.lat, p.lon] as [number, number]);
        if (positions.length < 2) return null;

        return (
          <Polyline
            key={branch.id}
            positions={positions}
            pathOptions={{
              color,
              weight: isSelected ? 4 : 2,
              opacity: isSelected ? 0.95 : 0.55,
              dashArray: isSelected ? undefined : '6 6',
            }}
          >
            <Tooltip sticky>{`${branch.label} (${Math.round(branch.confidence * 100)}%)`}</Tooltip>
          </Polyline>
        );
      })}

      {/* Forecast endpoint markers for each branch showing hour offsets */}
      {data.forecast_branches.map((branch) => {
        const color = BRANCH_COLORS[branch.id] || '#22d3ee';
        const isSelected = activeBranchId === branch.id;
        // Show markers at key time intervals (skip the origin point at hour_offset=0)
        const futurePoints = branch.points.filter((p) => p.hour_offset > 0);
        if (!isSelected || futurePoints.length === 0) return null;

        return futurePoints.map((p, i) => (
          <CircleMarker
            key={`${branch.id}-dot-${i}`}
            center={[p.lat, p.lon]}
            radius={i === futurePoints.length - 1 ? 6 : 3}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: i === futurePoints.length - 1 ? 0.9 : 0.6,
              weight: 1,
            }}
          >
            <Tooltip direction="right" offset={[8, 0]}>
              <span className="text-xs">
                T+{p.hour_offset}h · {Math.round(p.wind_kt)}kt
              </span>
            </Tooltip>
          </CircleMarker>
        ));
      })}

      {/* Selected branch endpoint with popup */}
      {(() => {
        const selected = data.forecast_branches.find((b) => b.id === activeBranchId);
        if (!selected || selected.points.length === 0) return null;
        const end = selected.points[selected.points.length - 1];
        if (end.hour_offset === 0) return null; // Don't show if only origin
        return (
          <CircleMarker
            center={[end.lat, end.lon]}
            radius={8}
            pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div className="text-sm font-semibold">{selected.label}</div>
              <div className="text-xs">Landfall window: {selected.landfall_window}</div>
              <div className="text-xs mt-1">Wind: {Math.round(end.wind_kt)}kt at T+{end.hour_offset}h</div>
            </Popup>
          </CircleMarker>
        );
      })()}
    </>
  );
}
