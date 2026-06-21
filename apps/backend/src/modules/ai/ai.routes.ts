import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { aiController } from './ai.controller';

export const aiRoutes = Router();

aiRoutes.post('/qdrant/prepare', asyncHandler(aiController.prepareQdrant));
aiRoutes.post('/documents/:id/chunk', asyncHandler(aiController.chunkDocument));
aiRoutes.post('/documents/:id/embed', asyncHandler(aiController.embedDocument));
aiRoutes.post('/documents/:id/ask', asyncHandler(aiController.askDocument));
aiRoutes.post('/documents/:id/summary', asyncHandler(aiController.summarizeDocument));
