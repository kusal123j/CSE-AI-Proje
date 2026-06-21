import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { cseCollectorController } from './cseCollector.controller';

export const cseCollectorRoutes = Router();

cseCollectorRoutes.post('/fetch', asyncHandler(cseCollectorController.fetch));
