import { MapView } from '../components/Map/MapView';
import { MapLegend } from '../components/Legend/MapLegend';

export function DashboardPage({ isVisible = true }: { isVisible?: boolean }) {
  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Full-width map */}
      <div className="flex-1 relative min-w-0">
        <MapView isVisible={isVisible} />
      </div>

      {/* Floating sidebar — overlays the map on the left edge */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[500] pointer-events-none">
        <MapLegend />
      </div>
    </div>
  );
}
