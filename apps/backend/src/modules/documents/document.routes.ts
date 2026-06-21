import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { documentController } from './document.controller';

export const documentRoutes = Router();

documentRoutes.get('/', asyncHandler(documentController.list));
documentRoutes.post('/', asyncHandler(documentController.create));
documentRoutes.get('/:id', asyncHandler(documentController.get));
documentRoutes.get('/:id/pages', asyncHandler(documentController.pages));
documentRoutes.get('/:id/logs', asyncHandler(documentController.logs));
documentRoutes.patch('/:id/status', asyncHandler(documentController.updateStatus));
documentRoutes.post('/:id/download', asyncHandler(documentController.download));
documentRoutes.post('/:id/extract', asyncHandler(documentController.extract));
