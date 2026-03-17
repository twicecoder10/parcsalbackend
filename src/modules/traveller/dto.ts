import { z } from 'zod';

export const upsertTravellerProfileSchema = z.object({
  body: z.object({
    idDocumentUrl: z.string().url('Invalid ID document URL').optional(),
    selfieUrl: z.string().url('Invalid selfie URL').optional(),
    flightTicketUrl: z.string().url('Invalid flight ticket URL').optional(),
  }),
});

export const updateTravellerProfileSchema = z.object({
  body: z.object({
    idDocumentUrl: z.string().url('Invalid ID document URL').optional(),
    selfieUrl: z.string().url('Invalid selfie URL').optional(),
    flightTicketUrl: z.string().url('Invalid flight ticket URL').optional(),
  }).refine(
    (data) => data.idDocumentUrl || data.selfieUrl || data.flightTicketUrl,
    { message: 'At least one document URL is required' }
  ),
});

export const listTravellerProfilesSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    verificationStatus: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.toUpperCase() : v),
        z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED'])
      )
      .optional(),
  }).optional(),
});

export const reviewTravellerProfileSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Profile ID is required'),
  }),
  body: z.object({
    verificationStatus: z.enum(['VERIFIED', 'REJECTED']),
    rejectionReason: z.string().optional(),
  }).refine(
    (data) =>
      data.verificationStatus !== 'REJECTED' || (data.rejectionReason && data.rejectionReason.length > 0),
    { message: 'Rejection reason is required when rejecting' }
  ),
});

export type UpsertTravellerProfileDto = z.infer<typeof upsertTravellerProfileSchema>['body'];
export type UpdateTravellerProfileDto = z.infer<typeof updateTravellerProfileSchema>['body'];
export type ReviewTravellerProfileDto = z.infer<typeof reviewTravellerProfileSchema>['body'];
