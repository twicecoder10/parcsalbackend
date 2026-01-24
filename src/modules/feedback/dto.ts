import { z } from 'zod';

const feedbackTypeEnum = z.enum(['BUG', 'FEATURE', 'COMPLAINT', 'GENERAL']);
const feedbackAppEnum = z.enum(['WEB', 'MOBILE']);
const feedbackStatusEnum = z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED']);
const feedbackPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const submitFeedbackSchema = z.object({
  body: z.object({
    type: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackTypeEnum
    ),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().min(1, 'Message is required'),
    pageUrl: z.string().url('Invalid page URL').optional(),
    app: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackAppEnum
    ),
    attachments: z.array(z.string().url('Invalid attachment URL')).max(10).optional(),
  }),
});

export const listFeedbackSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackStatusEnum
    ).optional(),
    type: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackTypeEnum
    ).optional(),
    app: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackAppEnum
    ).optional(),
  }).optional(),
});

export const updateFeedbackSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Feedback id is required'),
  }),
  body: z.object({
    status: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackStatusEnum
    ).optional(),
    priority: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      feedbackPriorityEnum
    ).optional(),
  }).refine((data) => data.status || data.priority, {
    message: 'At least one of status or priority is required',
  }),
});

export const getFeedbackSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Feedback id is required'),
  }),
});

export type SubmitFeedbackDto = z.infer<typeof submitFeedbackSchema>['body'];
export type ListFeedbackQuery = z.infer<typeof listFeedbackSchema>['query'];
export type UpdateFeedbackDto = z.infer<typeof updateFeedbackSchema>['body'];

