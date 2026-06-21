import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/database';
import { logger } from '../config/logger';

async function findSchemaPath(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'src', 'database', 'schema.sql'),
    path.join(__dirname, 'schema.sql')
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`schema.sql not found. Checked: ${candidates.join(', ')}`);
}

export async function runMigrations(): Promise<void> {
  const schemaPath = await findSchemaPath();
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);
  logger.info('Database schema migration completed');
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error({ error }, 'Database schema migration failed');
      await pool.end();
      process.exit(1);
    });
}
