import { Alert } from '@/components/ui/alert';
import { MegaPanelApiError } from '@/lib/api/errors';

interface BackendStateProps {
  error: unknown;
  expectedEndpoint?: string;
}

export function BackendMissingState({ error, expectedEndpoint }: BackendStateProps) {
  const apiError = error instanceof MegaPanelApiError ? error : null;
  const endpointMissing = apiError?.endpointMissing || apiError?.status === 404;
  return (
    <Alert tone={endpointMissing ? 'warning' : 'danger'}>
      <div className="font-semibold">{endpointMissing ? 'Backend endpoint missing' : 'Backend request failed'}</div>
      <p className="mt-1">
        {endpointMissing
          ? 'This UI is prepared, but the required backend endpoint is not available in the current backend build.'
          : error instanceof Error
            ? error.message
            : 'The panel could not load data from the backend.'}
      </p>
      {expectedEndpoint ? <p className="mt-2 font-mono text-xs">Expected endpoint: {expectedEndpoint}</p> : null}
    </Alert>
  );
}
