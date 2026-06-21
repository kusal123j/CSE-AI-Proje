import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('CSE backend Docker environment wiring', () => {
  it('does not override the panel import secret after loading the shared env file', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const composePath = path.resolve(currentDir, '..', '..', '..', '..', 'infra', 'docker-compose.yml');
    const compose = fs.readFileSync(composePath, 'utf8');
    const megaPanelService = compose.slice(compose.indexOf('  mega-panel:'));

    expect(megaPanelService).toContain('env_file:');
    expect(megaPanelService).toContain('- ../.env');
    expect(megaPanelService).not.toMatch(/CSE_IMPORT_INTERNAL_SECRET:\s*\$\{/);
    expect(megaPanelService).not.toContain('change-me');
  });
});
