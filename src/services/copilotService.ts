import type { CopilotState, CopilotStateRequest, DisseminationRequest, DisseminationResponse } from '../types/copilot';
import { getApiBaseUrl } from '../config/api';

const BASE_URL = getApiBaseUrl();
const DEFAULT_COPILOT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_DISSEMINATION_REQUEST_TIMEOUT_MS = 60000;

function getCopilotTimeoutMs(): number {
  const raw = import.meta.env.VITE_COPILOT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COPILOT_REQUEST_TIMEOUT_MS;
  }
  return Math.round(parsed);
}

function getCopilotDisseminationTimeoutMs(): number {
  const raw = import.meta.env.VITE_COPILOT_DISSEMINATION_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DISSEMINATION_REQUEST_TIMEOUT_MS;
  }
  return Math.round(parsed);
}

export async function fetchCopilotState(req: CopilotStateRequest): Promise<CopilotState> {
  const timeoutMs = getCopilotTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/copilot/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Copilot request timed out after ${Math.round(timeoutMs / 1000)}s. Check backend health and retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`Copilot request failed with status ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(String(data.error));
  }

  return data as CopilotState;
}

export async function fetchCopilotDisseminationAction(req: DisseminationRequest): Promise<DisseminationResponse> {
  const timeoutMs = getCopilotDisseminationTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/copilot/action_dissemination`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Copilot Dissemination request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`Copilot Dissemination request failed with status ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(String(data.error));
  }

  return data as DisseminationResponse;
}
