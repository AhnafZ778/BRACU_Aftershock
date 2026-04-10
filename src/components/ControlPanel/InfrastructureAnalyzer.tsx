import { useState, useEffect, useMemo } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import * as turf from '@turf/turf';
import { Loader2, Building, Activity, Heart, BookOpen, Layers, ShieldCheck, Users, Wind, Bell, Radio, Brain, ChevronRight, ChevronLeft, Phone, Send, MessageSquare } from 'lucide-react';
import { fetchBatchRouteDistances, fetchBestRoute, triggerRoutingWarmup } from '../../services/mapDataAccess';
import { dispatchCapSms } from '../../config/api';
import { useHardwareStore } from '../../store/useHardwareStore';
import RadarChart from './RadarChart';
import { HardwareGatewayPanel } from '../HardwareGateway/HardwareGatewayPanel';

const CAP_ALWAYS_DEMO_TARGETS = ['01789188252', '01933021307', '01741482281'];

export interface ImpactedInfra {
  schools: any[];
  hospitals: any[];
  mosques: any[];
  shelters: any[];
  volunteers: any[];
}

export interface CapAutomationDraft {
  requestId: string;
  phone: string;
  message: string;
  loraPayload: string;
  loraMessageType?: string;
  targetPane?: 'cap' | 'lora';
  hiddenTargetPhones?: string[];
}

interface InfrastructureAnalyzerProps {
  selectedZone: any;
  onAnalysisComplete: (data: ImpactedInfra | null) => void;
  onPointSelect: (point: any | null) => void;
  onRouteSelect: (route: any | null) => void;
  onRouteIssue?: (message: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOptionSelected?: () => void;
  automationDraft?: CapAutomationDraft | null;
  onAutomationDraftConsumed?: (requestId: string) => void;
}

export default function InfrastructureAnalyzer({ 
  selectedZone, 
  onAnalysisComplete,
  onPointSelect,
  onRouteSelect,
  onRouteIssue,
  isCollapsed = false,
  onToggleCollapse,
  onOptionSelected,
  automationDraft,
  onAutomationDraftConsumed,
}: InfrastructureAnalyzerProps) {
  const timeline = useSimulationStore(s => s.timeline);
  const currentStep = useSimulationStore(s => s.currentStep);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ImpactedInfra | null>(null);
  const [viewMode, setViewMode] = useState<'menu' | 'analysis' | 'stats' | 'cyclone' | 'volunteers' | 'cap' | 'lora' | 'ai_report'>('menu');
  const [activeCategory, setActiveCategory] = useState<'schools' | 'hospitals' | 'mosques' | 'shelters' | 'volunteers' | 'cyclone' | 'cap' | 'lora' | 'ai_report' | null>(null);
  const [roadDistances, setRoadDistances] = useState<Record<string, number>>({});
  const [isFetchingRoads, setIsFetchingRoads] = useState(false);

  // ── CAP Alert (SMS) State ──
  const [capPhone, setCapPhone] = useState('');
  const [capMessage, setCapMessage] = useState('');
  const [capStatus, setCapStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [capErrorMessage, setCapErrorMessage] = useState('');
  const [capDispatchTargets, setCapDispatchTargets] = useState<string[]>([]);
  const setLoRaPayload = useHardwareStore((s) => s.setCustomPayload);
  const setLoRaMessageType = useHardwareStore((s) => s.setSelectedMsgType);
  const setActiveZoneDistrictName = useHardwareStore((s) => s.setActiveZoneDistrictName);

  const selectedZoneKey = useMemo(
    () => String(
      selectedZone?.properties?.controlPanelKey ||
      selectedZone?.properties?.hexId ||
      selectedZone?.properties?.localityCode ||
      '',
    ),
    [selectedZone],
  );

  useEffect(() => {
    if (!automationDraft?.requestId) return;

    setCapPhone(automationDraft.phone || '');
    setCapMessage(automationDraft.message || '');
    setCapDispatchTargets(
      Array.isArray(automationDraft.hiddenTargetPhones)
        ? automationDraft.hiddenTargetPhones
            .map((x) => String(x || '').trim())
            .filter((x) => x.length > 0)
        : [],
    );
    setCapStatus('idle');
    setCapErrorMessage('');
    const targetPane = automationDraft.targetPane === 'lora' ? 'lora' : 'cap';
    setActiveCategory(targetPane);
    setViewMode(targetPane);

    const loraPayload = String(automationDraft.loraPayload || '').trim();
    if (loraPayload) {
      setLoRaMessageType(String(automationDraft.loraMessageType || 'CUSTOM'));
      setLoRaPayload(loraPayload.slice(0, 80));
    }

    onAutomationDraftConsumed?.(automationDraft.requestId);
  }, [automationDraft, onAutomationDraftConsumed, setLoRaPayload, setLoRaMessageType]);

  const parsePhoneList = (raw: string): string[] => {
    return String(raw || '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  };

  const sendCapAlert = async () => {
    if (!capMessage) return;
    const typedTargets = parsePhoneList(capPhone);
    const baseTargets = typedTargets.length > 0 ? typedTargets : capDispatchTargets;
    const targets = Array.from(new Set([...baseTargets, ...CAP_ALWAYS_DEMO_TARGETS]));
    if (!targets.length) return;

    setCapStatus('sending');
    setCapErrorMessage('');
    try {
      for (const phone of targets) {
        const result = await dispatchCapSms(phone, capMessage);
        if (!result.ok) throw new Error(result.error || `CAP dispatch failed for ${phone}.`);
      }

      setCapStatus('success');
      setTimeout(() => setCapStatus('idle'), 3000);
      setCapPhone('');
      setCapMessage('');
      setCapDispatchTargets([]);
    } catch (err) {
      setCapStatus('error');
      setCapErrorMessage(err instanceof Error ? err.message : 'CAP dispatch failed.');
      setTimeout(() => setCapStatus('idle'), 3000);
    }
  };

  const getZoneCircleCenter = (zone: any): [number, number] => {
    const center = zone?.properties?.zoneCircleCenter;
    if (Array.isArray(center) && center.length === 2 && center.every((v: any) => Number.isFinite(Number(v)))) {
      return [Number(center[0]), Number(center[1])];
    }
    const centroid = turf.centroid(zone).geometry.coordinates;
    return [Number(centroid[0]), Number(centroid[1])];
  };

  const normalizeRouteFeature = (data: any): any | null => {
    const route = data?.route;
    const coords = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coords) || coords.length < 2) return null;
    return route;
  };

  const fetchDashboardStyleRouteFromZone = async (targetLon: number, targetLat: number) => {
    const [centerLon, centerLat] = getZoneCircleCenter(selectedZone);
    try {
      // fetchBestRoute now internally handles backend → OSRM fallback chain
      const result = await fetchBestRoute(
        { lon: centerLon, lat: centerLat },
        { lon: targetLon, lat: targetLat },
        'astar'
      );
      const route = normalizeRouteFeature(result);
      if (route) return { route };
      if (result?.error) return { error: String(result.error) };
      return { error: 'No connected road route found for this target from the current zone.' };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Route service is currently unavailable.',
      };
    }
  };

  const pointKey = (pt: any): string => {
    const lon = pt?.geometry?.coordinates?.[0];
    const lat = pt?.geometry?.coordinates?.[1];
    if (typeof lon === 'number' && typeof lat === 'number') {
      return `${lon.toFixed(6)}|${lat.toFixed(6)}`;
    }
    return String(pt?.properties?.name || Math.random());
  };

  const extractPointLonLat = (pt: any): { lon: number; lat: number } | null => {
    const coords = pt?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lon, lat };
  };

  const handleCategorySelect = (category: 'schools' | 'hospitals' | 'mosques' | 'shelters' | 'volunteers' | 'cyclone' | 'cap' | 'lora' | 'ai_report') => {
    onOptionSelected?.();
    setActiveCategory(category);
    if (category === 'cyclone') setViewMode('cyclone');
    else if (category === 'volunteers') setViewMode('volunteers');
    else if (category === 'cap') setViewMode('cap');
    else if (category === 'lora') {
      setViewMode('lora');
      // Sync zone's district to LoRa division dropdown
      const districtName = selectedZone?.properties?.districtName || '';
      setActiveZoneDistrictName(districtName);
    }
    else if (category === 'ai_report') setViewMode('ai_report');
    else setViewMode('stats');

    setRoadDistances({});
    onPointSelect(null);
    onRouteSelect(null);
    
    if (results) {
      const catResults = {
        schools: category === 'schools' ? results.schools : [],
        hospitals: category === 'hospitals' ? results.hospitals : [],
        mosques: category === 'mosques' ? results.mosques : [],
        shelters: category === 'shelters' ? results.shelters : [],
        volunteers: category === 'volunteers' ? results.volunteers : []
      };
      onAnalysisComplete(catResults);
      
      // Trigger road distance fetch
      const targets = (results[category as keyof ImpactedInfra] || []).map((pt: any) => pt.geometry.coordinates);
      if (targets.length > 0) {
        fetchRoadDistances(results[category as keyof ImpactedInfra] || []);
      }
    }
  };

  const fetchRoadDistances = async (points: any[]) => {
    if (!selectedZone || points.length === 0) return;
    setIsFetchingRoads(true);
    setRoadDistances({});
    try {
      const center = getZoneCircleCenter(selectedZone);
      const targets = points
        .map((pt: any) => extractPointLonLat(pt))
        .filter((p): p is { lon: number; lat: number } => Boolean(p))
        .map((p) => [p.lon, p.lat] as [number, number]);
      if (!targets.length) return;
      
      // Add 5-second timeout to batch request
      const batchTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Batch route timeout')), 5000)
      );
      
      try {
        const data = await Promise.race([
          fetchBatchRouteDistances(
            { lon: center[0], lat: center[1] },
            targets
          ),
          batchTimeoutPromise
        ]);

        if (data.distances_km) {
          const distMap: Record<string, number> = {};
          data.distances_km.forEach((d: number, i: number) => {
            if (d !== -1 && points[i]) {
              distMap[pointKey(points[i])] = d;
            }
          });
          if (Object.keys(distMap).length > 0) {
            setRoadDistances(distMap);
            return;
          }
        }
      } catch (batchErr) {
        console.warn('Batch route fetch failed from zone center, falling back to per-target routing:', batchErr);
      }

      // Fallback: compute per-point routes if batch graph doesn't return distances.
      // Limit to top 10 points to avoid overwhelming the backend
      const topPoints = points.slice(0, Math.min(10, points.length));
      const perPointDistances = await Promise.allSettled(topPoints.map(async (pt: any) => {
        const parsed = extractPointLonLat(pt);
        if (!parsed) return null;
        const end_lon = parsed.lon;
        const end_lat = parsed.lat;
        const start_lon = center[0];
        const start_lat = center[1];

        // Add timeout per route
        const routeTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Single route timeout')), 3000)
        );

        try {
          const routeData = await Promise.race([
            fetchBestRoute(
              { lon: start_lon, lat: start_lat },
              { lon: end_lon, lat: end_lat },
              'astar'
            ),
            routeTimeoutPromise
          ]);
          if (routeData?.route?.properties?.distance_km && !routeData?.error) {
            return { key: pointKey(pt), dist: Number(routeData.route.properties.distance_km) };
          }
        } catch (err) {
          console.debug('Individual route failed:', err);
        }
        return null;
      }));

      const fallbackMap: Record<string, number> = {};
      perPointDistances.forEach((result) => {
        if (result.status === 'fulfilled' && result.value && Number.isFinite(result.value.dist)) {
          fallbackMap[result.value.key] = result.value.dist;
        }
      });
      setRoadDistances(fallbackMap);
    } catch (err) {
      console.error('Failed to fetch batch road distances:', err);
    } finally {
      setIsFetchingRoads(false);
    }
  };

  const handleBackToOverview = () => {
    if (activeCategory && viewMode === 'stats') {
      setActiveCategory(null);
      return;
    }
    setActiveCategory(null);
    setViewMode('menu');
    onPointSelect(null);
    onRouteSelect(null);
    // Clear zone filter when leaving LoRa view
    setActiveZoneDistrictName('');
    if (results) onAnalysisComplete(results);
  };

  const handlePointSelect = async (pt: any) => {
    setIsAnalyzing(true);
    onRouteIssue?.(null);
    onPointSelect(pt);
    onRouteSelect(null);

    try {
      const parsed = extractPointLonLat(pt);
      if (!parsed) {
        onRouteIssue?.('Selected infrastructure has invalid coordinates.');
        return;
      }
      const end_lon = parsed.lon;
      const end_lat = parsed.lat;

      const data = await fetchDashboardStyleRouteFromZone(end_lon, end_lat);
      if (data?.route) {
        onRouteSelect(data.route);
        onRouteIssue?.(null);
        return;
      }
      // Only set error once — the data.error or a generic message
      onRouteIssue?.(data?.error || 'No connected road route found for this target from the current zone.');
    } catch (err) {
      console.error('Failed to fetch route:', err);
      onRouteIssue?.('Route service is currently unavailable. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedZone) return;
    setIsAnalyzing(true);
    try {
      const fetchJson = async (path: string) => {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to fetch ${path}`);
        return res.json();
      };

      const [schoolsRes, healthRes, mosquesRes, sheltersRes] = await Promise.all([
        fetchJson('/data/schools_bd.geojson').catch(() => ({ features: [] })),
        fetchJson('/data/health_bd.geojson').catch(() => ({ features: [] })),
        fetchJson('/data/mosques.geojson').catch(() => ({ features: [] })),
        fetchJson('/data/shelters_demo_capacities_clean.geojson').catch(() => fetchJson('/data/shelters_bd.geojson').catch(() => ({ features: [] })))
      ]);

      const centerCoords = getZoneCircleCenter(selectedZone);
      const centroid = turf.point(centerCoords);
      
      const generateMockVolunteers = (center: number[], count: number) => {
        const volunteers = [];
        const [lon, lat] = center;
        for (let i = 0; i < count; i++) {
          const r = Math.random() * 0.1;
          const theta = Math.random() * 2 * Math.PI;
          const dLon = r * Math.cos(theta);
          const dLat = (r * Math.sin(theta)) / Math.cos(lat * Math.PI / 180);
          
          const strength = Math.floor(Math.random() * 10) + 2;
          const unitNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Omega', 'Vanguard'];
          
          volunteers.push({
            type: 'Feature' as const,
            properties: {
              name: `Dispatch ${unitNames[Math.floor(Math.random() * unitNames.length)]}-${i + 1}`,
              strength,
              type: 'volunteer'
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [lon + dLon, lat + dLat]
            }
          });
        }
        return turf.featureCollection(volunteers);
      };

      const mockVolunteersCollection = generateMockVolunteers(centroid.geometry.coordinates, Math.floor(Math.random() * 6) + 3);

      const findNearestPoints = (featureCollection: any, maxDistanceKm = 15, maxPoints = 50) => {
        if (!featureCollection || !featureCollection.features) return [];
        const pointsWithDistance = featureCollection.features.map((pt: any) => {
          if (!pt.geometry || !pt.geometry.coordinates) return null;
          try {
            const dist = turf.distance(centroid, turf.point(pt.geometry.coordinates), { units: 'kilometers' });
            return { ...pt, properties: { ...pt.properties, defaultDistance: dist } };
          } catch (e) {
            return null;
          }
        }).filter((p: any) => p !== null && p.properties.defaultDistance <= maxDistanceKm);
        pointsWithDistance.sort((a: any, b: any) => a.properties.defaultDistance - b.properties.defaultDistance);
        return pointsWithDistance.slice(0, maxPoints);
      };

      const impacted = {
        schools: findNearestPoints(schoolsRes),
        hospitals: findNearestPoints(healthRes),
        mosques: findNearestPoints(mosquesRes),
        shelters: findNearestPoints(sheltersRes),
        volunteers: findNearestPoints(mockVolunteersCollection)
      };

      setResults(impacted);
      onAnalysisComplete(impacted);

    } catch (err) {
      console.error('Error analyzing infrastructure', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    triggerRoutingWarmup().catch(() => undefined);
    setResults(null);
    setActiveCategory(null);
    onAnalysisComplete(null);
    onPointSelect(null);
    onRouteSelect(null);
    if (selectedZoneKey) {
      runAnalysis();
    }
  }, [selectedZoneKey]);

  if (!results) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur">
         <button 
           onClick={runAnalysis}
           disabled={isAnalyzing}
           className={`bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold flex items-center justify-center gap-3 transition-all disabled:opacity-50 ${isCollapsed ? 'w-12 h-12 p-0' : 'px-6 py-3 w-full'}`}
           title={isCollapsed ? "Find Nearest Safezones" : ""}
         >
           {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Activity size={20} />}
           {!isCollapsed && (isAnalyzing ? "Locating..." : "Find Nearest Safezones")}
         </button>
      </div>
    );
  }

  // Sub-views (Details for a category, or special views like AI Report)
  if (!isCollapsed && (activeCategory || viewMode !== 'menu')) {
    const categoryName = {
      schools: 'Nearest Schools',
      hospitals: 'Nearest Hospitals',
      mosques: 'Nearest Mosques',
      shelters: 'Nearest Shelters',
      volunteers: 'Emergency Dispatch Teams',
      cyclone: 'Cyclone Trajectory',
      cap: 'CAP Alerts',
      lora: 'LoRA Mesh Status',
      ai_report: 'AI Prediction Report',
      analysis: 'Infrastructure Analysis',
      menu: '',
      stats: 'Safezone Statistics'
    }[activeCategory || viewMode];

    const Icon = {
      schools: BookOpen,
      hospitals: Heart,
      mosques: Building,
      shelters: ShieldCheck,
      volunteers: Users,
      cyclone: Wind,
      cap: Bell,
      lora: Radio,
      ai_report: Brain,
      analysis: Layers,
      menu: Layers,
      stats: Activity
    }[activeCategory || viewMode];

    const isCyclone = viewMode === 'cyclone';
    const isCap = viewMode === 'cap';
    const isLora = viewMode === 'lora';
    const isAiReport = viewMode === 'ai_report';
    const isStats = viewMode === 'stats' && !activeCategory;
    const isAnalysisMenu = viewMode === 'analysis';

    const categoryData = (isCyclone || isCap || isLora || isAiReport || isStats || isAnalysisMenu) 
      ? [] 
      : (results[activeCategory as keyof ImpactedInfra] || []);

    return (
      <div className="w-full h-full p-4 bg-slate-900/50 backdrop-blur flex flex-col gap-3 overflow-hidden border-l border-white/5">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3 shrink-0">
           <button 
             onClick={handleBackToOverview}
             className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 transition-colors"
           >
             <ChevronLeft className="w-5 h-5" />
           </button>
           <h4 className="text-white font-bold text-lg flex items-center gap-2 truncate">
             <Icon className="text-blue-400 shrink-0" size={18} /> {categoryName}
           </h4>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 custom-scrollbar">
          {isCyclone ? (
            <>
              {(() => {
                const step = timeline[currentStep] as any;
                const pred = step?.ml_predictions;
                const stormCenter = step?.storm_center;
                const zoneCenter = turf.centroid(selectedZone).geometry.coordinates;
                const distance = stormCenter ? turf.distance(turf.point(zoneCenter), turf.point([stormCenter[1], stormCenter[0]]), { units: 'kilometers' }) : null;

                return (
                  <>
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Estimated Distance</span>
                        <span className="text-xl font-black text-amber-400 font-mono tracking-tighter">
                          {distance ? `${distance.toFixed(1)} km` : 'N/A'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full shadow-[0_0_10px_#f59e0b]" 
                          style={{ width: distance ? `${Math.max(5, Math.min(100, (300 - distance) / 3))}%` : '0%' }} 
                        />
                      </div>
                    </div>

                    {pred && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
                          <span className="text-slate-500 text-[9px] font-bold uppercase">Blended Wind</span>
                          <span className="text-lg font-black text-emerald-400 font-mono tracking-tighter">{pred.blended_wind_kt.toFixed(1)} kt</span>
                        </div>
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
                          <span className="text-slate-500 text-[9px] font-bold uppercase">Predicted MSLP</span>
                          <span className="text-lg font-black text-blue-400 font-mono tracking-tighter">{pred.blended_pressure_hpa.toFixed(0)} hPa</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 italic mt-2">Trajectory data synthesized from multi-model ensemble.</p>
                  </>
                );
              })()}
            </>
          ) : isAiReport ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/5 flex flex-col items-center">
                <h5 className="text-[10px] font-bold text-red-400 uppercase tracking-widest self-start mb-6">Priority Risk Map</h5>
                {(() => {
                  const step = timeline[currentStep] as any;
                  const localityCode = selectedZone?.properties?.localityCode;
                  const impact = step?.locality_impacts?.[localityCode];
                  
                  const windValue = Math.min(1, (impact?.local_wind_kt || step?.storm_wind_kt || 45) / 120);
                  const hazardValue = impact?.combined_hazard ?? impact?.event_hazard ?? 0;
                  const surgeValue = Math.min(1, (impact?.surge_pulse || 0) / 5);
                  const floodValue = Math.min(1, (impact?.flood_pulse || 0) / 2);
                  const dziValue = impact?.live_dzi ?? 0.5;
                  const distValue = impact?.dist_to_eye_km ?? 500;
                  const proximityValue = Math.min(1, Math.max(0, (500 - distValue) / 500));
                  
                  const radarData = [
                    { label: 'Wind', value: windValue },
                    { label: 'Hazard', value: hazardValue },
                    { label: 'Surge', value: surgeValue },
                    { label: 'Flood', value: floodValue },
                    { label: 'DZI', value: Math.min(1, (dziValue || 0) / 100) },
                    { label: 'Proximity', value: proximityValue },
                  ];

                  return <RadarChart data={radarData} size={220} />;
                })()}
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/5 flex flex-col gap-3">
                <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Environmental Status</h5>
                {(() => {
                  const step = timeline[currentStep] as any;
                  const code = selectedZone?.properties?.localityCode;
                  const impact = step?.locality_impacts?.[code];
                  return (
                    <div className="grid grid-cols-2 gap-3 font-mono">
                       <div className="flex flex-col"><span className="text-[9px] text-slate-600 uppercase">Local Wind</span><span className="text-xs text-white">{impact?.local_wind_kt?.toFixed(1) || '0.0'} kt</span></div>
                       <div className="flex flex-col"><span className="text-[9px] text-slate-600 uppercase">Hazard Score</span><span className="text-xs text-white">{( (impact?.combined_hazard ?? impact?.event_hazard ?? 0) * 100 ).toFixed(1)}%</span></div>
                       <div className="flex flex-col"><span className="text-[9px] text-slate-600 uppercase">Surge</span><span className="text-xs text-white">{impact?.surge_pulse?.toFixed(2) || '0.00'} m</span></div>
                       <div className="flex flex-col"><span className="text-[9px] text-slate-600 uppercase">Flood</span><span className="text-xs text-white">{impact?.flood_pulse?.toFixed(2) || '0.00'} m</span></div>
                    </div>
                  );
                })()}
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/5 flex flex-col gap-3">
                <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Geospatial Context</h5>
                {(() => {
                   const step = timeline[currentStep] as any;
                   const code = selectedZone?.properties?.localityCode;
                   const impact = step?.locality_impacts?.[code];
                   return (
                    <div className="flex flex-col gap-1.5 text-xs">
                       <div className="flex justify-between"><span className="text-slate-500 uppercase text-[9px]">Dist to Eye</span><span className="text-white">{impact?.dist_to_eye_km?.toFixed(1) || 'N/A'} km</span></div>
                       <div className="flex justify-between"><span className="text-slate-500 uppercase text-[9px]">Exposure</span><span className="text-white">{((impact?.exposure ?? 0.6) * 100).toFixed(0)}%</span></div>
                       <div className="flex justify-between"><span className="text-slate-500 uppercase text-[9px]">Vulnerability</span><span className="text-white">{((impact?.vulnerability ?? 0.3) * 100).toFixed(0)}%</span></div>
                    </div>
                   );
                })()}
              </div>
            </div>
          ) : isCap ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-orange-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Bell className="text-orange-400" size={16} />
                  <h5 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">CAP SMS Alert</h5>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Dispatch emergency SMS alerts via MacroDroid to any phone number directly from the Control Panel.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                    <Phone size={10} /> Recipient Number
                  </label>
                  <input
                    type="tel"
                    value={capPhone}
                    onChange={(e) => setCapPhone(e.target.value)}
                    placeholder="e.g. 01XXXXXXXXX"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-600 font-mono focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={10} /> Alert Message
                  </label>
                  <textarea
                    value={capMessage}
                    onChange={(e) => setCapMessage(e.target.value)}
                    placeholder="CYCLONE EVACUATION ORDER..."
                    rows={3}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-600 font-mono resize-none focus:outline-none focus:border-orange-500/40 transition-colors leading-relaxed"
                  />
                </div>
                <button
                  onClick={sendCapAlert}
                  disabled={capStatus === 'sending' || !capMessage}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                    capStatus === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : capStatus === 'error'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20'
                  }`}
                >
                  {capStatus === 'sending' ? 'Dispatching...' : capStatus === 'success' ? '✓ Alert Sent!' : capStatus === 'error' ? 'Dispatch Failed' : <><Send size={12} /> Dispatch Alert</>}
                </button>
                {capStatus === 'error' && capErrorMessage ? (
                  <p className="text-[10px] text-red-300/90 leading-relaxed">{capErrorMessage}</p>
                ) : null}

              </div>
            </div>
          ) : isLora ? (
            <div className="flex flex-col -mx-4 -mt-3 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
              <HardwareGatewayPanel />
            </div>
          ) : isStats ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Total Shelters</span>
                   <span className="text-2xl font-black text-white">{results.shelters.length}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Active Dispatch</span>
                   <span className="text-2xl font-black text-cyan-400">{results.volunteers.length}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Infrastructure Categories</h5>
                {[
                  { id: 'schools', label: 'Schools', icon: BookOpen, count: results.schools.length, color: 'blue' },
                  { id: 'hospitals', label: 'Hospitals', icon: Heart, count: results.hospitals.length, color: 'red' },
                  { id: 'mosques', label: 'Mosques', icon: Building, count: results.mosques.length, color: 'green' },
                  { id: 'shelters', label: 'Shelters', icon: ShieldCheck, count: results.shelters.length, color: 'amber' }
                ].map((cat) => (
                  <button 
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id as any)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-950/80 border border-white/5 rounded-xl hover:bg-slate-900 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <cat.icon size={16} className={`text-${cat.color}-400`} />
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{cat.label}</span>
                    </div>
                    <span className="text-base font-black text-white">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : isAnalysisMenu ? (
            <div className="flex flex-col gap-2 text-center py-8">
              <Layers className="mx-auto text-slate-700 mb-2" />
              <p className="text-slate-500 text-xs">This view has been merged into Safezone Stats.</p>
              <button onClick={handleBackToOverview} className="text-blue-400 text-xs font-bold uppercase tracking-widest mt-2">Back to Menu</button>
            </div>
          ) : (
            <>
              {isFetchingRoads && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2 animate-pulse sticky top-0 z-10">
                  <Loader2 className="text-blue-400 animate-spin shrink-0" size={16} />
                  <span className="text-xs text-blue-400 font-medium">Computing road distances...</span>
                </div>
              )}
              {categoryData.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-4">No locations found within 15km.</div>
              ) : (
                categoryData
                .map((pt: any) => ({ ...pt, roadDist: roadDistances[pointKey(pt)] }))
                .sort((a: any, b: any) => {
                  const aReachable = Number.isFinite(a.roadDist);
                  const bReachable = Number.isFinite(b.roadDist);
                  if (aReachable !== bReachable) return aReachable ? -1 : 1;
                  return (a.roadDist ?? a.properties.defaultDistance) - (b.roadDist ?? b.properties.defaultDistance);
                })
                .map((pt: any, i: number) => (
                  <button 
                    key={i}
                    onClick={() => handlePointSelect(pt)}
                    className="w-full text-left bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg p-3 transition-colors flex items-center gap-3 group focus:outline-none focus:ring-1 ring-blue-500"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 shrink-0 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors font-bold text-xs">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-200 font-medium text-xs truncate">
                        {pt.properties.name || pt.properties.NAME || 'Facility ' + (i+1)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-mono ${pt.roadDist ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                          {(pt.roadDist ?? pt.properties.defaultDistance).toFixed(2)} km
                        </span>
                        {pt.roadDist ? (
                          <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 rounded uppercase font-bold tracking-tighter">Road</span>
                        ) : (
                          <span className="text-[8px] bg-slate-500/10 text-slate-500 px-1 rounded uppercase font-bold tracking-tighter">Air</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Main list of buttons (Utility Menu)
  return (
    <div className="w-full h-full p-3 bg-slate-900/40 backdrop-blur flex flex-col gap-3 overflow-hidden relative border-l border-white/5">
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-white/5 pb-4 shrink-0`}>
        {!isCollapsed && (
          <h4 className="text-slate-200 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2 truncate">
            <Layers className="text-blue-400" size={16} /> Utilities
          </h4>
        )}
        <button 
           onClick={onToggleCollapse}
           className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
           title={isCollapsed ? "Expand Panel" : "Collapse Panel"}
        >
           {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
        {[
          { id: 'cyclone', label: 'Cyclone Trajectory', icon: Wind, color: 'blue', view: 'cyclone' },
          { id: 'stats', label: 'Safezone Stats', icon: Activity, color: 'indigo', view: 'stats' },
          { id: 'ai_report', label: 'AI Prediction Report', icon: Brain, color: 'cyan', view: 'ai_report' },
          { id: 'cap', label: 'CAP Alerts', icon: Bell, color: 'orange', view: 'cap' },
          { id: 'lora', label: 'LoRA Mesh Status', icon: Radio, color: 'purple', view: 'lora' }
        ].map((btn) => (
          <button 
             key={btn.id}
             onClick={() => {
               onOptionSelected?.();
               if (btn.id === 'analysis') setViewMode('analysis');
               else if (btn.id === 'cap' || btn.id === 'lora') handleCategorySelect(btn.id as any);
               else setViewMode(btn.view as any);
             }}
             className={`
               flex items-center transition-all bg-slate-950/80 border border-white/5 hover:bg-slate-900/80 group rounded-xl
               ${isCollapsed ? 'w-full aspect-square justify-center p-0' : 'p-2.5 gap-2.5 justify-start'}
             `}
             title={isCollapsed ? btn.label : ""}
          >
             <btn.icon 
               size={isCollapsed ? 20 : 18} 
               className={`text-${btn.color}-400 group-hover:scale-110 transition-transform shrink-0`} 
             />
             {!isCollapsed && (
               <span className="text-slate-300 text-[10px] font-bold uppercase tracking-wider truncate">
                 {btn.label}
               </span>
             )}
          </button>
        ))}
      </div>
      
      {!isCollapsed && (
        <p className="text-[10px] text-slate-600 mt-2 italic text-center">
          v1.4 Command Terminal
        </p>
      )}
    </div>
  );
}

