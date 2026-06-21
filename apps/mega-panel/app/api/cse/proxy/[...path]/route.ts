import { NextRequest, NextResponse } from 'next/server';
import { cseBackendBaseUrl, cseBackendHeaders } from '@/lib/server/cseBackend';

async function parseBackendResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { success: response.ok, message: text };
  }
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      success: false,
      message: 'The generic CSE proxy is read-only. Use a dedicated server route for write actions.',
      status: 405
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  const backendPath = params.path.map(encodeURIComponent).join('/');
  const target = new URL(`${cseBackendBaseUrl()}/api/cse/${backendPath}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      headers: cseBackendHeaders()
    });
    const payload = await parseBackendResponse(response);
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: payload && typeof payload === 'object' && 'message' in payload ? String((payload as { message?: unknown }).message) : 'CSE backend request failed',
          status: response.status,
          endpointMissing: response.status === 404,
          details: payload
        },
        { status: response.status }
      );
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to reach CSE backend',
        status: 502
      },
      { status: 502 }
    );
  }
}

export async function POST() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
