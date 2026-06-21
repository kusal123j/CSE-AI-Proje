import { Request, Response } from 'express';
import { created, ok } from '../../utils/apiResponse';
import { documentService } from './document.service';
import { createDocumentSchema, updateStatusSchema } from './document.validator';

export const documentController = {
  async create(req: Request, res: Response) {
    const input = createDocumentSchema.parse(req.body);
    return created(
      res,
      await documentService.create({
        symbol: input.symbol,
        documentType: input.documentType,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceDocumentId: input.sourceDocumentId,
        financialYear: input.financialYear,
        period: input.period,
        publishedDate: input.publishedDate,
        fileName: input.fileName
      })
    );
  },

  async list(req: Request, res: Response) {
    return ok(
      res,
      await documentService.list({
        symbol: req.query.symbol?.toString(),
        status: req.query.status?.toString(),
        documentType: req.query.documentType?.toString()
      })
    );
  },

  async get(req: Request, res: Response) {
    return ok(res, await documentService.get(req.params.id));
  },

  async pages(req: Request, res: Response) {
    return ok(res, await documentService.pages(req.params.id));
  },

  async logs(req: Request, res: Response) {
    return ok(res, await documentService.logs(req.params.id));
  },

  async updateStatus(req: Request, res: Response) {
    const input = updateStatusSchema.parse(req.body);
    return ok(res, await documentService.updateStatus(req.params.id, input.status, input.errorMessage));
  },

  async download(req: Request, res: Response) {
    return ok(res, await documentService.queueDownload(req.params.id));
  },

  async extract(req: Request, res: Response) {
    return ok(res, await documentService.queueExtract(req.params.id));
  }
};
