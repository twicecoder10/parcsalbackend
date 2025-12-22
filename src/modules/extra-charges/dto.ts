import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

const extraChargeReasonEnum = z.enum([
  'EXCESS_WEIGHT',
  'EXTRA_ITEMS',
  'OVERSIZE',
  'REPACKING',
  'LATE_DROP_OFF',
  'OTHER',
]);

export const createExtraChargeSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
  body: z.object({
    reason: extraChargeReasonEnum,
    description: z.string().optional().nullable(),
    evidenceUrls: z.array(z.string().url('Invalid evidence URL')).optional().default([]),
    baseAmountMinor: z.number().int().positive('Base amount must be positive'),
    expiresInHours: z.number().int().positive().max(168).optional().default(48), // max 7 days
  }),
});

export const listExtraChargesSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
});

export const payExtraChargeSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
    extraChargeId: z.string().min(1, 'Extra charge ID is required'),
  }),
});

export const declineExtraChargeSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
    extraChargeId: z.string().min(1, 'Extra charge ID is required'),
  }),
});

export const cancelExtraChargeSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
    extraChargeId: z.string().min(1, 'Extra charge ID is required'),
  }),
});

export type CreateExtraChargeDto = z.infer<typeof createExtraChargeSchema>['body'];
export type ListExtraChargesDto = z.infer<typeof listExtraChargesSchema>['params'];
export type PayExtraChargeDto = z.infer<typeof payExtraChargeSchema>['params'];
export type DeclineExtraChargeDto = z.infer<typeof declineExtraChargeSchema>['params'];
export type CancelExtraChargeDto = z.infer<typeof cancelExtraChargeSchema>['params'];

