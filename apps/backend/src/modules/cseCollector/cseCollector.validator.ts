import { z } from 'zod';
import { documentTypeSchema } from '../documents/document.validator';

export const fetchCseDocumentsSchema = z.object({
  symbol: z.string().min(1).max(20),
  documentType: documentTypeSchema.default('ANNUAL_REPORT'),
  autoQueueDownload: z.boolean().optional().default(false),
  documents: z
    .array(
      z.object({
        title: z.string().min(1),
        sourceUrl: z.string().url(),
        sourceDocumentId: z.string().optional().nullable(),
        financialYear: z.string().optional().nullable(),
        period: z.string().optional().nullable(),
        publishedDate: z.string().optional().nullable(),
        fileName: z.string().optional().nullable()
      })
    )
    .optional()
});
