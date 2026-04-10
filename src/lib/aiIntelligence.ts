import * as turf from '@turf/turf';
import type { LoRaDevice } from '../store/useLoRaStore';
import type { ZoneTimelineStep } from '../store/useSimulationStore';

export interface AIInsight {
  type: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
}

/**
 * Finds the nearest online LoRa mesh node to a given location.
 */
export function findNearestMeshNode(
  point: [number, number], // [lon, lat]
  devices: LoRaDevice[]
): { device: LoRaDevice; distance_km: number } | null {
  const onlineDevices = devices.filter(d => d.online);
  if (onlineDevices.length === 0) return null;

  let nearest: { device: LoRaDevice; distance_km: number } | null = null;
  let minDistance = Infinity;

  const startPt = turf.point(point);

  onlineDevices.forEach(device => {
    const devicePt = turf.point([device.location.lng, device.location.lat]);
    const distance = turf.distance(startPt, devicePt, { units: 'kilometers' });
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { device, distance_km: distance };
    }
  });

  return nearest;
}

/**
 * Synthesizes current simulation state into a status summary.
 */
export function getSituationalSummary(
  step: ZoneTimelineStep,
  isNGOActive: boolean
): string {
  const windKmh = Math.round((step.storm_wind_kt || 0) * 1.852);
  const distLand = step.storm_dist2land_km || 0;
  
  let summary = `Cyclone status: ${step.phase}. Winds reaching ${windKmh} km/h. `;
  
  if (distLand > 0) {
    summary += `Storm eye is approximately ${distLand.toFixed(1)} km from the nearest coastline. `;
  } else {
    summary += `Storm eye has made landfall. Impact is active across coastal zones. `;
  }

  if (isNGOActive) {
    summary += `NGO volunteer units are currently deployed and coordinating dispatches in the field. `;
  }

  return summary;
}

/**
 * Generates strategic insights based on the current step data.
 */
export function generateInsights(step: ZoneTimelineStep): AIInsight[] {
  const insights: AIInsight[] = [];
  const windKmh = Math.round((step.storm_wind_kt || 0) * 1.852);

  if (windKmh > 120) {
    insights.push({
      type: 'critical',
      title: 'Extreme Wind Load',
      message: 'Infrastructure integrity is at high risk. Recommend immediate evacuation for all non-reinforced structures.'
    });
  } else if (windKmh > 80) {
    insights.push({
      type: 'warning',
      title: 'High Wind Alert',
      message: 'Significant damage to temporary shelters expected. Dispatch teams should use reinforced secondary routes.'
    });
  }

  const surge = step.storm_pres_hpa ? (1013 - step.storm_pres_hpa) * 0.01 : 0;
  if (surge > 0.5) {
    insights.push({
      type: 'warning',
      title: 'Coastal Surge Detected',
      message: 'Rising sea levels detected. Low-lying mesh nodes may experience signal interference'
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'info',
      title: 'Normal Operations',
      message: 'Conditions are currently stable. Monitor for changes in storm heading.'
    });
  }

  return insights;
}
