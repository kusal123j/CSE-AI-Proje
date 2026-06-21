import { Router } from 'express';
import { healthController } from './health.controller';
import { asyncHandler } from '../../utils/asyncHandler';

export const healthRoutes = Router();

healthRoutes.get('/', asyncHandler(healthController.basic));
healthRoutes.get('/full', asyncHandler(healthController.full));
healthRoutes.get('/ready', asyncHandler(healthController.ready));
healthRoutes.get('/db', asyncHandler(healthController.db));
healthRoutes.get('/redis', asyncHandler(healthController.redis));
healthRoutes.get('/minio', asyncHandler(healthController.minio));
healthRoutes.get('/qdrant', asyncHandler(healthController.qdrant));
healthRoutes.get('/python-worker', asyncHandler(healthController.pythonWorker));
