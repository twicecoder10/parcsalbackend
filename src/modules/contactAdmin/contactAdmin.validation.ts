import { z } from 'zod';

const contactStatusEnum = z.enum(['NEW', 'READ', 'RESOLVED']);

export const listContactMessagesSchema = z.object({
  query: z
    .object({
      status: z
        .preprocess(
          (value) => (typeof value === 'string' ? value.toUpperCase() : value),
          contactStatusEnum
        )
        .optional(),
      search: z.string().min(1).optional(),
      page: z
        .preprocess(
          (value) => (typeof value === 'string' ? parseInt(value, 10) : value),
          z.number().int().min(1)
        )
        .optional(),
      limit: z
        .preprocess(
          (value) => (typeof value === 'string' ? parseInt(value, 10) : value),
          z.number().int().min(1).max(100)
        )
        .optional(),
    })
    .optional(),
});

export const getContactMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Contact message id is required'),
  }),
});

export const updateContactMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Contact message id is required'),
  }),
  body: z.object({
    status: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      contactStatusEnum
    ),
  }),
});

export type ListContactMessagesQuery = z.infer<typeof listContactMessagesSchema>['query'];
export type UpdateContactMessageDto = z.infer<typeof updateContactMessageSchema>['body'];

