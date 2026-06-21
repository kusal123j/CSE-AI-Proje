import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { companyController } from './company.controller';

export const companyRoutes = Router();

companyRoutes.get('/', asyncHandler(companyController.list));
companyRoutes.post('/', asyncHandler(companyController.create));
companyRoutes.get('/:symbol', asyncHandler(companyController.get));
companyRoutes.patch('/:symbol', asyncHandler(companyController.update));
