/**
 * meshProtocol.ts — Nirapotta Mesh Network Protocol Types & Utilities
 *
 * Defines the wire-format for peer-to-peer mesh relay messages,
 * CAP alert JSON shapes, and protocol constants.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum hops a message can traverse before being dropped. */
export const MAX_TTL = 5;

/** Maximum number of message IDs to keep in the seen-set (dedup buffer). */
export const MAX_SEEN_BUFFER = 500;

/** Interval between heartbeat broadcasts (ms). */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** Base delay for exponential-backoff reconnection (ms). */
export const RECONNECT_BASE_MS = 1_000;

/** Maximum reconnection delay cap (ms). */
export const RECONNECT_MAX_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type MeshMessageType = 'CAP_ALERT' | 'HEARTBEAT' | 'RELAY' | 'ACK';

export interface MeshMessage {
  /** Unique message ID for dedup. */
  id: string;
  /** Message type discriminator. */
  type: MeshMessageType;
  /** Originating peer ID. */
  origin: string;
  /** Remaining hop count; decremented on each relay. */
  ttl: number;
  /** List of peer IDs this message has traversed. */
  hops: string[];
  /** Arbitrary payload (CAP alert, heartbeat info, etc.). */
  payload: unknown;
  /** Optional HMAC for alert integrity verification. */
  hmac?: string;
  /** ISO timestamp of message creation. */
  timestamp: string;
}

export interface CAPAlertArea {
  areaDesc?: string;
  circleLat?: number;
  circleLng?: number;
  circleRadiusKm?: number;
  polygon?: number[][];
}

export interface CAPAlertInfo {
  language?: string;
  category?: string;
  event: string;
  headline?: string;
  headlineEn?: string;
  description?: string;
  instruction?: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency?: string;
  certainty?: string;
  nrpMsgType?: string;
  dialect?: string;
  communityLevel?: string;
  areas?: CAPAlertArea[];
}

export interface CAPAlertJSON {
  identifier: string;
  sender?: string;
  sent?: string;
  status?: string;
  msgType?: string;
  scope?: string;
  info?: CAPAlertInfo[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a new MeshMessage ready for broadcast.
 */
export function createMeshMessage(
  type: MeshMessageType,
  originPeerId: string,
  payload: unknown,
  hmac?: string,
): MeshMessage {
  return {
    id: crypto.randomUUID(),
    type,
    origin: originPeerId,
    ttl: MAX_TTL,
    hops: [originPeerId],
    payload,
    hmac,
    timestamp: new Date().toISOString(),
  };
}
