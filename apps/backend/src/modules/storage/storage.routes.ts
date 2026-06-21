import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { storageController } from './storage.controller';

export const storageRoutes = Router();

storageRoutes.post('/ensure-bucket', asyncHandler(storageController.ensureBucket));
