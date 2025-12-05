import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

const bookingStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'IN_TRANSIT', 'DELIVERED']);

export const createBookingSchema = z.object({
  body: z.object({
    shipmentSlotId: z.string().uuid('Invalid shipment slot ID'),
    requestedWeightKg: z.number().positive().optional().nullable(),
    requestedItemsCount: z.number().int().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),
});

export const updateBookingStatusSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
  body: z.object({
    status: bookingStatusEnum,
  }),
});

export const getBookingSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const listBookingsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: bookingStatusEnum.optional(),
    search: z.string().optional(),
  }),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>['body'];
export type UpdateBookingStatusDto = z.infer<typeof updateBookingStatusSchema>['body'];

