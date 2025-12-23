import { z } from 'zod';
import { bookingIdValidator, paymentIdValidator, paymentOrExtraChargeIdValidator } from '../../utils/validators';

export const createCheckoutSessionSchema = z.object({
  body: z.object({
    bookingId: bookingIdValidator,
  }),
});

const paymentStatusEnum = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']);

export const listCompanyPaymentsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: paymentStatusEnum.optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be in YYYY-MM-DD format').optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be in YYYY-MM-DD format').optional(),
    bookingId: bookingIdValidator.optional(),
    search: z.string().optional(),
  }),
});

export const getPaymentStatsSchema = z.object({
  query: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be in YYYY-MM-DD format').optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be in YYYY-MM-DD format').optional(),
  }),
});

export const processRefundSchema = z.object({
  params: z.object({
    paymentId: paymentIdValidator,
  }),
  body: z.object({
    amount: z.number().positive().optional(),
    reason: z.string().optional(),
  }),
});

export const getPaymentByIdSchema = z.object({
  params: z.object({
    paymentId: paymentOrExtraChargeIdValidator,
  }),
});

export const syncPaymentStatusSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
  query: z.object({
    session_id: z.string().optional(),
  }),
});

export type CreateCheckoutSessionDto = z.infer<typeof createCheckoutSessionSchema>['body'];
export type ListCompanyPaymentsDto = z.infer<typeof listCompanyPaymentsSchema>['query'];
export type GetPaymentStatsDto = z.infer<typeof getPaymentStatsSchema>['query'];
export type ProcessRefundDto = z.infer<typeof processRefundSchema>['body'];

