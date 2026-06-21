import { MegaPanelApiError } from './errors';

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function unwrapEnvelope<T>(payload: unknown, response: Response): T {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as { success?: boolean; data?: T; message?: string; details?: unknown; endpointMissing?: boolean; status?: number };
    if (envelope.success === false) {
      throw new MegaPanelApiError(envelope.message || 'Backend request failed', {
        status: envelope.status ?? response.status,
        endpointMissing: envelope.endpointMissing ?? response.status === 404,
        details: envelope.details
      });
    }
    return envelope.data as T;
  }

  if (!response.ok) {
    throw new MegaPanelApiError(`Backend request failed with status ${response.status}`, {
      status: response.status,
      endpointMissing: response.status === 404,
      details: payload
    });
  }

  return payload as T;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const normalized = path.replace(/^\/+/, '');
  const response = await fetch(`/api/cse/proxy/${normalized}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });
  const payload = await parseJsonSafe(response);
  return unwrapEnvelope<T>(payload, response);
}

export async function panelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });
  const payload = await parseJsonSafe(response);
  return unwrapEnvelope<T>(payload, response);
}
