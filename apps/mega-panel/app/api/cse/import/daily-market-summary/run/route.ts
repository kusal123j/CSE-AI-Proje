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

export async function POST(request: NextRequest) {
  const url = `${cseBackendBaseUrl()}/api/cse/import/daily-market-summary/run`;
  const body = await request.text();
  const headers = cseBackendHeaders();

  try {
    const response = await fetch(url, { method: 'POST', headers, body: body || '{}' });
    const payload = await parseBackendResponse(response);
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: payload && typeof payload === 'object' && 'message' in payload ? String((payload as { message?: unknown }).message) : 'CSE Daily Market Summary import trigger failed',
          status: response.status,
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
        message: error instanceof Error ? error.message : 'Unable to reach CSE backend Daily Market Summary import endpoint',
        status: 502
      },
      { status: 502 }
    );
  }
}
