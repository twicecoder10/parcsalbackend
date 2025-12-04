import { z } from 'zod';

export const completeOnboardingStepSchema = z.object({
  body: z.object({
    step: z.string().min(1, 'Step name is required'),
  }),
});

export const getOnboardingStatusSchema = z.object({
  query: z.object({
    type: z.enum(['user', 'company']).optional(),
  }),
});

export type CompleteOnboardingStepDto = z.infer<typeof completeOnboardingStepSchema>['body'];
export type GetOnboardingStatusDto = z.infer<typeof getOnboardingStatusSchema>['query'];

