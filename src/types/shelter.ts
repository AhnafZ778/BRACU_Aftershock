/**
 * Normalized internal shelter shape.
 * Derived from shelters_demo_capacities_clean.geojson features.
 */
export type ShelterStatus = 'open' | 'full';

export interface NormalizedShelter {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: ShelterStatus;
  capacityTotal: number;
  capacityAvailable: number;
  isPlaceholder: boolean;
  raw: Record<string, unknown>;
}

/** Raw GeoJSON properties from shelters_demo_capacities_clean.geojson */
export interface RawShelterProperties {
  id: string;
  osm_id: string;
  name: string;
  category: string;
  capacity_total: number;
  capacity_available: number;
  status: string;
  name_was_generated: boolean;
  capacity_is_placeholder: boolean;
  source_file: string;
  raw_properties: Record<string, unknown>;
}

/**
 * Status color map — open = green, full = red, fallback = gray.
 */
export const SHELTER_STATUS_COLORS: Record<string, string> = {
  open: '#22c55e',
  full: '#ef4444',
};

export const SHELTER_FALLBACK_COLOR = '#6b7280';

export function getShelterColor(status: string): string {
  return SHELTER_STATUS_COLORS[status] ?? SHELTER_FALLBACK_COLOR;
}

/**
 * Normalize a GeoJSON feature into the clean internal shape.
 */
export function normalizeShelter(
  props: RawShelterProperties,
  coords: [number, number],
): NormalizedShelter {
  const [lng, lat] = coords;
  return {
    id: props.id,
    name: props.name || 'Unnamed Shelter',
    lat,
    lon: lng,
    status: (props.status === 'open' || props.status === 'full')
      ? props.status
      : 'open',
    capacityTotal: props.capacity_total ?? 0,
    capacityAvailable: props.capacity_available ?? 0,
    isPlaceholder: props.capacity_is_placeholder ?? false,
    raw: props as unknown as Record<string, unknown>,
  };
}
