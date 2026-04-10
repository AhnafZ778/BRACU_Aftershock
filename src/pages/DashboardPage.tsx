import { useEffect } from 'react';
import { MapView } from '../components/Map/MapView';
import { MapLegend } from '../components/Legend/MapLegend';
import { useTakeLayers } from '../hooks/useTakeLayers';
import { startSimulation, stopSimulation } from '../simulation/employeeSimulator';

export function DashboardPage({ isVisible = true }: { isVisible?: boolean }) {
  const take = useTakeLayers();

  // Start employee simulation on mount, stop on unmount
  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, []);

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Full-width map */}
      <div className="flex-1 relative min-w-0">
        <MapView
          isVisible={isVisible}
          takeDefs={take.defs}
          takeActiveIds={take.activeIds}
          takeFetchGeoJson={take.fetchGeoJson}
        />
      </div>

      {/* Floating sidebar — overlays the map on the left edge */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[500] pointer-events-none">
        <MapLegend
          takeDefs={take.defs}
          takeActiveIds={take.activeIds}
          onTakeToggle={take.toggle}
          takeLoading={take.loading}
        />
      </div>
    </div>
  );
}
