/**
 * EmployeeHeatmapLayer — Canvas-based heatmap using leaflet.heat.
 *
 * Reads accumulated GPS heat points from useEmployeeStore
 * and renders them as a smooth gradient heatmap on the Leaflet map.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { useEmployeeStore } from '../../store/useEmployeeStore';

// Extend Leaflet types for leaflet.heat
declare module 'leaflet' {
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    }
  ): any;
}

export function EmployeeHeatmapLayer() {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);
  const { heatPoints, showHeatmap } = useEmployeeStore();

  // Create / destroy heatmap layer
  useEffect(() => {
    if (!showHeatmap) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    if (!heatLayerRef.current) {
      heatLayerRef.current = (L as any).heatLayer([], {
        radius: 22,
        blur: 18,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
        gradient: {
          0.1: '#1e3a5f',   // deep navy — barely visited
          0.25: '#2563eb',  // blue — light coverage
          0.4: '#06b6d4',   // cyan — moderate
          0.6: '#22c55e',   // green — good coverage
          0.8: '#eab308',   // yellow — heavy traffic
          1.0: '#ef4444',   // red — saturated coverage
        },
      }).addTo(map);
    }

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, showHeatmap]);

  // Update heat points
  useEffect(() => {
    if (heatLayerRef.current && showHeatmap) {
      heatLayerRef.current.setLatLngs(heatPoints);
    }
  }, [heatPoints, showHeatmap]);

  return null;
}
