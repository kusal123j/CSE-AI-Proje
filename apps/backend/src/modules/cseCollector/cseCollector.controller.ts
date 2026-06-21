import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { cseCollectorService } from './cseCollector.service';
import { fetchCseDocumentsSchema } from './cseCollector.validator';

export const cseCollectorController = {
  async fetch(req: Request, res: Response) {
    const input = fetchCseDocumentsSchema.parse(req.body);
    return ok(res, await cseCollectorService.fetch(input));
  }
};
