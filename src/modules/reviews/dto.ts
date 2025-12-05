import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

export const createReviewSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
  body: z.object({
    rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
    comment: z.string().max(1000, 'Comment must be at most 1000 characters').optional().nullable(),
  }),
});

export const updateReviewSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
  body: z.object({
    rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5').optional(),
    comment: z.string().max(1000, 'Comment must be at most 1000 characters').optional().nullable(),
  }),
});

export const getReviewSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
});

export const getCompanyReviewsSchema = z.object({
  params: z.object({
    companyId: z.string().uuid('Invalid company ID'),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    rating: z.string().optional(),
  }),
});

export const getMyReviewsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
  }),
});

export const replyToReviewSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
  body: z.object({
    reply: z.string().min(1, 'Reply cannot be empty').max(1000, 'Reply must be at most 1000 characters'),
  }),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>['body'];
export type UpdateReviewDto = z.infer<typeof updateReviewSchema>['body'];
export type ReplyToReviewDto = z.infer<typeof replyToReviewSchema>['body'];

