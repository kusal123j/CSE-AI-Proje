import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { jobController } from './job.controller';

export const jobRoutes = Router();

jobRoutes.get('/', asyncHandler(jobController.list));
jobRoutes.post('/:id/retry', asyncHandler(jobController.retry));
