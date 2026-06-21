import { z } from 'zod';

export const documentTypeSchema = z.enum(['ANNUAL_REPORT', 'INTERIM_REPORT', 'ANNOUNCEMENT', 'CIRCULAR', 'OTHER']);

export const createDocumentSchema = z.object({
  symbol: z.string().min(1).max(20),
  documentType: documentTypeSchema,
  title: z.string().min(1),
  sourceUrl: z.string().url().optional().nullable(),
  sourceDocumentId: z.string().optional().nullable(),
  financialYear: z.string().optional().nullable(),
  period: z.string().optional().nullable(),
  publishedDate: z.string().optional().nullable(),
  fileName: z.string().optional().nullable()
});

export const updateStatusSchema = z.object({
  status: z.enum([
    'DISCOVERED',
    'DOWNLOADING',
    'DOWNLOADED',
    'STORED',
    'EXTRACTING',
    'EXTRACTED',
    'CHUNKING',
    'CHUNKED',
    'EMBEDDING',
    'EMBEDDED',
    'ANALYZING',
    'ANALYZED',
    'DUPLICATE',
    'FAILED'
  ]),
  errorMessage: z.string().optional().nullable()
});
