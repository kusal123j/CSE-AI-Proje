import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { healthService } from './health.service';

export const healthController = {
  async basic(_req: Request, res: Response) {
    return ok(res, healthService.basic());
  },

  async full(_req: Request, res: Response) {
    return ok(res, await healthService.full());
  },

  async ready(_req: Request, res: Response) {
    const readiness = await healthService.ready();
    return ok(res, readiness, readiness.status === 'ready' ? 200 : 503);
  },

  async db(_req: Request, res: Response) {
    return ok(res, { postgres: await healthService.db() });
  },

  async redis(_req: Request, res: Response) {
    return ok(res, { redis: await healthService.redis() });
  },

  async minio(_req: Request, res: Response) {
    return ok(res, { minio: await healthService.minio() });
  },

  async qdrant(_req: Request, res: Response) {
    return ok(res, { qdrant: await healthService.qdrant() });
  },

  async pythonWorker(_req: Request, res: Response) {
    return ok(res, { pythonWorker: await healthService.pythonWorker() });
  }
};
