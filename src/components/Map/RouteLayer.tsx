import { useState, useEffect } from 'react';
import { useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { useAppStore } from '../../store/useAppStore';

function RoutingMachine({ start, end }: { start: [number, number] | null; end: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!start || !end) return;
    
    // Create a custom router that merges the public OSRM routing and our native BD-restricted routing
    const originalOsrmRouter = new L.Routing.OSRMv1({
        profile: 'foot' // foot profile allows crossing borders to get the 'impractical different country' route
    });

    const customSplitRouter = {
        route: function(waypoints: any[], callback: (err: any, routes?: any[]) => void, context?: any, options?: any) {
            // 1) Fetch the theoretical global route via OSRM (which might go through India)
            // @ts-ignore
            originalOsrmRouter.route(waypoints, function(err: any, osrmRoutes: any[]) {
                (async () => {
                    let combinedRoutes: any[] = [];
                    
                    // Keep the best OSRM route as the "impractical international" route
                    if (!err && osrmRoutes && osrmRoutes.length > 0) {
                        const osrmRoute = osrmRoutes[0];
                        if (osrmRoute.name === "" || osrmRoute.name.includes("OSRM") || osrmRoute.name.includes(",")) {
                            osrmRoute.name = "Path 2 (Impractical International Detour)";
                        } else {
                            osrmRoute.name = "Path 2: " + osrmRoute.name;
                        }
                        combinedRoutes.push(osrmRoute);
                    }
                    
                    // 2) Fetch the Strictly Bangladesh route via our Local Backend
                    try {
                        const startWp = waypoints[0].latLng;
                        const endWp = waypoints[waypoints.length - 1].latLng;
                        
                        const response = await fetch('/api/route', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                start_lat: startWp.lat,
                                start_lon: startWp.lng,
                                end_lat: endWp.lat,
                                end_lon: endWp.lng,
                                flooded_zones: [] // Passed from state if needed
                            })
                        });
                        
                        const bdData = await response.json();
                        
                        if (!bdData.error && bdData.geometry && bdData.geometry.coordinates) {
                            // Convert GeoJSON coords (lng, lat) to L.LatLng[]
                            let coordinates = bdData.geometry.coordinates.map((c: number[]) => L.latLng(c[1], c[0]));
                            
                            // Try Map Matching to smooth the crude A* path
                            try {
                                const rawCoords = bdData.geometry.coordinates;
                                let downsampled = rawCoords;
                                // OSRM public API allows up to 100 coordinates for match
                                if (rawCoords.length > 90) {
                                    const step = Math.ceil(rawCoords.length / 90);
                                    downsampled = rawCoords.filter((_: any, i: number) => i % step === 0 || i === rawCoords.length - 1);
                                }
                                const coordString = downsampled.map((c: number[]) => c.join(',')).join(';');
                                const matchRes = await fetch(`https://router.project-osrm.org/match/v1/driving/${coordString}?geometries=geojson&overview=full`);
                                if (matchRes.ok) {
                                    const matchData = await matchRes.json();
                                    if (matchData.code === 'Ok' && matchData.matchings && matchData.matchings.length > 0) {
                                        // Update coordinates to the perfectly snapped road geometry
                                        const bestMatch = matchData.matchings[0];
                                        coordinates = bestMatch.geometry.coordinates.map((c: number[]) => L.latLng(c[1], c[0]));
                                    }
                                }
                            } catch (matchErr) {
                                console.error("Map matching failed, falling back to raw backend coordinates:", matchErr);
                            }
                            
                            // Fabricate a basic Route object for Leaflet Routing Machine
                            const bdRoute = {
                                name: "Path 1 (Strictly Bangladesh)",
                                summary: {
                                    totalDistance: bdData.properties.distance_m || 0,
                                    totalTime: (bdData.properties.travel_time_min * 60) || 0,
                                },
                                coordinates: coordinates,
                                instructions: [
                                    {
                                        distance: bdData.properties.distance_m || 0,
                                        time: (bdData.properties.travel_time_min * 60) || 0,
                                        text: "Drive along the safest route within Bangladesh",
                                        index: 0,
                                        type: "Straight"
                                    },
                                    {
                                        distance: 0,
                                        time: 0,
                                        text: "Arrive at Destination",
                                        index: coordinates.length - 1,
                                        type: "DestinationReached"
                                    }
                                ],
                                inputWaypoints: waypoints,
                                waypoints: waypoints
                            };
                            
                            // Prepend the strictly BD route so it shows up as Path 1
                            combinedRoutes.unshift(bdRoute);
                        }
                    } catch (e) {
                        console.error("Local routing failed:", e);
                    }
                    
                    if (combinedRoutes.length > 0) {
                        callback.call(context || callback, null, combinedRoutes);
                    } else {
                        callback.call(context || callback, new Error("No routes found"));
                    }
                })().catch(e => callback.call(context || callback, e));
            }, context, options);
        }
    };

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(start[0], start[1]),
        L.latLng(end[0], end[1])
      ],
      // @ts-ignore
      router: customSplitRouter,
      routeWhileDragging: false,
      showAlternatives: true,
      fitSelectedRoutes: true,
      show: true, // Show the instruction UI
      lineOptions: {
        styles: [{ color: '#d500f9', opacity: 0.9, weight: 6 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      },
      altLineOptions: {
        styles: [{ color: '#0088cc', opacity: 0.7, weight: 6, dashArray: '10' }],
        extendToWaypoints: true,
        missingRouteTolerance: 0
      },
      // Hide the default markers as we render our own
      // @ts-ignore - createMarker is missing from types but works in leaflet-routing-machine
      createMarker: () => null
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, start, end]);

  return null;
}

export function RouteLayer() {
  const { showRouting } = useAppStore();
  const [start, setStart] = useState<[number, number] | null>(null);
  const [end, setEnd] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!showRouting) {
      setStart(null);
      setEnd(null);
    }
  }, [showRouting]);

  useMapEvents({
    click(e) {
      if (!showRouting) return;
      
      if (!start) {
        setStart([e.latlng.lat, e.latlng.lng]);
        setEnd(null);
      } else if (!end) {
        setEnd([e.latlng.lat, e.latlng.lng]);
      } else {
        // Reset and start new
        setStart([e.latlng.lat, e.latlng.lng]);
        setEnd(null);
      }
    }
  });

  const startIcon = L.divIcon({
    className: 'bg-transparent',
    html: `<div style="width:14px;height:14px;border-radius:50%;background-color:#00e676;border:2px solid black;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const endIcon = L.divIcon({
    className: 'bg-transparent',
    html: `<div style="width:14px;height:14px;border-radius:50%;background-color:#ff1744;border:2px solid black;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  return (
    <>
      <style>{`
        .leaflet-routing-container {
          background-color: white !important;
          color: #333 !important;
          margin-top: 80px !important;
          max-height: 400px;
          overflow-y: auto;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) !important;
          border-radius: 0.5rem !important;
          counter-reset: path-counter;
        }
        .leaflet-routing-alt {
          max-height: 100% !important;
          padding: 8px 12px 12px 12px !important;
          border-bottom: 1px solid #e5e7eb !important;
          transition: all 0.2s;
        }
        .leaflet-routing-alt:first-child {
          border-left: 4px solid #d500f9 !important;
        }
        .leaflet-routing-alt:not(:first-child) {
          border-left: 4px solid #0088cc !important;
        }
        .leaflet-routing-alt h2::before {
          counter-increment: path-counter;
          content: "Path " counter(path-counter) " : ";
          font-weight: bold;
        }
        .leaflet-routing-alt:first-child h2::before {
          color: #d500f9;
        }
        .leaflet-routing-alt:not(:first-child) h2::before {
          color: #0088cc;
        }
        .leaflet-routing-alt h2,
        .leaflet-routing-alt h3,
        .leaflet-routing-alt td {
          color: #1f2937 !important; /* dark slate gray */
        }
        .leaflet-routing-alt tr:hover {
          background-color: #f3f4f6 !important;
        }
        /* Style for the distance and time */
        .leaflet-routing-alt h3 {
          font-weight: 600 !important;
          font-size: 14px !important;
          margin-top: 4px !important;
        }
      `}</style>
      {start && <Marker position={start} icon={startIcon}>
         <Popup className="text-zinc-900 border-none rounded">Start Origin</Popup>
      </Marker>}
      
      {end && <Marker position={end} icon={endIcon}>
        <Popup className="text-zinc-900 border-none rounded">Destination</Popup>
      </Marker>}

      {(start && end) && <RoutingMachine start={start} end={end} />}
    </>
  );
}
