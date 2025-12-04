import { Router } from 'express';
import { onboardingController } from './controller';
import { validate } from '../../middleware/validator';
import { authenticate } from '../../middleware/auth';
import {
  completeOnboardingStepSchema,
  getOnboardingStatusSchema,
} from './dto';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get onboarding status
router.get(
  '/status',
  validate(getOnboardingStatusSchema),
  onboardingController.getOnboardingStatus
);

// Complete an onboarding step
router.post(
  '/complete-step',
  validate(completeOnboardingStepSchema),
  onboardingController.completeStep
);

export default router;

