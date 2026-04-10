import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Building2, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Navigation,
  Search,
  Radio,
  Zap,
} from 'lucide-react';
import * as turf from '@turf/turf';
import { fetchBestRoute } from '../../services/mapDataAccess';
import { fetchCopilotDisseminationAction } from '../../services/copilotService';
import type { DisseminationResponse } from '../../types/copilot';
import { getWsBaseUrl } from '../../config/api';
import VOLUNTEER_DATA from '../../data/volunteerData';

interface NGO {
  id: string;
  name: string;
  color: string;
}

interface PendingDispatch {
  ngoId: string;
  ngoName: string;
  resourceName: string;
  resourceProfile: Record<string, any>;
  dispatchTeamsReady: number;
  reinforcementLeft: number;
  activeAssignments: number;
  selectedClusterId: string;
  selectedClusterSeverity: string;
  selectedClusterAgents: number;
  area: {
    bbox: { west: number; south: number; east: number; north: number };
    center: { lat: number; lon: number };
    polygon: [number, number][];
    areaKm2: number;
  };
}

interface PendingCentralAlert {
  eventId: string;
  message: string;
  targetZone: string;
  adjacentZones: string[];
  targetVolunteers: string[];
  center: { lat: number; lng: number };
  radiusKm: number;
}

const NGOS: NGO[] = [
  { id: 'ngo-1', name: 'Red Crescent Society', color: 'red' },
  { id: 'ngo-2', name: 'BRAC', color: 'emerald' },
  { id: 'ngo-3', name: 'Care Bangladesh', color: 'blue' },
  { id: 'ngo-4', name: 'ActionAid Bangladesh', color: 'amber' },
  { id: 'ngo-5', name: 'Islamic Relief', color: 'purple' },
  { id: 'ngo-6', name: 'World Vision BD', color: 'pink' },
  { id: 'ngo-7', name: 'Concern Worldwide', color: 'cyan' },
];

const normalizeClusterId = (id: unknown): string => String(id ?? '');

const extractPointLonLat = (pt: any): { lon: number; lat: number } | null => {
  const coords = pt?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon, lat };
};

interface NGOManagerProps {
  selectedZone: any;
  contextZones: any[];
  volunteers: any[];
  rescueZones: any[];
  selectedRescueCluster: any | null;
  selectedDispatchArea: {
    bbox: { west: number; south: number; east: number; north: number };
    center: { lat: number; lon: number };
    polygon: [number, number][];
    areaKm2: number;
  } | null;
  isMarqueeEnabled: boolean;
  onToggleMarquee: (enabled: boolean) => void;
  onClearDispatchArea: () => void;
  onDispatchBroadcast: (payload: {
    ngoId: string;
    ngoName: string;
    resourceName: string;
    resourceProfile: Record<string, any>;
    dispatchTeamsReady: number;
    reinforcementLeft: number;
    activeAssignments: number;
    selectedClusterId: string;
    selectedClusterSeverity: string;
    selectedClusterAgents: number;
    area: {
      bbox: { west: number; south: number; east: number; north: number };
      center: { lat: number; lon: number };
      polygon: [number, number][];
      areaKm2: number;
    };
  }) => void;
  showRescueClusters: boolean;
  onToggleRescueClusters: (enabled: boolean) => void;
  onSelectRescueCluster: (clusterId: string) => void;
  onPointSelect: (pt: any) => void;
  onRouteSelect: (route: any) => void;
  onRouteIssue?: (message: string | null) => void;
  onWriteToCapOption?: (draft: {
    phone: string;
    message: string;
    loraPayload: string;
    loraMessageType?: string;
  }) => void;
  onWriteToLoRaOption?: (draft: {
    phone: string;
    message: string;
    loraPayload: string;
    loraMessageType?: string;
  }) => void;
  assistantCentralAlertDraft?: {
    requestId: string;
    message: string;
  } | null;
  onAssistantCentralAlertDraftConsumed?: (requestId: string) => void;
  assistantDispatchDraft?: {
    requestId: string;
    message: string;
  } | null;
  onAssistantDispatchDraftConsumed?: (requestId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOptionSelected?: () => void;
}

const NGOManager: React.FC<NGOManagerProps> = ({ 
  selectedZone, 
  contextZones,
  volunteers, 
  rescueZones,
  selectedRescueCluster,
  selectedDispatchArea,
  isMarqueeEnabled,
  onToggleMarquee,
  onClearDispatchArea,
  onDispatchBroadcast,
  showRescueClusters,
  onToggleRescueClusters,
  onSelectRescueCluster,
  onPointSelect, 
  onRouteSelect,
  onRouteIssue,
  onWriteToCapOption,
  onWriteToLoRaOption,
  assistantCentralAlertDraft,
  onAssistantCentralAlertDraftConsumed,
  assistantDispatchDraft,
  onAssistantDispatchDraftConsumed,
  isCollapsed,
  onToggleCollapse,
  onOptionSelected,
}) => {
  const [viewMode, setViewMode] = useState<'menu' | 'org_list' | 'dispatch_list' | 'clusters' | 'cluster_actions' | 'action_dissemination'>('menu');
  const [selectedNGO, setSelectedNGO] = useState<NGO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSelectedCluster, setLastSelectedCluster] = useState<any | null>(null);
  const [resourcePickerNgoId, setResourcePickerNgoId] = useState<string | null>(null);
  const [pendingDispatch, setPendingDispatch] = useState<PendingDispatch | null>(null);
  const [dissemination, setDissemination] = useState<DisseminationResponse | null>(null);
  const [disseminationLoading, setDisseminationLoading] = useState(false);
  const [disseminationError, setDisseminationError] = useState<string | null>(null);
  const [pendingCentralAlert, setPendingCentralAlert] = useState<PendingCentralAlert | null>(null);
  const [centralAlertSending, setCentralAlertSending] = useState(false);
  const lastAssistantDraftIdRef = useRef<string | null>(null);
  const lastAssistantDispatchDraftIdRef = useRef<string | null>(null);

  const getZoneLabel = (zone: any): string => {
    const p = zone?.properties || {};
    return String(
      p.controlPanelLabel ||
      p.localityName ||
      p.localityCode ||
      p.NAME_3 ||
      p.NAME_2 ||
      p.hexId ||
      'Zone'
    );
  };

  const getZoneIdentity = (zone: any): string => {
    const p = zone?.properties || {};
    return String(p.controlPanelKey || p.localityCode || p.hexId || getZoneLabel(zone));
  };

  const inferRiskLevel = (zone: any): 'critical' | 'high' | 'moderate' | 'low' => {
    const raw = String(
      zone?.properties?.dangerLevel ||
      zone?.properties?.severity ||
      zone?.properties?.riskBand ||
      ''
    ).toLowerCase();

    if (raw.includes('critical') || raw.includes('extreme')) return 'critical';
    if (raw.includes('high') || raw.includes('severe')) return 'high';
    if (raw.includes('moderate') || raw.includes('medium') || raw.includes('warning')) return 'moderate';
    return 'low';
  };

  const inferHazardType = (zone: any): string => {
    const raw = String(
      zone?.properties?.hazardType ||
      zone?.properties?.hazard_type ||
      zone?.properties?.category ||
      'cyclone'
    ).toLowerCase();

    if (raw.includes('flood')) return 'flood';
    if (raw.includes('landslide')) return 'landslide';
    if (raw.includes('storm') || raw.includes('cyclone')) return 'cyclone';
    return raw || 'cyclone';
  };

  const getResourceProfile = (resourceName: string, dispatchTeamsReady: number) => {
    if (resourceName === 'Rescue Boats') {
      return {
        kind: 'boat',
        capacity_people: 18,
        max_payload_kg: 1200,
        flood_depth_range_m: '0.5-3.0',
        crew_required: 3,
      };
    }
    if (resourceName === 'Ambulance Vans') {
      return {
        kind: 'ambulance',
        stretcher_capacity: 2,
        seated_capacity: 4,
        medics_required: 2,
        oxygen_support: true,
      };
    }
    if (resourceName === 'Helicopter Lift') {
      return {
        kind: 'helicopter',
        payload_kg: 900,
        evac_capacity_people: 6,
        medevac_ready: true,
        sortie_window_min: 35,
      };
    }
    if (resourceName === 'Off-road Trucks') {
      return {
        kind: 'truck',
        cargo_capacity_kg: 2500,
        seats_people: 12,
        terrain: 'mud and debris',
        crew_required: 2,
      };
    }
    if (resourceName === 'Rapid Dispatch Teams') {
      return {
        kind: 'team',
        teams_available: dispatchTeamsReady,
        team_size: 6,
        specialties: ['search', 'first-aid', 'crowd-control'],
        shift_window_hours: 8,
      };
    }

    return {
      kind: 'medical_supply',
      kit_capacity: 120,
      trauma_kits: 30,
      water_purification_units: 18,
      field_duration_hours: 24,
    };
  };

  const getZoneCircleCenter = (zone: any): [number, number] => {
    const center = zone?.properties?.zoneCircleCenter;
    if (Array.isArray(center) && center.length === 2 && center.every((v: any) => Number.isFinite(Number(v)))) {
      return [Number(center[0]), Number(center[1])];
    }
    const centroid = turf.centroid(zone).geometry.coordinates;
    return [Number(centroid[0]), Number(centroid[1])];
  };

  const buildFallbackDispatchArea = () => {
    try {
      const [west, south, east, north] = turf.bbox(selectedZone as any);
      const center = getZoneCircleCenter(selectedZone);
      return {
        bbox: {
          west: Number(west),
          south: Number(south),
          east: Number(east),
          north: Number(north),
        },
        center: { lat: Number(center[1]), lon: Number(center[0]) },
        polygon: [
          [Number(west), Number(south)],
          [Number(east), Number(south)],
          [Number(east), Number(north)],
          [Number(west), Number(north)],
        ] as [number, number][],
        areaKm2: Math.max(0.1, Number(turf.area(selectedZone as any)) / 1_000_000),
      };
    } catch {
      const center = getZoneCircleCenter(selectedZone);
      const d = 0.01;
      return {
        bbox: {
          west: Number(center[0] - d),
          south: Number(center[1] - d),
          east: Number(center[0] + d),
          north: Number(center[1] + d),
        },
        center: { lat: Number(center[1]), lon: Number(center[0]) },
        polygon: [
          [Number(center[0] - d), Number(center[1] - d)],
          [Number(center[0] + d), Number(center[1] - d)],
          [Number(center[0] + d), Number(center[1] + d)],
          [Number(center[0] - d), Number(center[1] + d)],
        ] as [number, number][],
        areaKm2: 1.2,
      };
    }
  };
  const [dispatchSearch, setDispatchSearch] = useState('');

  const selectedZoneLabel = useMemo(() => getZoneLabel(selectedZone), [selectedZone]);
  const selectedZoneIdentity = useMemo(() => getZoneIdentity(selectedZone), [selectedZone]);

  const contextZoneList = useMemo(() => {
    const zones = Array.isArray(contextZones) && contextZones.length > 0 ? contextZones : [selectedZone];
    return zones.filter((z: any) => !!z?.geometry);
  }, [contextZones, selectedZone]);

  const adjacentZones = useMemo(
    () => contextZoneList.filter((z: any) => getZoneIdentity(z) !== selectedZoneIdentity),
    [contextZoneList, selectedZoneIdentity],
  );

  const adjacentZoneLabels = useMemo(
    () => adjacentZones.map((z: any) => getZoneLabel(z)).slice(0, 8),
    [adjacentZones],
  );

  const disseminationGeo = useMemo(() => {
    if (!contextZoneList.length) return null;

    try {
      const fc = turf.featureCollection(contextZoneList as any);
      const [west, south, east, north] = turf.bbox(fc as any);
      const centroid = turf.centroid(fc as any).geometry.coordinates;
      const centerPoint = turf.point([Number(centroid[0]), Number(centroid[1])]);
      const corners: [number, number][] = [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ];

      const maxDistanceKm = corners.reduce((maxDist, corner) => {
        const d = turf.distance(centerPoint, turf.point(corner), { units: 'kilometers' });
        return Math.max(maxDist, d);
      }, 0);

      return {
        center: { lat: Number(centroid[1]), lng: Number(centroid[0]) },
        radiusKm: Math.max(2.5, Number((maxDistanceKm * 1.2).toFixed(2))),
        bounds: { west, south, east, north },
      };
    } catch {
      const fallback = getZoneCircleCenter(selectedZone);
      return {
        center: { lat: Number(fallback[1]), lng: Number(fallback[0]) },
        radiusKm: 6,
        bounds: null,
      };
    }
  }, [contextZoneList, selectedZone]);

  // Assign volunteers to NGOs and give them dispatch IDs
  const volunteersWithNGOs = useMemo(() => {
    return volunteers.map((v, i) => {
      // Loop through volunteer data
      const volData = VOLUNTEER_DATA[i % VOLUNTEER_DATA.length];
      const ngo = NGOS.find(n => n.id === volData.ngoId) || NGOS[0];

      return {
        ...v,
        ngo,
        dispatchId: volData.id.toUpperCase().replace('V-', 'DISP-'),
        volunteerDetails: volData
      };
    });
  }, [volunteers]);

  const nearestVolunteerTargets = useMemo(() => {
    if (!disseminationGeo) return [] as Array<any>;

    const centerPoint = turf.point([disseminationGeo.center.lng, disseminationGeo.center.lat]);

    const inAnyContextZone = (lon: number, lat: number) => {
      const point = turf.point([lon, lat]);
      return contextZoneList.some((zone: any) => {
        try {
          return turf.booleanPointInPolygon(point as any, zone as any);
        } catch {
          return false;
        }
      });
    };

    return volunteersWithNGOs
      .map((v: any) => {
        const parsed = extractPointLonLat(v);
        if (!parsed) return null;
        const distanceKm = turf.distance(centerPoint, turf.point([parsed.lon, parsed.lat]), { units: 'kilometers' });
        const matchesContext = inAnyContextZone(parsed.lon, parsed.lat);

        return {
          ...v,
          distanceKm,
          matchesContext,
        };
      })
      .filter((v: any) => Boolean(v) && (v.matchesContext || v.distanceKm <= disseminationGeo.radiusKm + 1.5))
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
      .slice(0, 8);
  }, [volunteersWithNGOs, contextZoneList, disseminationGeo]);

  const disseminationPeripherySummary = useMemo(() => {
    if (!disseminationGeo) return '';
    const adjacencyText = adjacentZoneLabels.length
      ? `Adjacent zones: ${adjacentZoneLabels.join(', ')}`
      : 'No adjacent zones in current context';
    const boundsText = disseminationGeo.bounds
      ? `BBox W:${disseminationGeo.bounds.west.toFixed(4)} S:${disseminationGeo.bounds.south.toFixed(4)} E:${disseminationGeo.bounds.east.toFixed(4)} N:${disseminationGeo.bounds.north.toFixed(4)}`
      : 'BBox unavailable';

    return [
      `Primary zone: ${selectedZoneLabel}`,
      adjacencyText,
      `Alert radius: ${disseminationGeo.radiusKm.toFixed(2)} km`,
      boundsText,
    ].join(' | ');
  }, [disseminationGeo, adjacentZoneLabels, selectedZoneLabel]);

  useEffect(() => {
    const draft = assistantCentralAlertDraft;
    if (!draft?.requestId) return;
    if (lastAssistantDraftIdRef.current === draft.requestId) return;
    lastAssistantDraftIdRef.current = draft.requestId;

    if (!disseminationGeo) {
      onRouteIssue?.('Unable to prepare AI central alert preview: dissemination geometry unavailable.');
      onAssistantCentralAlertDraftConsumed?.(draft.requestId);
      return;
    }

    const volunteerTags = nearestVolunteerTargets.map((v: any) => `${v.dispatchId} (${v.distanceKm.toFixed(1)}km)`);
    const baseMessage = String(draft.message || '').trim();
    const message = baseMessage.startsWith('[Central Alert Response]')
      ? baseMessage
      : `[Central Alert Response]\n${baseMessage}`;

    setPendingCentralAlert({
      eventId: `central-ai-${Date.now()}`,
      message,
      targetZone: selectedZoneLabel,
      adjacentZones: adjacentZoneLabels,
      targetVolunteers: volunteerTags,
      center: disseminationGeo.center,
      radiusKm: disseminationGeo.radiusKm,
    });
    setViewMode('action_dissemination');
    onRouteIssue?.('AI central alert preview prepared. Review left panel and tap Broadcast.');
    onAssistantCentralAlertDraftConsumed?.(draft.requestId);
  }, [
    assistantCentralAlertDraft,
    disseminationGeo,
    nearestVolunteerTargets,
    selectedZoneLabel,
    adjacentZoneLabels,
    onRouteIssue,
    onAssistantCentralAlertDraftConsumed,
  ]);

  const handleGenerateActionDissemination = async () => {
    if (!selectedZone) {
      setDisseminationError('Select a target zone first.');
      return;
    }

    setDisseminationLoading(true);
    setDisseminationError(null);
    setPendingCentralAlert(null);

    try {
      const nearestVolunteerSummary = nearestVolunteerTargets.map((v: any) => {
        const skillSummary = Array.isArray(v?.volunteerDetails?.skills)
          ? v.volunteerDetails.skills.slice(0, 2).join('/')
          : 'field';
        return `${v.dispatchId} (${v.volunteerDetails?.name || 'Volunteer'}; ${v.distanceKm.toFixed(1)}km; ${v.ngo?.name || 'NGO'}; ${skillSummary})`;
      });

      const result = await fetchCopilotDisseminationAction({
        locality_name: selectedZoneLabel,
        district_name: String(
          selectedZone?.properties?.NAME_2 ||
          selectedZone?.properties?.district_name ||
          selectedZone?.properties?.district ||
          'Bangladesh'
        ),
        risk_level: inferRiskLevel(selectedZone),
        hazard_type: inferHazardType(selectedZone),
        ai_enhanced: true,
        adjacent_zone_labels: adjacentZoneLabels,
        periphery_summary: disseminationPeripherySummary,
        nearest_volunteer_summary: nearestVolunteerSummary,
      });

      setDissemination(result);
    } catch (err) {
      setDisseminationError(err instanceof Error ? err.message : 'Failed to generate action message.');
    } finally {
      setDisseminationLoading(false);
    }
  };

  const handlePreviewCentralAlert = () => {
    if (!dissemination || !disseminationGeo) return;

    const eventId = `central-${Date.now()}`;
    const volunteerTags = nearestVolunteerTargets.map((v: any) => `${v.dispatchId} (${v.distanceKm.toFixed(1)}km)`);
    const areaLine = adjacentZoneLabels.length
      ? `${selectedZoneLabel} + adjacent ${adjacentZoneLabels.join(', ')}`
      : selectedZoneLabel;
    const message = `[Central Alert Response] ${dissemination.action.action_text}\nArea: ${areaLine}.\nPriority channels: ${dissemination.action.channels.join(', ')}.`;

    setPendingCentralAlert({
      eventId,
      message,
      targetZone: selectedZoneLabel,
      adjacentZones: adjacentZoneLabels,
      targetVolunteers: volunteerTags,
      center: disseminationGeo.center,
      radiusKm: disseminationGeo.radiusKm,
    });
  };

  const buildAutomationDraft = () => {
    const hasDissemination = Boolean(dissemination?.action?.action_text);
    const pendingMessage = String(pendingCentralAlert?.message || '').trim();
    if (!hasDissemination && !pendingMessage) {
      setDisseminationError('No central alert message available to write into CAP/LoRa options.');
      return null;
    }

    const areaLine = adjacentZoneLabels.length
      ? `${selectedZoneLabel} + adjacent ${adjacentZoneLabels.join(', ')}`
      : selectedZoneLabel;

    const volunteerPhones = nearestVolunteerTargets
      .map((v: any) => String(v?.volunteerDetails?.phone || '').trim())
      .filter((p: string) => p.length > 0);
    const displayPhones = Array.from(new Set(volunteerPhones));
    const displayPhoneCsv = displayPhones.join(', ');
    const primaryPhone = displayPhones[0] || 'N/A';
    const referenceId = pendingCentralAlert?.eventId || `central-${Date.now()}`;
    const instructionSource = hasDissemination
      ? String(dissemination?.action?.action_text || '').trim()
      : pendingMessage.replace(/^\[Central Alert Response\]\s*/i, '').trim();
    const urgency = hasDissemination
      ? String(dissemination?.action?.urgency || 'IMMEDIATE')
      : 'IMMEDIATE';
    const severity = hasDissemination
      ? String(dissemination?.action?.severity || 'HIGH')
      : String(inferRiskLevel(selectedZone)).toUpperCase();
    const channels = hasDissemination
      ? dissemination?.action?.channels || ['SMS', 'LoRa']
      : ['SMS', 'LoRa'];

    const capMessage = [
      '[Central Alert Response]',
      `Ref: ${referenceId}`,
      `Area: ${areaLine}`,
      `Urgency: ${urgency} | Severity: ${severity}`,
      `Channels: ${channels.join(', ')}`,
      `Instruction: ${instructionSource}`,
      `Primary recipient: ${primaryPhone}`,
    ].join('\n');

    const loraPayload = (`[CENTRAL ALERT] ${instructionSource}`).replace(/\s+/g, ' ').trim().slice(0, 80);

    return {
      phone: displayPhoneCsv,
      message: capMessage,
      loraPayload,
      loraMessageType: 'CUSTOM',
    };
  };

  const handleWriteIntoCapOption = () => {
    if (!onWriteToCapOption) {
      setDisseminationError('CAP panel handoff is currently unavailable.');
      return;
    }

    const draft = buildAutomationDraft();
    if (!draft) return;

    onWriteToCapOption(draft);
    setPendingCentralAlert(null);
  };

  const handleWriteIntoLoRaOption = () => {
    if (!onWriteToLoRaOption) {
      setDisseminationError('LoRa panel handoff is currently unavailable.');
      return;
    }

    const draft = buildAutomationDraft();
    if (!draft) return;

    onWriteToLoRaOption(draft);

    setPendingCentralAlert(null);
  };

  const sendCentralAlertWebSocket = async (payload: Record<string, unknown>) => {
    const wsUrl = `${getWsBaseUrl()}/ws/telemetry`;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch { /* no-op */ }
        reject(new Error('Central alert dispatch timed out.'));
      }, 5000);

      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        try { socket.close(); } catch { /* no-op */ }
        resolve();
      };

      const finishError = (message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        try { socket.close(); } catch { /* no-op */ }
        reject(new Error(message));
      };

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify(payload));
          window.setTimeout(finishSuccess, 120);
        } catch {
          finishError('Failed to send central alert payload.');
        }
      };

      socket.onerror = () => finishError('Central alert websocket error.');
      socket.onclose = () => {
        if (!settled) finishError('Central alert websocket closed before dispatch.');
      };
    });
  };

  const handleSendCentralAlert = async () => {
    if (!pendingCentralAlert) return;

    setCentralAlertSending(true);
    try {
      await sendCentralAlertWebSocket({
        type: 'admin_central_alert',
        event_id: pendingCentralAlert.eventId,
        message: pendingCentralAlert.message,
        target_zone: pendingCentralAlert.targetZone,
        target_volunteers: pendingCentralAlert.targetVolunteers,
        center: pendingCentralAlert.center,
        radius_km: pendingCentralAlert.radiusKm,
      });

      onRouteIssue?.(
        `Central alert sent for ${pendingCentralAlert.targetZone} (${pendingCentralAlert.radiusKm.toFixed(1)} km radius).`,
      );
      setPendingCentralAlert(null);
    } catch (err) {
      onRouteIssue?.(err instanceof Error ? err.message : 'Central alert dispatch failed.');
    } finally {
      setCentralAlertSending(false);
    }
  };

  const ngoCapabilityRows = useMemo(() => {
    return NGOS.map((ngo, idx) => {
      const ngoDispatches = volunteersWithNGOs.filter(v => v.ngo.id === ngo.id);
      const activeAssignments = Math.max(0, Math.floor(ngoDispatches.length * 0.5));
      const dispatchTeamsReady = Math.max(1, ngoDispatches.length - activeAssignments);
      const reinforcementLeft = Math.max(0, 8 - ngoDispatches.length - idx);

      const resources = [
        'Rapid Dispatch Teams',
        idx % 2 === 0 ? 'Rescue Boats' : 'Ambulance Vans',
        idx % 3 === 0 ? 'Helicopter Lift' : 'Off-road Trucks',
        'Medical Supply Units',
      ];

      return {
        ngo,
        dispatchTeamsReady,
        reinforcementLeft,
        activeAssignments,
        resources,
      };
    });
  }, [volunteersWithNGOs]);

  useEffect(() => {
    const draft = assistantDispatchDraft;
    if (!draft?.requestId) return;
    if (lastAssistantDispatchDraftIdRef.current === draft.requestId) return;
    lastAssistantDispatchDraftIdRef.current = draft.requestId;

    const cluster = selectedRescueCluster || lastSelectedCluster || (rescueZones || [])[0] || null;
    if (!cluster) {
      onRouteIssue?.('Unable to prepare AI NGO dispatch preview: no rescue cluster is available.');
      onAssistantDispatchDraftConsumed?.(draft.requestId);
      return;
    }

    const preferredNgo = ngoCapabilityRows.find((row) =>
      draft.message.toLowerCase().includes(row.ngo.name.toLowerCase()),
    );
    const selectedRow = preferredNgo || ngoCapabilityRows.slice().sort((a, b) => b.dispatchTeamsReady - a.dispatchTeamsReady)[0];
    if (!selectedRow) {
      onRouteIssue?.('Unable to prepare AI NGO dispatch preview: NGO capability matrix is unavailable.');
      onAssistantDispatchDraftConsumed?.(draft.requestId);
      return;
    }

    const resourceName = selectedRow.resources.includes('Rapid Dispatch Teams')
      ? 'Rapid Dispatch Teams'
      : selectedRow.resources[0];

    const area = selectedDispatchArea || buildFallbackDispatchArea();
    const generatedDispatch: PendingDispatch = {
      ngoId: selectedRow.ngo.id,
      ngoName: selectedRow.ngo.name,
      resourceName,
      resourceProfile: {
        ...getResourceProfile(resourceName, selectedRow.dispatchTeamsReady),
        ai_plan: draft.message,
      },
      dispatchTeamsReady: selectedRow.dispatchTeamsReady,
      reinforcementLeft: selectedRow.reinforcementLeft,
      activeAssignments: selectedRow.activeAssignments,
      selectedClusterId: normalizeClusterId(cluster?.id),
      selectedClusterSeverity: String(cluster?.severity || 'moderate').toUpperCase(),
      selectedClusterAgents: Number(cluster?.agent_count || 0),
      area,
    };

    setLastSelectedCluster(cluster);
    setResourcePickerNgoId(null);
    setPendingDispatch(generatedDispatch);
    setViewMode('cluster_actions');
    onRouteIssue?.('AI NGO dispatch preview prepared. Review left panel and tap Broadcast.');
    onAssistantDispatchDraftConsumed?.(draft.requestId);
  }, [
    assistantDispatchDraft,
    selectedRescueCluster,
    lastSelectedCluster,
    rescueZones,
    ngoCapabilityRows,
    selectedDispatchArea,
    onRouteIssue,
    onAssistantDispatchDraftConsumed,
  ]);

  const filteredNGOs = useMemo(() => {
    // Only show NGOs that have dispatches in the current zone
    return NGOS.filter(ngo => 
      volunteersWithNGOs.some(v => v.ngo.id === ngo.id)
    );
  }, [volunteersWithNGOs]);

  const currentNGODispatches = useMemo(() => {
    if (!selectedNGO) return [];
    return volunteersWithNGOs.filter(v => v.ngo.id === selectedNGO.id);
  }, [selectedNGO, volunteersWithNGOs]);

  const handleOrgClick = (ngo: NGO) => {
    onOptionSelected?.();
    setSelectedNGO(ngo);
    setViewMode('dispatch_list');
  };

  const handleDispatchClick = async (dispatch: any) => {
    onRouteIssue?.(null);
    const parsed = extractPointLonLat(dispatch);
    if (!parsed) {
      onRouteSelect(null);
      onRouteIssue?.('Selected dispatch point has invalid coordinates.');
      return;
    }

    onPointSelect(dispatch);
    onRouteSelect(null);

    try {
      const center = getZoneCircleCenter(selectedZone);
      const start_lon = center[0];
      const start_lat = center[1];
      const end_lon = parsed.lon;
      const end_lat = parsed.lat;

      // Add 6-second timeout
      const routeTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Route computation timeout')), 6000)
      );

      const data = await Promise.race([
        fetchBestRoute(
          { lon: start_lon, lat: start_lat },
          { lon: end_lon, lat: end_lat },
          'astar'
        ),
        routeTimeoutPromise
      ]);
      
      if (data?.route) {
        onRouteSelect(data.route);
        onRouteIssue?.(null);
        return;
      }
      if (data?.error) {
        onRouteIssue?.(data.error);
      }

      onRouteIssue?.('No connected road route found for this dispatch target.');
    } catch (err) {
      console.error('Failed to fetch dispatch route:', err);
      onRouteIssue?.('Route service is currently unavailable. Please try again.');
    }
  };

  const handleBack = () => {
    if (viewMode === 'dispatch_list') {
      setViewMode('org_list');
      setSelectedNGO(null);
    } else if (viewMode === 'cluster_actions') {
      setViewMode('clusters');
    } else {
      setViewMode('menu');
    }
  };

  const handleClusterClick = (cluster: any) => {
    onOptionSelected?.();
    onSelectRescueCluster(normalizeClusterId(cluster?.id));
    onToggleRescueClusters(true);
    setViewMode('cluster_actions');
  };

  const handleAssignNGO = (ngoId: string) => {
    onOptionSelected?.();
    setResourcePickerNgoId((prev) => (prev === ngoId ? null : ngoId));
  };

  const handleAssignResource = (row: any, resource: string) => {
    if (!displayedCluster) {
      onRouteIssue?.('Select a rescue cluster first.');
      return;
    }
    if (!selectedDispatchArea) {
      onRouteIssue?.('Draw a dispatch area on the map using Marquee mode before assigning resources.');
      return;
    }

    const resourceProfile = getResourceProfile(resource, row.dispatchTeamsReady);

    const draft: PendingDispatch = {
      ngoId: row.ngo.id,
      ngoName: row.ngo.name,
      resourceName: resource,
      resourceProfile,
      dispatchTeamsReady: row.dispatchTeamsReady,
      reinforcementLeft: row.reinforcementLeft,
      activeAssignments: row.activeAssignments,
      selectedClusterId: normalizeClusterId(displayedCluster?.id),
      selectedClusterSeverity: String(displayedCluster?.severity || 'moderate').toUpperCase(),
      selectedClusterAgents: Number(displayedCluster?.agent_count || 0),
      area: selectedDispatchArea,
    };

    setPendingDispatch(draft);
    onRouteIssue?.('Dispatch message prepared. Review and click Broadcast to send.');
    setResourcePickerNgoId(null);
  };

  const handleConfirmDispatch = () => {
    if (!pendingDispatch) return;

    onDispatchBroadcast(pendingDispatch);
    onRouteIssue?.(
      `Broadcast sent: ${pendingDispatch.ngoName} (${pendingDispatch.resourceName}) -> Cluster ${pendingDispatch.selectedClusterId} at ${pendingDispatch.area.center.lat.toFixed(4)}, ${pendingDispatch.area.center.lon.toFixed(4)}.`,
    );
    setPendingDispatch(null);
  };

  const handleCancelDispatch = () => {
    setPendingDispatch(null);
    onRouteIssue?.('Dispatch draft cancelled.');
  };

  useEffect(() => {
    if (selectedRescueCluster) {
      setLastSelectedCluster(selectedRescueCluster);
      setViewMode('cluster_actions');
      setResourcePickerNgoId(null);
      setPendingDispatch(null);
    }
  }, [selectedRescueCluster]);

  const displayedCluster = selectedRescueCluster || lastSelectedCluster;

  useEffect(() => {
    setDissemination(null);
    setDisseminationError(null);
    setPendingCentralAlert(null);
  }, [selectedZoneIdentity]);

  if (isCollapsed) {
    return (
      <div className="w-full h-full p-2.5 flex flex-col items-center gap-4 border-r border-white/5 bg-slate-900/40 backdrop-blur">
        <button onClick={onToggleCollapse} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400">
          <ChevronRight size={18} />
        </button>
        <div className="flex flex-col gap-4">
          <button onClick={() => { onOptionSelected?.(); setViewMode('org_list'); }} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Building2 size={20} />
          </button>
          <button onClick={() => { onOptionSelected?.(); setViewMode('clusters'); onToggleRescueClusters(true); }} className="p-2 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">
            <Navigation size={20} />
          </button>
          <button onClick={() => { onOptionSelected?.(); setViewMode('action_dissemination'); }} className="p-2 bg-violet-500/10 text-violet-300 rounded-lg border border-violet-500/20">
            <Zap size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-3 flex flex-col gap-3 border-r border-white/5 bg-slate-900/40 backdrop-blur overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0">
        <h4 className="text-slate-200 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
          <Building2 className="text-emerald-400" size={16} /> NGO Manager
        </h4>
        <button onClick={onToggleCollapse} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400">
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Breadcrumbs / Back */}
      {viewMode !== 'menu' && (
        <button onClick={handleBack} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest shrink-0">
          <ChevronLeft size={14} /> Back to {viewMode === 'dispatch_list' ? 'Organizations' : 'Menu'}
        </button>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4">
        {viewMode === 'menu' && (
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => {
                onOptionSelected?.();
                setViewMode('org_list');
              }}
              className="w-full flex items-center gap-3 p-3 bg-slate-950/80 border border-white/5 rounded-xl hover:bg-slate-900 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users size={20} />
              </div>
              <div className="text-left">
                <span className="block text-xs font-bold text-white uppercase tracking-wider">NGO Lists</span>
                <span className="text-[10px] text-slate-500 font-medium">Manage deployed organizations</span>
              </div>
              <ChevronRight size={16} className="ml-auto text-slate-600" />
            </button>

            <button 
              onClick={() => {
                onOptionSelected?.();
                setViewMode('clusters');
                onToggleRescueClusters(true);
              }}
              className="w-full flex items-center gap-3 p-3 bg-slate-950/80 border border-white/5 rounded-xl hover:bg-slate-900 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Navigation size={20} />
              </div>
              <div className="text-left">
                <span className="block text-xs font-bold text-white uppercase tracking-wider">Rescue Clusters</span>
                <span className="text-[10px] text-slate-500 font-medium">Live cluster rectangles for dispatch planning</span>
              </div>
              <ChevronRight size={16} className="ml-auto text-slate-600" />
            </button>

            <button
              onClick={() => {
                onOptionSelected?.();
                setViewMode('action_dissemination');
              }}
              className="w-full flex items-center gap-3 p-3 bg-slate-950/80 border border-white/5 rounded-xl hover:bg-slate-900 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 text-violet-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap size={20} />
              </div>
              <div className="text-left">
                <span className="block text-xs font-bold text-white uppercase tracking-wider">Action-to-Dissemination</span>
                <span className="text-[10px] text-slate-500 font-medium">Generate and push central AI alert to nearby volunteers</span>
              </div>
              <ChevronRight size={16} className="ml-auto text-slate-600" />
            </button>
          </div>
        )}

        {viewMode === 'action_dissemination' && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Target Scope</div>
              <div className="text-sm font-black text-white mt-1">{selectedZoneLabel}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                Adjacent zones: {adjacentZoneLabels.length > 0 ? adjacentZoneLabels.join(', ') : 'None'}
              </div>
              {disseminationGeo && (
                <div className="text-[10px] text-slate-400 mt-1">
                  Broadcast center: {disseminationGeo.center.lat.toFixed(4)}, {disseminationGeo.center.lng.toFixed(4)} • Radius {disseminationGeo.radiusKm.toFixed(2)} km
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Nearest Volunteer Targets</div>
              {nearestVolunteerTargets.length === 0 ? (
                <div className="text-[10px] text-amber-300">No nearby volunteers found for selected + adjacent zones.</div>
              ) : (
                <div className="space-y-1.5">
                  {nearestVolunteerTargets.slice(0, 6).map((v: any) => (
                    <div key={v.dispatchId} className="text-[10px] text-slate-300 bg-slate-900/70 border border-white/5 rounded px-2 py-1">
                      {v.dispatchId} • {v.volunteerDetails?.name || 'Volunteer'} • {v.distanceKm.toFixed(1)} km
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!dissemination && !disseminationLoading && (
              <button
                onClick={handleGenerateActionDissemination}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-200 font-bold uppercase text-[11px] tracking-widest hover:bg-violet-600/30 transition-colors"
              >
                <Zap size={14} /> Generate Action
              </button>
            )}

            {disseminationLoading && (
              <div className="p-3 rounded-xl bg-violet-900/20 border border-violet-500/40 text-violet-200 text-xs">
                Generating action instructions for selected and adjacent zones...
              </div>
            )}

            {disseminationError && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-500/40 text-red-200 text-xs">
                {disseminationError}
              </div>
            )}

            {dissemination && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-violet-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">AI Action Message</div>
                  <div className="text-[10px] px-2 py-0.5 rounded border border-violet-500/40 text-violet-200 bg-violet-900/20 uppercase">
                    {dissemination.action.urgency}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400">
                  Severity: {dissemination.action.severity} • Channels: {dissemination.action.channels.join(', ')}
                </div>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line bg-slate-900/60 border border-white/5 rounded p-2">
                  {dissemination.action.action_text}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePreviewCentralAlert}
                    className="col-span-2 text-[10px] font-bold uppercase px-3 py-2 rounded border bg-cyan-500/15 text-cyan-200 border-cyan-400/40"
                  >
                    Preview Alert
                  </button>
                  <button
                    onClick={handleWriteIntoCapOption}
                    className="text-[9px] leading-tight font-bold uppercase px-2 py-2 rounded border bg-orange-500/15 text-orange-300 border-orange-400/40 whitespace-normal"
                  >
                    Write into CAP Option
                  </button>
                  <button
                    onClick={handleWriteIntoLoRaOption}
                    className="text-[9px] leading-tight font-bold uppercase px-2 py-2 rounded border bg-purple-500/15 text-purple-300 border-purple-400/40 whitespace-normal"
                  >
                    Write into LoRa Option
                  </button>
                  <button
                    onClick={handleGenerateActionDissemination}
                    className="col-span-2 text-[10px] font-bold uppercase px-3 py-2 rounded border bg-slate-800 text-slate-300 border-slate-700"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'clusters' && (
          <div className="flex flex-col gap-2">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cluster Overlay</span>
                <button
                  onClick={() => onToggleRescueClusters(!showRescueClusters)}
                  className={`text-[10px] font-bold px-2 py-1 rounded ${showRescueClusters ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}
                >
                  {showRescueClusters ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {(rescueZones || []).length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs italic">No rescue clusters detected yet.</div>
            ) : (
              (rescueZones || []).map((cluster: any) => (
                <button
                  key={normalizeClusterId(cluster?.id)}
                  onClick={() => handleClusterClick(cluster)}
                  className="w-full text-left p-3 bg-slate-950/70 border border-white/5 rounded-xl hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Cluster {normalizeClusterId(cluster?.id)}</span>
                    <span className="text-[10px] text-slate-400">Agents: {cluster.agent_count || 0}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Severity: {String(cluster.severity || 'moderate')}</div>
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === 'cluster_actions' && displayedCluster && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Selected Cluster</div>
              <div className="text-sm font-black text-white mt-1">{normalizeClusterId(displayedCluster?.id)}</div>
              <div className="text-[10px] text-slate-400 mt-1">Severity: {String(displayedCluster?.severity || 'moderate').toUpperCase()} | Distress agents: {displayedCluster?.agent_count || 0}</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Dispatch Area</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => onToggleMarquee(!isMarqueeEnabled)}
                  className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${isMarqueeEnabled ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-blue-500/15 text-blue-300 border-blue-500/30'}`}
                >
                  {isMarqueeEnabled ? 'Marquee ON' : 'Start Marquee'}
                </button>
                <button
                  onClick={onClearDispatchArea}
                  className="text-[10px] font-bold uppercase px-2 py-1 rounded border bg-slate-800 text-slate-300 border-slate-700"
                >
                  Clear Area
                </button>
              </div>
              {selectedDispatchArea ? (
                <div className="text-[10px] text-slate-400 mt-2">
                  Center: {selectedDispatchArea.center.lat.toFixed(4)}, {selectedDispatchArea.center.lon.toFixed(4)} | Area: {selectedDispatchArea.areaKm2.toFixed(2)} km2
                </div>
              ) : (
                <div className="text-[10px] text-amber-300/90 mt-2">Draw a rectangle on the map to define dispatch coordinates.</div>
              )}
            </div>

            <div className="space-y-2">
              <h6 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1">Possible Actions</h6>
              {ngoCapabilityRows.map((row) => (
                <div key={row.ngo.id} className="p-3 rounded-xl bg-slate-950/70 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white uppercase tracking-tight">{row.ngo.name}</div>
                    <button
                      onClick={() => handleAssignNGO(row.ngo.id)}
                      className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    >
                      {resourcePickerNgoId === row.ngo.id ? 'Cancel' : 'Assign'}
                    </button>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">Dispatch teams ready: {row.dispatchTeamsReady} | Active duties: {row.activeAssignments}</div>
                  <div className="text-[10px] text-slate-400">Reinforcements left: {row.reinforcementLeft}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Resources: {row.resources.join(', ')}</div>

                  {resourcePickerNgoId === row.ngo.id && (
                    <div className="mt-2 p-2 rounded-lg bg-slate-900/70 border border-white/5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Choose Resource To Assign</div>
                      <div className="flex flex-wrap gap-1.5">
                        {row.resources.map((resource: string) => (
                          <button
                            key={`${row.ngo.id}-${resource}`}
                            onClick={() => handleAssignResource(row, resource)}
                            className="text-[9px] font-bold uppercase px-2 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                          >
                            {resource}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'org_list' && (
          <div className="flex flex-col gap-2">
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search Organizations..." 
                className="w-full bg-slate-950/50 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-[11px] focus:outline-none focus:border-emerald-500/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {filteredNGOs.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs italic">No organizations active in this zone.</div>
            ) : (
              filteredNGOs
                .filter(ngo => ngo.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(ngo => (
                <button 
                  key={ngo.id}
                  onClick={() => handleOrgClick(ngo)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-950/80 border border-white/5 rounded-xl hover:bg-slate-900 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-${ngo.color}-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]`} />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{ngo.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      {volunteersWithNGOs.filter(v => v.ngo.id === ngo.id).length}
                    </span>
                    <ChevronRight size={14} className="text-slate-600" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === 'dispatch_list' && selectedNGO && (
          <div className="flex flex-col gap-3">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selected NGO</span>
              <h5 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-${selectedNGO.color}-500`} />
                {selectedNGO.name}
              </h5>
            </div>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search dispatches..." 
                className="w-full bg-slate-950/50 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-[11px] focus:outline-none focus:border-emerald-500/50"
                value={dispatchSearch}
                onChange={(e) => setDispatchSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <h6 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1">Active Dispatch IDs ({currentNGODispatches.filter(v => v.dispatchId.toLowerCase().includes(dispatchSearch.toLowerCase())).length})</h6>
              {currentNGODispatches.filter(v => v.dispatchId.toLowerCase().includes(dispatchSearch.toLowerCase())).map((v, i) => (
                <button 
                  key={i}
                  onClick={() => handleDispatchClick(v)}
                  className="w-full text-left bg-slate-950/50 hover:bg-slate-800 border border-slate-800/50 rounded-lg p-3 transition-colors flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/20 transition-colors font-bold text-xs uppercase tracking-tighter">
                    {v.dispatchId.split('-')[1]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-slate-200 font-bold text-[11px] truncate uppercase tracking-tight">
                        {v.volunteerDetails.name}
                      </p>
                      <Navigation size={12} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-slate-500 font-mono">
                        {v.dispatchId} | {Number.isFinite(Number(v?.properties?.defaultDistance)) ? Number(v.properties.defaultDistance).toFixed(2) : 'N/A'} km
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-mono">
                        {v.volunteerDetails.phone}
                      </span>
                      {v.volunteerDetails.skills.map((skill: string, idx: number) => (
                        <span key={idx} className="text-[8px] bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-3 border-t border-white/5">
        <p className="text-[9px] text-slate-600 italic text-center uppercase tracking-widest">NGO Logistics Management</p>
      </div>

      {pendingDispatch && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] z-40 flex items-end p-3">
          <div className="w-full rounded-xl border border-cyan-500/40 bg-slate-900/95 shadow-2xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Dispatch Message Preview</div>
            <div className="mt-2 text-xs text-slate-200 font-bold">
              {pendingDispatch.ngoName} • {pendingDispatch.resourceName}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Cluster {pendingDispatch.selectedClusterId} ({pendingDispatch.selectedClusterSeverity}) • Agents {pendingDispatch.selectedClusterAgents}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Area center: {pendingDispatch.area.center.lat.toFixed(4)}, {pendingDispatch.area.center.lon.toFixed(4)} • {pendingDispatch.area.areaKm2.toFixed(2)} km2
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Teams ready: {pendingDispatch.dispatchTeamsReady} • Reinforcements: {pendingDispatch.reinforcementLeft} • Active duties: {pendingDispatch.activeAssignments}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 break-words">
              Params: {Object.entries(pendingDispatch.resourceProfile).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : String(v)}`).join('; ')}
            </div>
            <div className="mt-3 flex items-center gap-2 justify-end">
              <button
                onClick={handleCancelDispatch}
                className="text-[10px] font-bold uppercase px-3 py-1 rounded border bg-slate-800 text-slate-300 border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDispatch}
                className="text-[10px] font-bold uppercase px-3 py-1 rounded border bg-cyan-500/20 text-cyan-200 border-cyan-400/40"
              >
                Broadcast
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCentralAlert && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] z-40 flex items-end p-3">
          <div className="w-full rounded-xl border border-violet-500/40 bg-slate-900/95 shadow-2xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">Action-to-Dissemination Preview</div>
            <div className="mt-2 text-xs text-slate-200 font-bold">
              {pendingCentralAlert.targetZone}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Adjacent: {pendingCentralAlert.adjacentZones.length > 0 ? pendingCentralAlert.adjacentZones.join(', ') : 'None'}
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              Center: {pendingCentralAlert.center.lat.toFixed(4)}, {pendingCentralAlert.center.lng.toFixed(4)} • Radius: {pendingCentralAlert.radiusKm.toFixed(2)} km
            </div>
            <div className="mt-2 text-[10px] text-slate-300 bg-slate-900/70 border border-white/5 rounded p-2 whitespace-pre-line">
              {pendingCentralAlert.message}
            </div>
            <div className="mt-2 text-[10px] text-slate-500 break-words">
              Recipients: {pendingCentralAlert.targetVolunteers.length > 0 ? pendingCentralAlert.targetVolunteers.join('; ') : 'Dynamic nearby volunteers'}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={handleWriteIntoCapOption}
                disabled={centralAlertSending}
                className="w-full min-h-[34px] text-[9px] leading-tight font-bold uppercase px-2 py-2 rounded border bg-orange-500/20 text-orange-200 border-orange-400/40 disabled:opacity-60 whitespace-normal"
              >
                Write into CAP Option
              </button>
              <button
                onClick={handleWriteIntoLoRaOption}
                disabled={centralAlertSending}
                className="w-full min-h-[34px] text-[9px] leading-tight font-bold uppercase px-2 py-2 rounded border bg-purple-500/20 text-purple-200 border-purple-400/40 disabled:opacity-60 whitespace-normal"
              >
                Write into LoRa Option
              </button>
              <button
                onClick={() => setPendingCentralAlert(null)}
                disabled={centralAlertSending}
                className="w-full min-h-[34px] text-[10px] font-bold uppercase px-3 py-2 rounded border bg-slate-800 text-slate-300 border-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSendCentralAlert}
                disabled={centralAlertSending}
                className="w-full min-h-[34px] text-[10px] font-bold uppercase px-3 py-2 rounded border bg-violet-500/20 text-violet-200 border-violet-400/40 disabled:opacity-60 flex items-center justify-center gap-1"
              >
                <Radio size={11} /> {centralAlertSending ? 'Sending...' : 'Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NGOManager;
