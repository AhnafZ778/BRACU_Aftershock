import { Polyline, CircleMarker } from 'react-leaflet';
import { useSimulationStore } from '../../store/useSimulationStore';

type CycloneTrackLayerProps = {
  showHeadingVector?: boolean;
  showWindField?: boolean;
};

// Saffir-Simpson color scale
function getCycloneColor(wind_kmh: number): string {
  if (wind_kmh >= 252) return '#ff0040';   // Cat 5 — deep red
  if (wind_kmh >= 209) return '#ff2020';   // Cat 4 — red
  if (wind_kmh >= 178) return '#ff6600';   // Cat 3 — orange-red
  if (wind_kmh >= 154) return '#ff9900';   // Cat 2 — orange
  if (wind_kmh >= 119) return '#ffcc00';   // Cat 1 — yellow-orange
  if (wind_kmh >= 63)  return '#ffd700';   // Tropical Storm — gold
  return '#eab308';                         // Depression — yellow
}

function getCycloneCategory(wind_kmh: number): string {
  if (wind_kmh >= 252) return 'Category 5';
  if (wind_kmh >= 209) return 'Category 4';
  if (wind_kmh >= 178) return 'Category 3';
  if (wind_kmh >= 154) return 'Category 2';
  if (wind_kmh >= 119) return 'Category 1';
  if (wind_kmh >= 63)  return 'Tropical Storm';
  if (wind_kmh > 0)    return 'Tropical Depression';
  return 'Unknown';
}

export function CycloneTrackLayer({ showHeadingVector = true, showWindField = true }: CycloneTrackLayerProps) {
  const { timeline, currentStep, isLoaded } = useSimulationStore();

  if (!isLoaded || timeline.length === 0) return null;

  // Extract all track points up to the current step
  const historicalPath: [number, number][] = [];
  const allPathPoints: { lat: number; lon: number; wind_kmh: number }[] = [];
  let currentPos: { lat: number; lon: number; wind: number; category: string; color: string; heading?: number; wind_kt?: number } | null = null;
  
  for (let i = 0; i <= currentStep; i++) {
    const step = timeline[i] as any;
    
    // V4 schema: storm_center is [lat, lon]
    if (step.storm_center && Array.isArray(step.storm_center) && step.storm_center.length === 2) {
      const [lat, lon] = step.storm_center;
      historicalPath.push([lat, lon]);

      const wind_kt = step.storm_wind_kt || 0;
      const wind_kmh = Math.round(wind_kt * 1.852);
      const color = getCycloneColor(wind_kmh);
      const category = getCycloneCategory(wind_kmh);
      const heading = step.storm_heading_deg || 0;

      allPathPoints.push({ lat, lon, wind_kmh });
      currentPos = { lat, lon, wind: wind_kmh, category, color, heading, wind_kt };
    } 
    // Fallback to legacy V3 schema (step.track)
    else if (step.track && step.track.lat && step.track.lon) {
      const lat = step.track.lat;
      const lon = step.track.lon;
      const wind_kmh = step.track.wind_kmh || 0;
      historicalPath.push([lat, lon]);
      allPathPoints.push({ lat, lon, wind_kmh });
      currentPos = {
        lat, lon, wind: wind_kmh,
        category: step.track.category || getCycloneCategory(wind_kmh),
        color: getCycloneColor(wind_kmh),
        heading: step.storm_heading_deg || 0,
        wind_kt: wind_kmh / 1.852
      };
    }
  }

  // Debug logging
  console.debug('[CycloneTrackLayer]', {
    currentStep,
    totalPoints: historicalPath.length,
    currentPos,
    firstPoint: historicalPath[0],
    lastPoint: historicalPath[historicalPath.length - 1],
  });

  if (historicalPath.length === 0 || !currentPos) return null;

  return (
    <>
      {/* Outer glow trail behind the path */}
      <Polyline
        positions={historicalPath}
        pathOptions={{
          color: currentPos.color,
          weight: 8,
          opacity: 0.2,
          lineCap: 'round',
          lineJoin: 'round'
        }}
      />

      {/* Main track path — thick dashed trail */}
      <Polyline
        positions={historicalPath}
        pathOptions={{
          color: currentPos.color,
          weight: 4,
          opacity: 0.7,
          dashArray: '8, 12',
          lineCap: 'round',
          lineJoin: 'round'
        }}
      />

      {/* Track point markers — small dots at each step */}
      {allPathPoints.map((pt, idx) => (
        <CircleMarker
          key={idx}
          center={[pt.lat, pt.lon]}
          radius={3}
          pathOptions={{
            fillColor: getCycloneColor(pt.wind_kmh),
            fillOpacity: 0.8,
            color: getCycloneColor(pt.wind_kmh),
            weight: 1,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Vector Arrow Representation: Heading Direction */}
      {showHeadingVector && currentPos && currentPos.heading !== undefined && (
        <>
          {/* Calculate arrow endpoints using heading (0° = North, 90° = East, etc.) */}
          {(() => {
            const headingRad = (currentPos.heading || 0) * (Math.PI / 180);
            const arrowLength = 0.15; // degrees
            
            const endLat = currentPos.lat + arrowLength * Math.cos(headingRad);
            const endLon = currentPos.lon + arrowLength * Math.sin(headingRad);
            
            // Main heading arrow line
            return (
              <>
                {/* Main heading arrow */}
                <Polyline
                  positions={[[currentPos.lat, currentPos.lon], [endLat, endLon]]}
                  pathOptions={{
                    color: currentPos.color,
                    weight: 5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
                
                {/* Arrowhead point 1 */}
                <Polyline
                  positions={[[endLat, endLon], [endLat - 0.04 * Math.cos(headingRad - Math.PI / 6), endLon - 0.04 * Math.sin(headingRad - Math.PI / 6)]]}
                  pathOptions={{
                    color: currentPos.color,
                    weight: 5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
                
                {/* Arrowhead point 2 */}
                <Polyline
                  positions={[[endLat, endLon], [endLat - 0.04 * Math.cos(headingRad + Math.PI / 6), endLon - 0.04 * Math.sin(headingRad + Math.PI / 6)]]}
                  pathOptions={{
                    color: currentPos.color,
                    weight: 5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
                
                {/* Center point indicator */}
                <CircleMarker
                  center={[currentPos.lat, currentPos.lon]}
                  radius={5}
                  pathOptions={{
                    fillColor: currentPos.color,
                    fillOpacity: 1,
                    color: '#fff',
                    weight: 2,
                    opacity: 1
                  }}
                />
              </>
            );
          })()}
        </>
      )}

      {/* Wind Speed Representation: Radial arrows around center */}
      {showWindField && currentPos && (
        (() => {
          const windIntensity = Math.min(currentPos.wind / 150, 1); // Normalize wind speed
          const numArrows = 8; // 8 radial arrows for wind representation
          const arrowLength = 0.08 + windIntensity * 0.12; // Length varies with wind
          
          return Array.from({ length: numArrows }).map((_, i) => {
            const angle = (i / numArrows) * 2 * Math.PI;
            const endLat = currentPos.lat + arrowLength * Math.cos(angle);
            const endLon = currentPos.lon + arrowLength * Math.sin(angle);
            
            return (
              <Polyline
                key={`wind-arrow-${i}`}
                positions={[[currentPos.lat, currentPos.lon], [endLat, endLon]]}
                pathOptions={{
                  color: currentPos.color,
                  weight: 2,
                  opacity: 0.5 + windIntensity * 0.5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  dashArray: '2, 4'
                }}
              />
            );
          });
        })()
      )}
    </>
  );
}
