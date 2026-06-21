import fs from 'node:fs';
import path from 'node:path';

let rootEnvCache: Record<string, string> | null = null;

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readRootEnv(): Record<string, string> {
  if (rootEnvCache) return rootEnvCache;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        rootEnvCache = parseEnvFile(fs.readFileSync(candidate, 'utf8'));
        return rootEnvCache;
      }
    } catch {
      // Keep the proxy usable even if a local env file cannot be read.
    }
  }

  rootEnvCache = {};
  return rootEnvCache;
}

function envValue(key: string): string | undefined {
  return process.env[key] || readRootEnv()[key];
}

export function cseBackendBaseUrl(): string {
  return (envValue('CSE_BACKEND_API_URL') || 'http://localhost:5000').replace(/\/+$/, '');
}

export function cseImportSecret(): string {
  return envValue('CSE_IMPORT_INTERNAL_SECRET') || envValue('CSE_IMPORT_SECRET') || '';
}

export function cseBackendHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = cseImportSecret();
  if (secret) headers['x-cse-import-secret'] = secret;
  return headers;
}
