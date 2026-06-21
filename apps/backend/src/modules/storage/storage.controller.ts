import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { storageService } from './storage.service';

export const storageController = {
  async ensureBucket(_req: Request, res: Response) {
    return ok(res, await storageService.ensureBucket());
  }
};
