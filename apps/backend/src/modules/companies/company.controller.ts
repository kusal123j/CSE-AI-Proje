import { Request, Response } from 'express';
import { created, ok } from '../../utils/apiResponse';
import { companyService } from './company.service';
import { createCompanySchema, updateCompanySchema } from './company.validator';

export const companyController = {
  async create(req: Request, res: Response) {
    const input = createCompanySchema.parse(req.body);
    return created(res, await companyService.create(input));
  },

  async list(_req: Request, res: Response) {
    return ok(res, await companyService.list());
  },

  async get(req: Request, res: Response) {
    return ok(res, await companyService.getBySymbol(req.params.symbol));
  },

  async update(req: Request, res: Response) {
    const input = updateCompanySchema.parse(req.body);
    return ok(res, await companyService.update(req.params.symbol, input));
  }
};
