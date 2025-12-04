import { z } from 'zod';

export const submitContactSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(10, 'Message must be at least 10 characters'),
  }),
});

export type SubmitContactDto = z.infer<typeof submitContactSchema>['body'];

