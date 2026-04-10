import { MapView } from '../components/Map/MapView';

export function DashboardPage({ isVisible = true }: { isVisible?: boolean }) {
  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="flex-1 relative min-w-0">
        <MapView isVisible={isVisible} />
      </div>
    </div>
  );
}
