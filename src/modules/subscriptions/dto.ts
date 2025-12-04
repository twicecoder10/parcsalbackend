import { z } from 'zod';

export const createSubscriptionCheckoutSchema = z.object({
  body: z.object({
    planId: z.string().uuid('Invalid plan ID'),
    returnUrl: z.string().optional(), // Optional redirect URL after payment (e.g., '/onboarding')
    fromOnboarding: z.boolean().optional(), // Flag to indicate this is part of onboarding flow
  }),
});

export type CreateSubscriptionCheckoutDto = z.infer<typeof createSubscriptionCheckoutSchema>['body'];

