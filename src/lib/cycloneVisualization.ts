export interface CycloneVisualFrame {
  lat: number;
  lon: number;
  hour: number;
  rawWindKmh: number;
  visualWindKmh: number;
  distToLandKm: number;
  progress: number;
  categoryLabel: string;
  color: string;
}

type TimelineStep = {
  hour_offset?: number;
  storm_center?: [number, number];
  storm_wind_kt?: number;
  storm_dist2land_km?: number;
  track?: {
    lat?: number;
    lon?: number;
    wind_kmh?: number;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function getColor(windKmh: number): string {
  if (windKmh >= 252) return '#ff0037';
  if (windKmh >= 209) return '#ff3b30';
  if (windKmh >= 178) return '#ff7a00';
  if (windKmh >= 154) return '#ffb300';
  if (windKmh >= 119) return '#ffe066';
  if (windKmh >= 63) return '#e8fffe';
  return '#b8d8ff';
}

function getCategoryLabel(windKmh: number): string {
  if (windKmh > 250) return 'SUPER CYCLONE // CAT 5';
  if (windKmh > 210) return 'EXTREMELY SEVERE // CAT 4';
  if (windKmh > 175) return 'VERY SEVERE // CAT 3';
  if (windKmh > 150) return 'SEVERE CYCLONE // CAT 2';
  if (windKmh > 118) return 'CYCLONIC STORM // CAT 1';
  return 'TROPICAL DEPRESSION';
}

function extractRawStep(step: TimelineStep): {
  lat: number;
  lon: number;
  hour: number;
  windKmh: number;
  distToLandKm: number;
} | null {
  if (Array.isArray(step.storm_center) && step.storm_center.length === 2) {
    const [lat, lon] = step.storm_center;
    return {
      lat,
      lon,
      hour: step.hour_offset ?? 0,
      windKmh: Math.max(0, (step.storm_wind_kt ?? 0) * 1.852),
      distToLandKm: Number.isFinite(step.storm_dist2land_km)
        ? Number(step.storm_dist2land_km)
        : Number.POSITIVE_INFINITY,
    };
  }

  if (step.track?.lat !== undefined && step.track.lon !== undefined) {
    return {
      lat: step.track.lat,
      lon: step.track.lon,
      hour: step.hour_offset ?? 0,
      windKmh: Math.max(0, step.track.wind_kmh ?? 0),
      distToLandKm: Number.isFinite(step.storm_dist2land_km)
        ? Number(step.storm_dist2land_km)
        : Number.POSITIVE_INFINITY,
    };
  }

  return null;
}

export function buildCycloneVisualFrames(
  timeline: TimelineStep[],
): Array<CycloneVisualFrame | null> {
  const frames: Array<CycloneVisualFrame | null> = Array(timeline.length).fill(null);

  const rawIndexed = timeline
    .map((step, idx) => ({ idx, raw: extractRawStep(step) }))
    .filter((item): item is { idx: number; raw: NonNullable<ReturnType<typeof extractRawStep>> } => item.raw !== null);

  if (rawIndexed.length === 0) return frames;

  const total = Math.max(1, rawIndexed.length - 1);
  const landfallRawIndex = rawIndexed.findIndex((item) => item.raw.distToLandKm <= 35);

  let previousWind: number | null = null;

  rawIndexed.forEach((item, sequenceIdx) => {
    const progress = sequenceIdx / total;

    const landTouch = 1 - smoothstep(35, 180, item.raw.distToLandKm);
    const seaToLandDecay = 1 - 0.42 * landTouch;

    const terminalWither = 1 - 0.58 * smoothstep(0.72, 1.0, progress);

    const targetWind = Math.max(0, item.raw.windKmh * seaToLandDecay * terminalWither);

    let visualWind = targetWind;

    if (previousWind !== null && landfallRawIndex >= 0 && sequenceIdx > landfallRawIndex) {
      const inlandBlend = smoothstep(0.65, 1.0, progress);
      const decayRate = 0.992 - inlandBlend * 0.02;
      visualWind = Math.min(targetWind, previousWind * decayRate);
      visualWind = Math.max(0, visualWind);
    }

    previousWind = visualWind;

    frames[item.idx] = {
      lat: item.raw.lat,
      lon: item.raw.lon,
      hour: item.raw.hour,
      rawWindKmh: item.raw.windKmh,
      visualWindKmh: visualWind,
      distToLandKm: item.raw.distToLandKm,
      progress,
      categoryLabel: getCategoryLabel(visualWind),
      color: getColor(visualWind),
    };
  });

  return frames;
}
