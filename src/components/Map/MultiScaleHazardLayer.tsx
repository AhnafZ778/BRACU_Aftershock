import { HoneycombLayer } from './HoneycombLayer';

interface MultiScaleHazardLayerProps {
  visible: boolean;
}

export function MultiScaleHazardLayer({ visible }: MultiScaleHazardLayerProps) {
  // The Honeycomb danger zone overlay persists at ALL zoom levels.
  // In life-or-death situations, knowing your danger level is non-negotiable.
  // Users can toggle it off via the map legend if desired.
  return <HoneycombLayer visible={visible} />;
}
