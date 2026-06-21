export class MegaPanelApiError extends Error {
  status?: number;
  endpointMissing?: boolean;
  details?: unknown;

  constructor(message: string, options?: { status?: number; endpointMissing?: boolean; details?: unknown }) {
    super(message);
    this.name = 'MegaPanelApiError';
    this.status = options?.status;
    this.endpointMissing = options?.endpointMissing;
    this.details = options?.details;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
