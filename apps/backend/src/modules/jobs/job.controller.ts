import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { jobService } from './job.service';

export const jobController = {
  async list(req: Request, res: Response) {
    return ok(
      res,
      await jobService.list({
        documentId: req.query.documentId?.toString(),
        status: req.query.status?.toString()
      })
    );
  },

  async retry(req: Request, res: Response) {
    return ok(res, await jobService.retry(req.params.id));
  }
};
