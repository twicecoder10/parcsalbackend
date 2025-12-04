import { z } from 'zod';

// Plans are read-only for regular users, so we mainly need query validation
export const listPlansSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
  }).optional(),
});

