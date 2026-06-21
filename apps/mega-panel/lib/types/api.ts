export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  details?: unknown;
  endpointMissing?: boolean;
  status?: number;
}

export interface ApiFailure {
  message: string;
  status?: number;
  endpointMissing?: boolean;
  details?: unknown;
}
