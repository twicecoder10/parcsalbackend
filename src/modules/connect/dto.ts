import { z } from 'zod';

export const createOnboardingLinkSchema = z.object({
  body: z.object({
    returnUrl: z.string().url('Invalid return URL'),
  }),
});

export const requestPayoutSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
  }),
});

export type CreateOnboardingLinkDto = z.infer<typeof createOnboardingLinkSchema>['body'];
export type RequestPayoutDto = z.infer<typeof requestPayoutSchema>['body'];

