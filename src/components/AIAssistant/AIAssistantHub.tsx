import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  Sparkles, 
  X, 
  Send, 
  MessageCircle, 
  Info, 
  Wifi, 
  Navigation,
  ChevronRight,
  AlertTriangle,
  Zap,
  Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useLoRaStore } from '../../store/useLoRaStore';
import { useTelemetryStore, type VolunteerSOS } from '../../store/useTelemetryStore';
import { findNearestMeshNode, getSituationalSummary, generateInsights } from '../../lib/aiIntelligence';
import { apiUrl, getWsBaseUrl } from '../../config/api';
import { fetchBestRoute } from '../../services/mapDataAccess';
import * as turf from '@turf/turf';

interface ControlPanelContext {
  selectedZone?: any | null;
  impactedInfra?: {
    schools: any[];
    hospitals: any[];
    mosques: any[];
    shelters: any[];
    volunteers: any[];
  } | null;
  focusedPoint?: any | null;
  focusedRoute?: any | null;
  onRouteGenerated?: (route: any | null, destinationName: string, destinationPoint?: any | null) => void;
  onRouteIssue?: (message: string | null) => void;
  onCentralAlertPreview?: (message: string) => void;
  onCapDispatchPreview?: (message: string) => void;
  onTopNgoDispatchPreview?: (message: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PresetPrompt {
  id: string;
  label: string;
  prompt: string;
  description: string;
  actionType?: 'central_alert' | 'cap_dispatch' | 'top_ngo_dispatch';
}

interface SubmitMessageOptions {
  presetId?: string;
  presetActionType?: 'central_alert' | 'cap_dispatch' | 'top_ngo_dispatch';
}

type InfraIntentCategory = 'schools' | 'hospitals' | 'shelters' | 'mosques';
type SosModerationAction = 'approve' | 'reject';

interface SosModerationIntent {
  action: SosModerationAction;
  targets: VolunteerSOS[];
  scope: 'all' | 'explicit' | 'priority';
}

const ASSISTANT_GREETING = 'I am your nirapotta AI Assistant. How can I help you coordinate the cyclone response today?';
const FAQ_PROMPT = 'Provide a short FAQ for the current situation: include top 4 questions and concise action-focused answers for operators.';
const CHAT_SESSION_STORAGE_KEY = 'resilienceai_ai_chat_session_id';

const SOS_APPROVE_PATTERN = /\b(approve|approved|accept)\b/i;
const SOS_REJECT_PATTERN = /\b(reject|rejected|decline|deny)\b/i;
const SOS_ALL_PATTERN = /\b(all|every|each)\b/i;

const INFRA_INTENT_PATTERNS: Array<{ category: InfraIntentCategory; pattern: RegExp }> = [
  { category: 'schools', pattern: /\b(nearest|closest|nearby)\s+(school|schools)\b/i },
  { category: 'schools', pattern: /\b(show|find|locate|highlight)\s+.*\b(school|schools)\b/i },
  { category: 'hospitals', pattern: /\b(nearest|closest|nearby)\s+(hospital|hospitals|health\s*facility|health\s*facilities)\b/i },
  { category: 'shelters', pattern: /\b(nearest|closest|nearby)\s+(shelter|shelters)\b/i },
  { category: 'mosques', pattern: /\b(nearest|closest|nearby)\s+(mosque|mosques)\b/i },
];

const INFRA_LABEL: Record<InfraIntentCategory, string> = {
  schools: 'school',
  hospitals: 'hospital',
  shelters: 'shelter',
  mosques: 'mosque',
};

const parseNearestInfraIntent = (text: string): InfraIntentCategory | null => {
  for (const { category, pattern } of INFRA_INTENT_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return null;
};

const extractPointLonLat = (feature: any): { lon: number; lat: number } | null => {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon, lat };
};

const pointName = (feature: any, fallback: string) => {
  return String(feature?.properties?.name || feature?.properties?.NAME || fallback);
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const rankSosQueueByPriority = (queue: VolunteerSOS[]): VolunteerSOS[] => {
  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...queue].sort((a, b) => {
    const sa = String(a?.sos_details?.severity_level || '').toLowerCase();
    const sb = String(b?.sos_details?.severity_level || '').toLowerCase();
    const ra = severityRank[sa] || 0;
    const rb = severityRank[sb] || 0;
    if (rb !== ra) return rb - ra;
    return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  });
};

const parseSosModerationIntent = (text: string, queue: VolunteerSOS[]): SosModerationIntent | null => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const wantsApprove = SOS_APPROVE_PATTERN.test(normalized);
  const wantsReject = SOS_REJECT_PATTERN.test(normalized);
  if (wantsApprove === wantsReject) return null;

  const action: SosModerationAction = wantsApprove ? 'approve' : 'reject';
  const mentionsSos = /\bsos\b/i.test(normalized);

  const matchedByEventId = queue.filter((s) => normalized.includes(String(s.event_id).toLowerCase()));
  const matchedByCode = queue.filter((s) => {
    const code = String(s?.sos_details?.code || '').trim();
    if (!code) return false;
    return new RegExp(`\\b${escapeRegExp(code.toLowerCase())}\\b`, 'i').test(normalized);
  });

  const explicitMap = new Map<string, VolunteerSOS>();
  [...matchedByEventId, ...matchedByCode].forEach((item) => {
    explicitMap.set(item.event_id, item);
  });
  const explicitTargets = Array.from(explicitMap.values());
  const hasExplicitTarget = explicitTargets.length > 0;

  const isLikelyQuestion = normalized.includes('?') && /\b(should|would|could|can|what|why|when|which)\b/i.test(normalized);
  const startsWithDirective = /^(please\s+)?(approve|accept|reject|decline|deny)\b/i.test(normalized);

  if (!mentionsSos && !hasExplicitTarget) return null;
  if (isLikelyQuestion && !startsWithDirective && !hasExplicitTarget) return null;

  if (!queue.length) {
    return { action, targets: [], scope: 'priority' };
  }

  if (SOS_ALL_PATTERN.test(normalized) && mentionsSos) {
    return { action, targets: rankSosQueueByPriority(queue), scope: 'all' };
  }

  if (hasExplicitTarget) {
    return { action, targets: explicitTargets, scope: 'explicit' };
  }

  const prioritized = rankSosQueueByPriority(queue);
  return { action, targets: prioritized.length ? [prioritized[0]] : [], scope: 'priority' };
};

function getOrCreateChatSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';
  const existing = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  if (existing && existing.trim()) return existing;
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
  return id;
}

const markdownComponents = {
  p: ({children}: any) => <p className="mb-1 last:mb-0">{children}</p>,
  ul: ({children}: any) => <ul className="list-disc pl-3 mb-1 space-y-0.5">{children}</ul>,
  ol: ({children}: any) => <ol className="list-decimal pl-3 mb-1 space-y-0.5">{children}</ol>,
  li: ({children}: any) => <li>{children}</li>,
  strong: ({children}: any) => <strong className="font-bold text-white">{children}</strong>,
  code: ({children}: any) => <code className="bg-slate-700/50 px-1 py-0.5 rounded text-[10px] font-mono text-emerald-300 whitespace-pre-wrap break-all">{children}</code>,
};

export default function AIAssistantHub(props: ControlPanelContext) {
  const [sessionId] = useState<string>(() => getOrCreateChatSessionId());
  const [activePanel, setActivePanel] = useState<'chat' | 'insights' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: ASSISTANT_GREETING,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const adminWsRef = useRef<WebSocket | null>(null);

  const timeline = useSimulationStore(s => s.timeline);
  const currentStep = useSimulationStore(s => s.currentStep);
  const zoneStatuses = useSimulationStore(s => s.zoneStatuses);
  const { device } = useLoRaStore();
  const { sosQueue, broadcastedAlerts, stationResponses, removeSosFromQueue } = useTelemetryStore();

  const currentStepData = useMemo(() => timeline[currentStep], [timeline, currentStep]);
  const selectedZoneName = useMemo(
    () =>
      String(
        props.selectedZone?.properties?.localityName ||
          props.selectedZone?.properties?.name ||
          props.selectedZone?.properties?.localityCode ||
          'current selected operational zone',
      ),
    [props.selectedZone],
  );

  const operationPresets = useMemo<PresetPrompt[]>(
    () => [
      {
        id: 'central-alert-active-volunteers',
        label: 'Central Alert',
        description: 'Prepare/send central alert for active volunteers in the selected zone.',
        actionType: 'central_alert',
        prompt:
          `Send Central Alert To Active Volunteers for ${selectedZoneName}. ` +
          'Generate a concise command message, priority level, and target groups. ' +
          'If dispatch-ready, return a final operator confirmation checklist first.',
      },
      {
        id: 'station-response-action',
        label: 'Station Response',
        description: 'Recommend and format a station response action for active incidents.',
        prompt:
          'Station Response Action: analyze active incidents and recommend the best response type ' +
          '(acknowledged, dispatching, need_backup, unable) with short justification and final outbound message text.',
      },
      {
        id: 'top-3-safer-facilities',
        label: 'Top 3 Safer Facilities',
        description: 'Find and rank top safer nearby shelters/hospitals with routing guidance.',
        prompt:
          `Top 3 Safer Facilities near ${selectedZoneName}: rank by safety and accessibility, include distance, ` +
          'facility type, and route recommendation.',
      },
      {
        id: 'comms-health-check',
        label: 'Comms Health Check',
        description: 'Summarize communications posture and fallback actions.',
        prompt:
          'Communications Health Check: summarize mesh readiness, nearest viable node posture, ' +
          'failure risks, and immediate fallback playbook in priority order.',
      },
      {
        id: 'dispatch-top-ngos-selected-area',
        label: 'Top NGOs Dispatch',
        description: 'Build dispatch plan for selected area using strongest NGO resource profiles.',
        actionType: 'top_ngo_dispatch',
        prompt:
          'For the selected dispatch area, show top resourceful NGOs with best available resources and propose ' +
          'a dispatch plan with task assignment priority, team count suggestions, and rationale.',
      },
      {
        id: 'cap-sms-dispatch',
        label: 'CAP SMS Dispatch',
        description: 'Draft CAP-compliant SMS text and delivery-ready payload.',
        actionType: 'cap_dispatch',
        prompt:
          `CAP SMS Dispatch for ${selectedZoneName}: draft one 160-char SMS and one extended CAP message ` +
          'with action instructions and urgency tags.',
      },
    ],
    [selectedZoneName],
  );
  
  // Simulation Context
  const summary = useMemo(() => {
    if (!currentStepData) return 'Awaiting simulation data...';
    return getSituationalSummary(currentStepData, false);
  }, [currentStepData]);

  const insights = useMemo(() => {
    if (!currentStepData) return [];
    return generateInsights(currentStepData);
  }, [currentStepData]);

  // Nearby Mesh Node Logic
  const nearestNode = useMemo(() => {
    if (!currentStepData?.storm_center || !device) return null;
    // Using storm center as the reference point for general "nearest node" advice
    // if no specific zone is selected in the parent (this is a general assistant)
    return findNearestMeshNode(
      [currentStepData.storm_center[1], currentStepData.storm_center[0]], 
      [device] // In a real app, this would be multiple devices
    );
  }, [currentStepData, device]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (adminWsRef.current) {
        try {
          adminWsRef.current.close();
        } catch {
          // no-op
        }
        adminWsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const resp = await fetch(apiUrl(`/api/ai/chat/history/${encodeURIComponent(sessionId)}`));
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;

        const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
        if (resp.ok && data?.ok && rawMessages.length > 0) {
          const restored: Message[] = rawMessages
            .map((m: any, idx: number) => ({
              id: String(m?.id || `restored-${idx}`),
              role: m?.role === 'user' ? 'user' : 'assistant',
              content: String(m?.content || ''),
              timestamp: m?.timestamp ? new Date(m.timestamp) : new Date(),
            }))
            .filter((m: Message) => m.content.trim().length > 0);

          if (restored.length > 0) {
            setMessages(restored);
          }
        }
      } catch (err) {
        console.warn('AI chat history load failed:', err);
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const summarizeZoneState = () => {
    const values = Object.values(zoneStatuses || {});
    const counts = values.reduce<Record<string, number>>((acc, status) => {
      acc[String(status)] = (acc[String(status)] || 0) + 1;
      return acc;
    }, {});
    const criticalZones = Object.entries(zoneStatuses || {})
      .filter(([_, status]) => status === 'CRITICAL')
      .map(([zone]) => `Zone ${zone}`);

    return { counts, criticalZones };
  };

  const summarizeInfrastructure = (ctx: ControlPanelContext) => {
    const infra = ctx.impactedInfra;
    if (!infra) {
      return {
        available: false,
        counts: { schools: 0, hospitals: 0, mosques: 0, shelters: 0, volunteers: 0 },
      };
    }

    const mostRiskProne = [
      ...infra.shelters.map((s) => ({ type: 'shelter', item: s })),
      ...infra.hospitals.map((h) => ({ type: 'hospital', item: h })),
      ...infra.schools.map((s) => ({ type: 'school', item: s })),
    ]
      .sort((a, b) => (a.item?.properties?.defaultDistance ?? Infinity) - (b.item?.properties?.defaultDistance ?? Infinity))
      .slice(0, 3)
      .map((x) => ({
        type: x.type,
        name: x.item?.properties?.name || 'Unknown',
        distance_km: x.item?.properties?.defaultDistance ?? null,
      }));

    return {
      available: true,
      counts: {
        schools: infra.schools.length,
        hospitals: infra.hospitals.length,
        mosques: infra.mosques.length,
        shelters: infra.shelters.length,
        volunteers: infra.volunteers.length,
      },
      most_risk_prone_targets: mostRiskProne,
    };
  };

  const summarizeSos = () => {
    const severityRank: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const prioritized = [...(sosQueue || [])]
      .sort((a, b) => {
        const sa = String(a?.sos_details?.severity_level || '').toLowerCase();
        const sb = String(b?.sos_details?.severity_level || '').toLowerCase();
        const ra = severityRank[sa] || 0;
        const rb = severityRank[sb] || 0;
        if (rb !== ra) return rb - ra;
        return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
      })
      .slice(0, 5)
      .map((s) => ({
        event_id: s.event_id,
        severity_level: s.sos_details?.severity_level,
        code: s.sos_details?.code,
        volunteer_id: s.volunteer?.id,
      }));

    return {
      pending_count: sosQueue.length,
      approved_count: broadcastedAlerts.length,
      active_events_with_station_responses: Object.keys(stationResponses || {}).length,
      prioritized_pending: prioritized,
    };
  };

  const resolveRouteOrigin = (): { lat: number; lon: number } | null => {
    const focused = extractPointLonLat(props.focusedPoint);
    if (focused) return { lat: focused.lat, lon: focused.lon };

    if (props.selectedZone) {
      try {
        const centroid = turf.centroid(props.selectedZone).geometry.coordinates;
        if (Array.isArray(centroid) && centroid.length >= 2) {
          const lon = Number(centroid[0]);
          const lat = Number(centroid[1]);
          if (Number.isFinite(lon) && Number.isFinite(lat)) {
            return { lat, lon };
          }
        }
      } catch {
        // Fall back to storm center if zone centroid fails.
      }
    }

    const stormCenter = currentStepData?.storm_center;
    if (Array.isArray(stormCenter) && stormCenter.length >= 2) {
      const lon = Number(stormCenter[0]);
      const lat = Number(stormCenter[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return { lat, lon };
      }
    }

    return null;
  };

  const loadInfraCandidates = async (category: InfraIntentCategory): Promise<any[]> => {
    const fromAnalysis = props.impactedInfra?.[category] || [];
    if (Array.isArray(fromAnalysis) && fromAnalysis.length > 0) return fromAnalysis;

    if (category !== 'schools') return [];

    // Fallback for school queries so map actions still work even when Infra Analyzer data
    // has not been loaded yet in the current panel session.
    try {
      const res = await fetch('/data/schools_bd.geojson');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data?.features) ? data.features : [];
    } catch {
      return [];
    }
  };

  const triggerNearestInfraMapAction = async (question: string): Promise<string | null> => {
    const category = parseNearestInfraIntent(question);
    if (!category || !props.onRouteGenerated) return null;

    const origin = resolveRouteOrigin();
    if (!origin) {
      const issue = `Map action: unable to determine routing origin for nearest ${INFRA_LABEL[category]}.`;
      props.onRouteIssue?.(issue);
      return issue;
    }

    const candidates = await loadInfraCandidates(category);
    if (!candidates.length) {
      const issue = `Map action: no ${category} available in current analysis scope.`;
      props.onRouteIssue?.(issue);
      return issue;
    }

    let nearest: { feature: any; coords: { lon: number; lat: number }; distanceKm: number; name: string } | null = null;
    for (let idx = 0; idx < candidates.length; idx += 1) {
      const feature = candidates[idx];
      const coords = extractPointLonLat(feature);
      if (!coords) continue;

      const rawDefault = Number(feature?.properties?.defaultDistance);
      const distanceKm = Number.isFinite(rawDefault)
        ? rawDefault
        : haversineKm(origin.lat, origin.lon, coords.lat, coords.lon);

      if (!nearest || distanceKm < nearest.distanceKm) {
        nearest = {
          feature,
          coords,
          distanceKm,
          name: pointName(feature, `${INFRA_LABEL[category]}-${idx + 1}`),
        };
      }
    }

    if (!nearest) {
      const issue = `Map action: could not resolve coordinates for nearest ${INFRA_LABEL[category]}.`;
      props.onRouteIssue?.(issue);
      return issue;
    }

    try {
      const routeData = await fetchBestRoute(origin, nearest.coords, 'astar');
      if (routeData?.route) {
        props.onRouteGenerated(routeData.route, nearest.name, nearest.feature);
        props.onRouteIssue?.(null);
        return `Map action: highlighted route to nearest ${INFRA_LABEL[category]} ${nearest.name} (${nearest.distanceKm.toFixed(2)} km).`;
      }
    } catch {
      // Fall back to location-only highlight below.
    }

    props.onRouteGenerated(null, nearest.name, nearest.feature);
    const issue = `Map action: highlighted nearest ${INFRA_LABEL[category]} ${nearest.name}, but route is unavailable right now.`;
    props.onRouteIssue?.(issue);
    return issue;
  };

  const submitMessage = async (rawContent: string, options?: SubmitMessageOptions) => {
    const content = rawContent.trim();
    if (!content) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    const moderationIntent = parseSosModerationIntent(content, sosQueue);

    if (moderationIntent) {
      const ensureAdminWs = (): Promise<WebSocket> =>
        new Promise((resolve, reject) => {
          let ws = adminWsRef.current;

          if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(ws);
            return;
          }

          if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
            ws = new WebSocket(`${getWsBaseUrl()}/ws/telemetry`);
            adminWsRef.current = ws;
          }

          const handleOpen = () => {
            cleanup();
            resolve(ws as WebSocket);
          };
          const handleError = () => {
            cleanup();
            reject(new Error('Unable to connect to the SOS command channel.'));
          };
          const cleanup = () => {
            ws?.removeEventListener('open', handleOpen);
            ws?.removeEventListener('error', handleError);
          };

          ws.addEventListener('open', handleOpen);
          ws.addEventListener('error', handleError);

          if (ws.readyState === WebSocket.OPEN) {
            cleanup();
            resolve(ws);
          }
        });

      const sendSosAction = async (action: SosModerationAction, eventId: string) => {
        const ws = await ensureAdminWs();
        removeSosFromQueue(eventId);
        ws.send(
          JSON.stringify({
            type: action === 'approve' ? 'admin_approve_sos' : 'admin_reject_sos',
            event_id: eventId,
            admin_id: 'ai_assistant',
          }),
        );
      };

      try {
        if (!moderationIntent.targets.length) {
          const idleReply = moderationIntent.action === 'approve'
            ? 'No pending SOS is available to approve right now.'
            : 'No pending SOS is available to reject right now.';
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: idleReply,
            timestamp: new Date()
          }]);
          return;
        }

        const successIds: string[] = [];
        const failedIds: string[] = [];
        for (const target of moderationIntent.targets) {
          try {
            await sendSosAction(moderationIntent.action, target.event_id);
            successIds.push(target.event_id);
          } catch {
            failedIds.push(target.event_id);
          }
        }

        const pastTense = moderationIntent.action === 'approve' ? 'approved' : 'rejected';
        let confirmation = '';
        if (!successIds.length) {
          confirmation = `I could not ${moderationIntent.action} the SOS command because the dispatch channel is unavailable.`;
        } else if (moderationIntent.scope === 'all') {
          confirmation = `Executed: ${pastTense} all queued SOS events (${successIds.length}). IDs: ${successIds.join(', ')}.`;
        } else {
          confirmation = `Executed: ${pastTense} SOS event ${successIds[0]}.`;
        }

        if (failedIds.length) {
          confirmation = `${confirmation} Failed IDs: ${failedIds.join(', ')}.`;
        }

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: confirmation,
          timestamp: new Date()
        }]);
        return;
      } catch (err) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `SOS command failed: ${err instanceof Error ? err.message : 'Unknown error'}.`,
          timestamp: new Date()
        }]);
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    // Add a temporary "thinking" message
    const thinkingId = `thinking-${Date.now()}`;
    const thinkingMsg: Message = {
      id: thinkingId,
      role: 'assistant',
      content: '...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, thinkingMsg]);

    // Run the map highlight action asynchronously so it cannot lock the chat flow.
    void triggerNearestInfraMapAction(content).catch(() => null);

    try {
      const zoneSummary = summarizeZoneState();
      const responseTools = [
        'Infrastructure Analyzer',
        'NGO Manager dispatch routes',
        'CAP alerts panel',
        'LoRa mesh monitor',
        'Simulation timeline',
        'SOS triage queue',
      ];

      const infraSnapshot = summarizeInfrastructure(props);
      const focusedRouteCoords = props.focusedRoute?.geometry?.coordinates;

      const resp = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          messages: messages.concat(userMsg).map(m => ({
            role: m.role,
            content: m.content
          })),
          require_live_model: true,
          context: {
            simulation: {
              phase: currentStepData?.phase || 'Unknown',
              wind_kmh: Math.round((currentStepData?.storm_wind_kt || 0) * 1.852),
              dist_to_land_km: currentStepData?.storm_dist2land_km || 0
            },
            lora: {
              nearest_node: nearestNode?.device.name || 'None',
              mesh_dist_km: nearestNode?.distance_km ? parseFloat(nearestNode.distance_km.toFixed(2)) : 0
            },
            zones: {
              status_counts: zoneSummary.counts,
              critical_zones: zoneSummary.criticalZones,
            },
            infrastructure: infraSnapshot,
            selection: {
              selected_zone_name:
                props.selectedZone?.properties?.name ||
                props.selectedZone?.properties?.localityCode ||
                null,
              selected_zone_code: props.selectedZone?.properties?.localityCode || null,
              focused_point_name: props.focusedPoint?.properties?.name || props.focusedPoint?.dispatchId || null,
              route_active: Boolean(props.focusedRoute),
              route_waypoints: Array.isArray(focusedRouteCoords) ? focusedRouteCoords.length : 0,
            },
            sos: summarizeSos(),
            response_tools_available: responseTools,
            project_mode: 'control_panel_guardian',
            response_contract: {
              compact: true,
              style: 'short_structured_straightforward',
              max_words: 90,
              max_items: 4,
              max_lines: 5,
              max_chars: 680,
            },
          }
        })
      });

      const data = await resp.json().catch(() => ({}));
      
      setMessages(prev => prev.filter(m => m.id !== thinkingId));

      if (resp.ok && data.ok) {
        let assistantContent = typeof data?.content === 'string' ? data.content : '';
        if (!assistantContent.trim()) {
          throw new Error('Live model returned an empty response. Please retry.');
        }
        
        // Parse custom [ROUTE: Destination] command from AI response
        const routeMatch = assistantContent.match(/\[ROUTE:\s*([^\]]+)\]/i);
        if (routeMatch && props.onRouteGenerated) {
          const destinationName = routeMatch[1].trim();
          assistantContent = assistantContent.replace(routeMatch[0], '').trim();
          
          let start_lat = 21.42;
          let start_lon = 92.00;
          
          if (props.focusedPoint?.geometry?.coordinates) {
             start_lat = props.focusedPoint.geometry.coordinates[1];
             start_lon = props.focusedPoint.geometry.coordinates[0];
          } else if (props.selectedZone) {
             const centroid = turf.centroid(props.selectedZone).geometry.coordinates;
             start_lat = centroid[1];
             start_lon = centroid[0];
          }
          
          const criticalZones = props.selectedZone?.properties?.dangerLevel === 'critical' ? [props.selectedZone.properties.localityCode] : [];
          
          fetch(apiUrl('/api/routing/evacuation'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              start_lat,
              start_lon,
              destination_name: destinationName,
              critical_zones: criticalZones
            })
          })
          .then(res => res.json())
          .then(routeData => {
             if (routeData.route && props.onRouteGenerated) {
               props.onRouteGenerated(routeData.route, destinationName, null);
             }
          })
          .catch(console.error);
        }

        if (options?.presetActionType === 'central_alert' || options?.presetId === 'central-alert-active-volunteers') {
          props.onCentralAlertPreview?.(assistantContent);
        }
        if (options?.presetActionType === 'cap_dispatch' || options?.presetId === 'cap-sms-dispatch') {
          props.onCapDispatchPreview?.(assistantContent);
        }
        if (options?.presetActionType === 'top_ngo_dispatch' || options?.presetId === 'dispatch-top-ngos-selected-area') {
          props.onTopNgoDispatchPreview?.(assistantContent);
        }

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date()
        }]);
      } else {
        throw new Error(data.error || `AI backend unavailable (status ${resp.status})`);
      }
    } catch (err) {
      console.error('AI Chat Error:', err);
      setMessages(prev => prev.filter(m => m.id !== thinkingId));
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `AI service error: ${err instanceof Error ? err.message : 'Unknown error'}. Confirm backend provider keys and connectivity are configured.`,
        timestamp: new Date()
      }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    await submitMessage(inputValue);
  };

  const handleFaqClick = () => {
    setActivePanel('chat');
    void submitMessage(FAQ_PROMPT);
  };

  const handlePresetPrompt = (preset: PresetPrompt) => {
    setActivePanel('chat');
    void submitMessage(preset.prompt, { presetId: preset.id, presetActionType: preset.actionType });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-4">
      
      {/* Popovers */}
      <AnimatePresence>
        {activePanel === 'chat' && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[350px] h-[500px] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-white/5 bg-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <Bot size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">AI Assistant</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Online Now</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setMessages([{ id: '1', role: 'assistant', content: ASSISTANT_GREETING, timestamp: new Date() }])}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-red-400 transition-colors"
                  title="Clear chat history"
                  aria-label="Clear chat history"
                >
                  <Trash2 size={15} />
                </button>
                <button onClick={() => setActivePanel(null)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors" aria-label="Close chat">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                    min-w-0 max-w-[85%] overflow-hidden p-3 rounded-2xl text-[11px] leading-relaxed font-medium break-words whitespace-pre-wrap [overflow-wrap:anywhere]
                    ${msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/20' 
                      : 'bg-slate-800/80 text-slate-200 border border-white/5 rounded-tl-none'}
                  `}>
                    {msg.role === 'assistant' ? (
                      <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                        <ReactMarkdown components={markdownComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-white/5 bg-slate-800/30">
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-[10px] uppercase tracking-[0.16em] font-black text-slate-500">Operation Presets</span>
                  <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-slate-600">One-Tap Prompt</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {operationPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetPrompt(preset)}
                      disabled={isSubmitting}
                      title={preset.description}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg border border-white/10 bg-slate-900/80 hover:bg-slate-800 text-[10px] font-bold text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Ask the assistant..."
                  value={inputValue}
                  disabled={isSubmitting}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isSubmitting}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activePanel === 'insights' && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[350px] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <h4 className="text-sm font-black text-white uppercase tracking-wider">Status & Insights</h4>
              </div>
              <button onClick={() => setActivePanel(null)} className="p-2 hover:bg-white/5 rounded-full text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Summary Box */}
            <div className="p-4 bg-slate-950/50 border border-white/5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform">
                <Zap size={40} className="text-emerald-500" />
              </div>
              <h5 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                <Zap size={12} /> Live Assessment
              </h5>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">{summary}</p>
            </div>

            {/* Mesh Suggestion */}
            {nearestNode && (
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                  <Wifi size={12} /> Communication Node
                </h5>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <Navigation size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Nearest Connection</p>
                    <p className="text-white font-black text-sm truncate uppercase tracking-tight">{nearestNode.device.name}</p>
                    <p className="text-[11px] text-slate-400 font-bold">{nearestNode.distance_km.toFixed(2)} km away</p>
                  </div>
                </div>
              </div>
            )}

            {/* Strategic Insights */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                <Info size={12} /> Strategic Guidance
              </h5>
              <div className="space-y-2">
                {insights.map((insight, i) => (
                  <div key={i} className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                    insight.type === 'critical' ? 'bg-red-500/10 border-red-500/20' :
                    insight.type === 'warning' ? 'bg-orange-500/10 border-orange-500/20' :
                    'bg-slate-800/50 border-white/5'
                  }`}>
                    {insight.type === 'critical' || insight.type === 'warning' ? (
                      <AlertTriangle className={`shrink-0 ${insight.type === 'critical' ? 'text-red-400' : 'text-orange-400'}`} size={16} />
                    ) : (
                      <ChevronRight className="shrink-0 text-slate-500" size={16} />
                    )}
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${
                        insight.type === 'critical' ? 'text-red-400' :
                        insight.type === 'warning' ? 'text-orange-400' :
                        'text-slate-300'
                      }`}>{insight.title}</p>
                      <p className="text-[11px] text-slate-400 font-medium leading-normal">{insight.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Buttons */}
      <div className="flex gap-2.5">
        <button 
          onClick={handleFaqClick}
          className={`
            group flex items-center gap-2 px-3.5 py-2 rounded-full border transition-all duration-300 shadow-xl
            ${activePanel === 'chat' 
              ? 'bg-emerald-500 border-emerald-400 text-white scale-105' 
              : 'bg-slate-900/90 backdrop-blur border-white/10 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400'}
          `}
        >
          <Sparkles size={14} className={activePanel === 'chat' ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'} />
          <span className="text-[10px] font-black uppercase tracking-[0.14em]">FAQ</span>
        </button>

        <button 
          onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
          className={`
            group flex items-center gap-2 px-3.5 py-2 rounded-full border transition-all duration-300 shadow-xl
            ${activePanel === 'chat' 
              ? 'bg-blue-600 border-blue-500 text-white scale-105' 
              : 'bg-slate-900/90 backdrop-blur border-white/10 text-slate-300 hover:border-blue-500/50 hover:text-blue-400'}
          `}
        >
          <MessageCircle size={14} className={activePanel === 'chat' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'} />
          <span className="text-[10px] font-black uppercase tracking-[0.14em]">Assistant</span>
        </button>
      </div>

    </div>
  );
}
