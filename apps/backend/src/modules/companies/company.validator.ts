import { z } from 'zod';

export const createCompanySchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().min(1),
  sector: z.string().optional().nullable()
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  sector: z.string().optional().nullable(),
  isActive: z.boolean().optional()
});
