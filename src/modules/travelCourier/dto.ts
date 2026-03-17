import { z } from 'zod';

// ─── Listing DTOs ───────────────────────────────────────────

export const createListingSchema = z.object({
  body: z.object({
    originCity: z.string().min(1, 'Origin city is required'),
    originCountry: z.string().min(1, 'Origin country is required'),
    destinationCity: z.string().min(1, 'Destination city is required'),
    destinationCountry: z.string().min(1, 'Destination country is required'),
    departureDate: z.string().transform((s) => new Date(s)),
    arrivalDate: z
      .string()
      .transform((s) => new Date(s))
      .optional(),
    airlineName: z.string().optional(),
    flightReference: z.string().optional(),
    availableWeightKg: z.number().positive('Weight must be positive'),
    pricePerKgMinor: z.number().int().positive('Price per kg must be a positive integer (minor units)'),
    currency: z.string().default('GBP'),
    notes: z.string().optional(),
    baggagePolicyNotes: z.string().optional(),
    cutoffDate: z
      .string()
      .transform((s) => new Date(s))
      .optional(),
    flightProofUrl: z.string().url('Invalid flight proof URL').optional(),
  }),
});

export const updateListingSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    originCity: z.string().min(1).optional(),
    originCountry: z.string().min(1).optional(),
    destinationCity: z.string().min(1).optional(),
    destinationCountry: z.string().min(1).optional(),
    departureDate: z
      .string()
      .transform((s) => new Date(s))
      .optional(),
    arrivalDate: z
      .string()
      .transform((s) => new Date(s))
      .nullable()
      .optional(),
    airlineName: z.string().nullable().optional(),
    flightReference: z.string().nullable().optional(),
    availableWeightKg: z.number().positive().optional(),
    pricePerKgMinor: z.number().int().positive().optional(),
    currency: z.string().optional(),
    notes: z.string().nullable().optional(),
    baggagePolicyNotes: z.string().nullable().optional(),
    cutoffDate: z
      .string()
      .transform((s) => new Date(s))
      .nullable()
      .optional(),
    flightProofUrl: z.string().url('Invalid flight proof URL').optional(),
  }),
});

export const listingIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const searchListingsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    originCountry: z.string().optional(),
    destinationCountry: z.string().optional(),
    originCity: z.string().optional(),
    destinationCity: z.string().optional(),
    departureDateFrom: z.string().optional(),
    departureDateTo: z.string().optional(),
    maxPricePerKg: z.string().optional(),
  }).optional(),
});

// ─── Booking DTOs ───────────────────────────────────────────

export const createBookingSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    requestedWeightKg: z.number().positive('Weight must be positive'),
    itemDescription: z.string().optional(),
    declaredContents: z.string().min(1, 'Declared contents is required'),
    restrictedItemsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm no prohibited items are included' }),
    }),
    pickupNotes: z.string().optional(),
    deliveryNotes: z.string().optional(),
  }),
});

export const bookingIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const myBookingsQuerySchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.toUpperCase() : v),
        z.enum([
          'PENDING_APPROVAL',
          'APPROVED_AWAITING_PAYMENT',
          'CONFIRMED',
          'IN_TRANSIT',
          'DELIVERED_PENDING_CUSTOMER_CONFIRMATION',
          'COMPLETED',
          'REJECTED',
          'CANCELLED',
          'DISPUTED',
        ])
      )
      .optional(),
  }).optional(),
});

// ─── Review DTOs ────────────────────────────────────────────

export const createReviewSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
  }),
});

export const travellerReviewsQuerySchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
  }).optional(),
});

// ─── Dispute DTOs ───────────────────────────────────────────

export const createDisputeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    reason: z.preprocess(
      (v) => (typeof v === 'string' ? v.toUpperCase() : v),
      z.enum([
        'ITEM_NOT_RECEIVED',
        'ITEM_DAMAGED',
        'ITEM_MISSING',
        'WRONG_ITEM',
        'DELIVERY_DELAY',
        'OTHER',
      ])
    ),
    description: z.string().min(1, 'Description is required'),
    evidence: z.array(z.string().url()).optional(),
  }),
});

export const disputeResponseSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    responseText: z.string().min(1, 'Response text is required'),
    evidence: z.array(z.string().url()).optional(),
  }),
});

export const adminDisputeListSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.toUpperCase() : v),
        z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED_FOR_CUSTOMER', 'RESOLVED_FOR_TRAVELLER', 'CLOSED'])
      )
      .optional(),
  }).optional(),
});

export const adminUpdateDisputeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.preprocess(
      (v) => (typeof v === 'string' ? v.toUpperCase() : v),
      z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED_FOR_CUSTOMER', 'RESOLVED_FOR_TRAVELLER', 'CLOSED'])
    ),
    adminNotes: z.string().optional(),
    resolutionNotes: z.string().optional(),
    releasePayout: z.boolean().optional(),
  }),
});

// ─── Admin Flight Proof DTOs ────────────────────────────────

export const adminFlightProofListSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
  }).optional(),
});

export const adminReviewFlightProofSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    flightProofVerified: z.boolean(),
    rejectionReason: z.string().optional(),
  }).refine(
    (data) => data.flightProofVerified || (data.rejectionReason && data.rejectionReason.length > 0),
    { message: 'Rejection reason is required when rejecting flight proof' }
  ),
});

// ─── Types ──────────────────────────────────────────────────

export type CreateListingDto = z.infer<typeof createListingSchema>['body'];
export type UpdateListingDto = z.infer<typeof updateListingSchema>['body'];
export type CreateBookingDto = z.infer<typeof createBookingSchema>['body'];
export type CreateReviewDto = z.infer<typeof createReviewSchema>['body'];
export type CreateDisputeDto = z.infer<typeof createDisputeSchema>['body'];
export type DisputeResponseDto = z.infer<typeof disputeResponseSchema>['body'];
export type AdminUpdateDisputeDto = z.infer<typeof adminUpdateDisputeSchema>['body'];
export type AdminReviewFlightProofDto = z.infer<typeof adminReviewFlightProofSchema>['body'];
