import axios from 'axios';
import { checkDatabase } from '../../config/database';
import { checkRedis } from '../../config/redis';
import { checkMinio } from '../../config/minio';
import { checkQdrant } from '../../config/qdrant';
import { env } from '../../config/env';

async function safeCheck(check: () => Promise<boolean>): Promise<'ok' | 'failed'> {
  try {
    return (await check()) ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

export const healthService = {
  basic() {
    return {
      status: 'ok',
      service: 'cse-research-backend',
      timestamp: new Date().toISOString()
    };
  },

  async full() {
    const services = {
      postgres: await safeCheck(checkDatabase),
      redis: await safeCheck(checkRedis),
      minio: await safeCheck(checkMinio),
      qdrant: await safeCheck(checkQdrant),
      pythonWorker: await safeCheck(this.pythonWorker)
    };

    return {
      status: Object.values(services).every((service) => service === 'ok') ? 'ok' : 'degraded',
      services,
      timestamp: new Date().toISOString()
    };
  },

  db: () => safeCheck(checkDatabase),
  redis: () => safeCheck(checkRedis),
  minio: () => safeCheck(checkMinio),
  qdrant: () => safeCheck(checkQdrant),

  async pythonWorker(): Promise<boolean> {
    const response = await axios.get(`${env.PYTHON_WORKER_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'ok';
  }
,

  async ready() {
    const full = await this.full();
    return {
      status: full.status === 'ok' ? 'ready' : 'not_ready',
      canProcessDocuments: full.status === 'ok',
      checks: full.services,
      timestamp: new Date().toISOString()
    };
  }
};
