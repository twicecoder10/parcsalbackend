import { z } from 'zod';

const requestStatusEnum = z.enum(['OPEN', 'QUOTED', 'ACCEPTED', 'CANCELLED', 'EXPIRED']);
const quoteStatusEnum = z.enum(['PENDING', 'AWAITING_PAYMENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

export const createShipmentRequestSchema = z.object({
  body: z.object({
    originCity: z.string().min(1, 'originCity is required'),
    originCountry: z.string().min(1, 'originCountry is required'),
    destinationCity: z.string().min(1, 'destinationCity is required'),
    destinationCountry: z.string().min(1, 'destinationCountry is required'),
    weightKg: z.number().positive().optional().nullable(),
    itemsCount: z.number().int().positive().optional().nullable(),
    preferredMode: z.enum(['AIR_CARGO', 'SEA_CARGO', 'AIR_FREIGHT']).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    targetDate: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
  }),
});

export const listShipmentRequestsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: requestStatusEnum.optional(),
  }),
});

export const getShipmentRequestSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Request id is required'),
  }),
});

export const acceptQuoteSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Request id is required'),
    quoteId: z.string().min(1, 'Quote id is required'),
  }),
});

export const createQuoteSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Request id is required'),
  }),
  body: z.object({
    priceMinor: z.number().int().positive(),
    currency: z.string().min(3).max(3).optional().default('GBP'),
    estimatedDays: z.number().int().positive(),
    note: z.string().max(2000).optional().nullable(),
    validUntil: z.coerce.date(),
  }),
});

export const listCompanyQuotesSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: quoteStatusEnum.optional(),
  }),
});

export type CreateShipmentRequestDto = z.infer<typeof createShipmentRequestSchema>['body'];
export type CreateQuoteDto = z.infer<typeof createQuoteSchema>['body'];
