/**
 * useMeshStore.ts — Nirapotta WebRTC Mesh Network State
 *
 * Manages peer-to-peer connections, mesh relay logic, and offline
 * alert propagation via WebRTC DataChannels.
 */

import { create } from 'zustand';
import { getWsBaseUrl } from '../config/api';
import type {
  MeshMessage,
  CAPAlertJSON,
} from '../lib/meshProtocol';
import {
  MAX_SEEN_BUFFER,
  HEARTBEAT_INTERVAL_MS,
  createMeshMessage,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from '../lib/meshProtocol';
import { saveAlert, loadAlerts } from '../lib/offlineDB';
import { useLocationStore } from './useLocationStore';
import { haversineKm } from '../lib/haversine';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeerInfo {
  id: string;
  channel: RTCDataChannel | null;
  pc: RTCPeerConnection;
  lat?: number;
  lng?: number;
  lastSeen: number;
}

type NetworkStatus = 'online' | 'mesh-only' | 'offline';

interface MeshState {
  peerId: string;
  peers: Record<string, PeerInfo>;
  peerCount: number;

  signalingStatus: 'connected' | 'disconnected' | 'reconnecting';
  networkStatus: NetworkStatus;

  alerts: CAPAlertJSON[];
  seenIds: string[];

  messagesRelayed: number;
  messagesReceived: number;
  totalHops: number;

  // Local-specific additions
  lowBandwidthMode: boolean;

  // Internals
  _ws: WebSocket | null;
  _heartbeatTimer: ReturnType<typeof setInterval> | null;
  _reconnectTimer: ReturnType<typeof setTimeout> | null;
  _reconnectDelay: number;

  // Actions
  init: () => void;
  shutdown: () => void;
  injectAlert: (alert: CAPAlertJSON, hmac?: string) => void;
  setLowBandwidthMode: (enabled: boolean) => void;
  _handleMeshMessage: (fromPeer: string, raw: string) => void;
  _broadcastToMesh: (msg: MeshMessage, excludePeer?: string) => void;
  _createPeerConnection: (remotePeerId: string, isInitiator: boolean) => Promise<RTCPeerConnection>;
  _setupDataChannel: (remotePeerId: string, dc: RTCDataChannel) => void;
  _removePeer: (remotePeerId: string) => void;
  _connectSignaling: () => void;
  _attemptReconnect: () => void;
}

const SIGNALING_URL = () => {
  return `${getWsBaseUrl()}/ws/signaling`;
};

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function _notifyServiceWorker(alert: CAPAlertJSON) {
  const info = alert.info?.[0];
  if (!info) return;
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CAP_ALERT',
      identifier: alert.identifier,
      headline: info.headline || info.event,
      instruction: info.instruction,
      severity: info.severity,
      event: info.event,
    });
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useMeshStore = create<MeshState>((set, get) => ({
  peerId: 'mesh-' + Math.random().toString(36).substring(2, 9),
  peers: {},
  peerCount: 0,
  signalingStatus: 'disconnected',
  networkStatus: 'offline',
  alerts: [],
  seenIds: [],
  messagesRelayed: 0,
  messagesReceived: 0,
  totalHops: 0,
  lowBandwidthMode: false,
  _ws: null,
  _heartbeatTimer: null,
  _reconnectTimer: null,
  _reconnectDelay: RECONNECT_BASE_MS,

  setLowBandwidthMode: (lowBandwidthMode) => set({ lowBandwidthMode }),

  init: () => {
    const state = get();
    if (state._ws) return;

    loadAlerts().then((cached) => {
      if (cached.length > 0) {
        set({ alerts: cached.slice(0, 50) });
      }
    });

    state._connectSignaling();

    const hb = setInterval(() => {
      const { peers, peerId } = get();
      const loc = useLocationStore.getState();
      const msg = createMeshMessage('HEARTBEAT', peerId, {
        peerCount: Object.keys(peers).length,
        lat: loc.lat,
        lng: loc.lng,
      });
      msg.ttl = 1;
      for (const peer of Object.values(peers)) {
        if (peer.channel?.readyState === 'open') {
          try { peer.channel.send(JSON.stringify(msg)); } catch { /* */ }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    set({ _heartbeatTimer: hb });
  },

  shutdown: () => {
    const state = get();
    if (state._heartbeatTimer) clearInterval(state._heartbeatTimer);
    if (state._reconnectTimer) clearTimeout(state._reconnectTimer);
    if (state._ws) state._ws.close();
    for (const peer of Object.values(state.peers)) {
      peer.pc.close();
    }
    set({ _ws: null, peers: {}, peerCount: 0, signalingStatus: 'disconnected', _heartbeatTimer: null });
  },

  _connectSignaling: () => {
    const { peerId } = get();
    const url = `${SIGNALING_URL()}/${peerId}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
    } catch {
      set({ signalingStatus: 'disconnected', networkStatus: 'offline' });
      get()._attemptReconnect();
      return;
    }

    ws.onopen = () => {
      set({
        _ws: ws,
        signalingStatus: 'connected',
        networkStatus: 'online',
        _reconnectDelay: RECONNECT_BASE_MS,
      });
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'peer_joined') {
          await get()._createPeerConnection(data.peerId, true);
        } else if (data.type === 'peer_left') {
          get()._removePeer(data.peerId);
        } else if (data.type === 'signal') {
          const remotePeer = data.sender;
          const signal = data.signal;
          let pc = get().peers[remotePeer]?.pc;
          if (!pc) {
            pc = await get()._createPeerConnection(remotePeer, false);
          }
          if (signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({ target: remotePeer, signal: { sdp: pc.localDescription } }));
            }
          } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }
      } catch (err) {
        console.error('Signaling error:', err);
      }
    };

    ws.onclose = () => {
      set((s) => ({
        _ws: null,
        signalingStatus: 'disconnected',
        networkStatus: Object.keys(s.peers).length > 0 ? 'mesh-only' : 'offline',
      }));
      get()._attemptReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  },

  _attemptReconnect: () => {
    const state = get();
    if (state._reconnectTimer) return;
    const delay = state._reconnectDelay;
    const timer = setTimeout(() => {
      set({
        _reconnectTimer: null,
        _reconnectDelay: Math.min(delay * 2, RECONNECT_MAX_MS),
        signalingStatus: 'reconnecting',
      });
      get()._connectSignaling();
    }, delay);
    set({ _reconnectTimer: timer });
  },

  _createPeerConnection: async (remotePeerId: string, isInitiator: boolean) => {
    const state = get();
    if (state.peers[remotePeerId]) return state.peers[remotePeerId].pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const peerInfo: PeerInfo = {
      id: remotePeerId,
      channel: null,
      pc,
      lastSeen: Date.now(),
    };

    set((s) => ({
      peers: { ...s.peers, [remotePeerId]: peerInfo },
      peerCount: Object.keys(s.peers).length + 1,
    }));

    pc.onicecandidate = (e) => {
      if (e.candidate && state._ws?.readyState === WebSocket.OPEN) {
        state._ws.send(JSON.stringify({
          target: remotePeerId,
          signal: { candidate: e.candidate },
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        get()._removePeer(remotePeerId);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('nirapotta-mesh', { ordered: true });
      get()._setupDataChannel(remotePeerId, dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (state._ws?.readyState === WebSocket.OPEN) {
        state._ws.send(JSON.stringify({
          target: remotePeerId,
          signal: { sdp: pc.localDescription },
        }));
      }
    } else {
      pc.ondatachannel = (e) => {
        get()._setupDataChannel(remotePeerId, e.channel);
      };
    }

    return pc;
  },

  _setupDataChannel: (remotePeerId: string, dc: RTCDataChannel) => {
    dc.onopen = () => {
      set((s) => {
        const peer = s.peers[remotePeerId];
        if (!peer) return s;
        return {
          peers: { ...s.peers, [remotePeerId]: { ...peer, channel: dc, lastSeen: Date.now() } },
          peerCount: Object.keys(s.peers).length,
          networkStatus: 'online',
        };
      });
    };

    dc.onclose = () => {
      set((s) => {
        const peer = s.peers[remotePeerId];
        if (!peer) return s;
        return {
          peers: { ...s.peers, [remotePeerId]: { ...peer, channel: null } },
        };
      });
    };

    dc.onmessage = (event) => {
      get()._handleMeshMessage(remotePeerId, event.data);
    };
  },

  _removePeer: (remotePeerId: string) => {
    set((s) => {
      const { [remotePeerId]: removed, ...rest } = s.peers;
      if (removed) removed.pc.close();
      const count = Object.keys(rest).length;
      return {
        peers: rest,
        peerCount: count,
        networkStatus: s.signalingStatus === 'connected'
          ? 'online'
          : count > 0 ? 'mesh-only' : 'offline',
      };
    });
  },

  _handleMeshMessage: (fromPeer: string, raw: string) => {
    let msg: MeshMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const state = get();

    if (state.seenIds.includes(msg.id)) return;
    if (msg.ttl <= 0) return;
    if (msg.hops.includes(state.peerId)) return;

    const newSeen = [msg.id, ...state.seenIds].slice(0, MAX_SEEN_BUFFER);
    set({ seenIds: newSeen });

    if (msg.type === 'CAP_ALERT') {
      const alert = msg.payload as CAPAlertJSON;

      const relay: MeshMessage = {
        ...msg,
        ttl: msg.ttl - 1,
        hops: [...msg.hops, state.peerId],
      };
      get()._broadcastToMesh(relay, fromPeer);

      const isDupe = state.alerts.some((a) => a.identifier === alert.identifier);
      if (isDupe) return;

      const area = alert.info?.[0]?.areas?.[0];
      if (area?.circleLat && area?.circleLng && area?.circleRadiusKm) {
        const loc = useLocationStore.getState();
        if (loc.lat !== null && loc.lng !== null) {
          const dist = haversineKm(loc.lat, loc.lng, area.circleLat, area.circleLng);
          if (dist > area.circleRadiusKm) return;
        }
      }

      set((s) => ({
        alerts: [alert, ...s.alerts].slice(0, 50),
        messagesReceived: s.messagesReceived + 1,
        totalHops: s.totalHops + msg.hops.length,
      }));
      saveAlert(alert);
      _notifyServiceWorker(alert);
      return;
    }

    if (msg.type === 'HEARTBEAT') {
      const payload = msg.payload as { lat?: number; lng?: number };
      set((s) => {
        const peer = s.peers[fromPeer];
        if (!peer) return s;
        return {
          peers: {
            ...s.peers,
            [fromPeer]: { ...peer, lastSeen: Date.now(), lat: payload.lat, lng: payload.lng },
          },
        };
      });
      return;
    }

    const relay: MeshMessage = {
      ...msg,
      ttl: msg.ttl - 1,
      hops: [...msg.hops, state.peerId],
    };
    get()._broadcastToMesh(relay, fromPeer);
  },

  _broadcastToMesh: (msg: MeshMessage, excludePeer?: string) => {
    const { peers } = get();
    const raw = JSON.stringify(msg);
    for (const [pid, peer] of Object.entries(peers)) {
      if (pid === excludePeer) continue;
      if (peer.channel?.readyState === 'open') {
        try {
          peer.channel.send(raw);
          set((s) => ({ messagesRelayed: s.messagesRelayed + 1 }));
        } catch { /* */ }
      }
    }
  },

  injectAlert: (alert: CAPAlertJSON, hmac?: string) => {
    const state = get();
    if (state.alerts.some((a) => a.identifier === alert.identifier)) return;

    const area = alert.info?.[0]?.areas?.[0];
    let insideZone = true;
    if (area?.circleLat && area?.circleLng && area?.circleRadiusKm) {
      const loc = useLocationStore.getState();
      if (loc.lat !== null && loc.lng !== null) {
        const dist = haversineKm(loc.lat, loc.lng, area.circleLat, area.circleLng);
        if (dist > area.circleRadiusKm) insideZone = false;
      }
    }

    if (insideZone) {
      set((s) => ({
        alerts: [alert, ...s.alerts].slice(0, 50),
        messagesReceived: s.messagesReceived + 1,
      }));
      saveAlert(alert);
      _notifyServiceWorker(alert);
    }

    const msg = createMeshMessage('CAP_ALERT', state.peerId, alert, hmac);
    set((s) => ({ seenIds: [msg.id, ...s.seenIds].slice(0, MAX_SEEN_BUFFER) }));
    get()._broadcastToMesh(msg);
  },
}));
