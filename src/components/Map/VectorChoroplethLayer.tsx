
import { GeoJSON } from 'react-leaflet';
import { DANGER_LEVELS } from './HoneycombLayer';
import { useHazardData } from '../../hooks/useHazardData';

export function VectorChoroplethLayer() {
  const { vectorData, mlScores, isLoading } = useHazardData();

  if (isLoading || !vectorData) return null;

  const getStyle = (feature: any) => {
    const districtName = feature.properties?.ADM2_EN || "Unknown";
    const scoreData = mlScores[districtName];
    const index = scoreData ? scoreData.mlSeverityIndex : 0;
    
    let color = '#22c55e'; // default Low
    for (const dl of DANGER_LEVELS) {
      if (index >= dl.minScore) {
        color = dl.color;
        break;
      }
    }

    return {
      fillColor: color,
      fillOpacity: 0.65, // Higher opacity for micro-scale vector boundaries
      color: '#ffffff',
      weight: 1,
      dashArray: '3',
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    if (feature.properties && feature.properties.ADM2_EN) {
      const districtName = feature.properties.ADM2_EN;
      const scoreData = mlScores[districtName];
      const severity = scoreData ? Math.round(scoreData.mlSeverityIndex) : 0;
      
      let factorsHtml = '';
      if (scoreData) {
        factorsHtml = `
          <div class="mt-2 text-xs grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300">
            <div>ML Severity:</div><div class="font-mono text-right font-bold text-white">${severity}</div>
            <div>Structural:</div><div class="font-mono text-right">${(scoreData.factors.structural * 100).toFixed(1)}</div>
            <div>Exposure:</div><div class="font-mono text-right">${(scoreData.factors.exposure * 100).toFixed(1)}</div>
            <div>Cyclone Hist:</div><div class="font-mono text-right">${(scoreData.factors.cycloneHistory * 100).toFixed(1)}</div>
            <div>Surge Risk:</div><div class="font-mono text-right">${(scoreData.factors.surgeRisk * 100).toFixed(1)}</div>
          </div>
        `;
      }

      layer.bindTooltip(`
        <div class="font-sans text-sm p-1 rounded min-w-[180px]">
          <div class="font-bold text-slate-100 flex justify-between border-b border-slate-600 pb-1">
            <span>${districtName} Polygon</span>
          </div>
          <div class="text-xs text-slate-400 mt-1">Ground-truth ML Indexing</div>
          ${factorsHtml}
        </div>
      `, { sticky: true, className: 'resilience-tooltip' });
    }
  };

  return (
    <GeoJSON
      data={vectorData}
      style={getStyle}
      onEachFeature={onEachFeature}
    />
  );
}
