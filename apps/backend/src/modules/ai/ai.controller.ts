import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../utils/apiResponse';
import { ragService } from './rag/rag.service';

const askSchema = z.object({ question: z.string().min(1) });

export const aiController = {
  async prepareQdrant(_req: Request, res: Response) {
    return ok(res, await ragService.prepareCollection());
  },

  async chunkDocument(req: Request, res: Response) {
    return ok(res, await ragService.chunkDocument(req.params.id));
  },

  async embedDocument(req: Request, res: Response) {
    return ok(res, await ragService.embedDocument(req.params.id));
  },

  async askDocument(req: Request, res: Response) {
    const input = askSchema.parse(req.body);
    return ok(res, await ragService.askDocument(req.params.id, input.question));
  },

  async summarizeDocument(req: Request, res: Response) {
    return ok(res, await ragService.summarizeDocument(req.params.id));
  }
};
