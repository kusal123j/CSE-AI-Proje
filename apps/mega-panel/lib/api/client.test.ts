import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, panelFetch } from './client';
import { MegaPanelApiError } from './errors';

describe('mega-panel API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps successful backend envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { count: 12 } }), { status: 200 })));

    await expect(apiFetch<{ count: number }>('summary')).resolves.toEqual({ count: 12 });
    expect(fetch).toHaveBeenCalledWith('/api/cse/proxy/summary', expect.objectContaining({ cache: 'no-store' }));
  });

  it('marks 404 responses as missing backend endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'not found' }), { status: 404 })));

    await expect(apiFetch('missing-endpoint')).rejects.toMatchObject({
      name: 'MegaPanelApiError',
      endpointMissing: true,
      status: 404
    });
  });

  it('raises backend errors from failed envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'backend failed', status: 500 }), { status: 500 })));

    await expect(panelFetch('/api/cse/import/run', { method: 'POST' })).rejects.toThrow(MegaPanelApiError);
  });

  it('handles non-json backend text safely', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('plain backend text', { status: 200 })));

    await expect(apiFetch<{ message: string }>('plain')).resolves.toEqual({ message: 'plain backend text' });
  });

  it('surfaces network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    await expect(apiFetch('summary')).rejects.toThrow('network down');
  });
});
