import { describe, expect, it } from 'vitest';
import { MegaPanelApiError, getErrorMessage } from '@/lib/api/errors';

describe('MegaPanelApiError', () => {
  it('stores missing-endpoint metadata consistently', () => {
    const error = new MegaPanelApiError('not found', { status: 404, endpointMissing: true, details: { endpoint: 'GET /api/cse/summary' } });

    expect(error.name).toBe('MegaPanelApiError');
    expect(error.message).toBe('not found');
    expect(error.status).toBe(404);
    expect(error.endpointMissing).toBe(true);
    expect(error.details).toEqual({ endpoint: 'GET /api/cse/summary' });
  });

  it('normalizes unknown error messages safely', () => {
    expect(getErrorMessage(new Error('backend down'))).toBe('backend down');
    expect(getErrorMessage('plain error')).toBe('plain error');
    expect(getErrorMessage({ unexpected: true })).toBe('Unknown error');
  });
});
