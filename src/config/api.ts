const LOCAL_API_BASE = 'http://localhost:8001';
const PROD_FALLBACK_API_BASE = 'https://nirapotta.duckdns.org';

function readViteEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns the HTTP(S) base URL for the backend API.
 * Priority:
 * 1. VITE_API_BASE_URL when explicitly configured
 * 2. Render backend fallback in production builds
 * 3. localhost:8001 during local development
 */
export function getApiBaseUrl(): string {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (typeof envBase === 'string' && envBase.trim().length > 0) {
    return envBase.replace(/\/$/, '');
  }
  if (import.meta.env.PROD) {
    return PROD_FALLBACK_API_BASE;
  }
  return LOCAL_API_BASE;
}

/**
 * Returns the WebSocket base URL for the backend.
 * Derives ws:// or wss:// from the API base URL.
 */
export function getWsBaseUrl(): string {
  const base = getApiBaseUrl();
  return base.replace(/^http/, 'ws');
}

export function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function simulationEventUrl(eventId: string): string {
  return `${getApiBaseUrl()}/api/simulation/${eventId}`;
}

export function scenarioGenerateUrl(): string {
  return `${getApiBaseUrl()}/api/scenario/generate`;
}

export function scenarioListUrl(): string {
  return `${getApiBaseUrl()}/api/scenario`;
}

export function scenarioPresetsUrl(): string {
  return `${getApiBaseUrl()}/api/scenario/presets`;
}

export function scenarioByIdUrl(scenarioId: string): string {
  return `${getApiBaseUrl()}/api/scenario/${scenarioId}`;
}

export function getOpenWeatherMapApiKey(): string {
  return readViteEnvString(import.meta.env.VITE_OWM_API_KEY);
}

export async function dispatchCapSms(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(apiUrl('/api/cap/sms-dispatch'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, message }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error || `SMS dispatch failed (HTTP ${response.status})`,
    };
  }

  return { ok: true };
}
