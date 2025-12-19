import { Router } from 'express';
import { connectController } from './controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { createOnboardingLinkSchema, requestPayoutSchema } from './dto';

const router = Router();

// All routes require authentication and company admin role
router.use(authenticate);
router.use(requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'));

// Create onboarding link
router.post(
  '/onboarding-link',
  validate(createOnboardingLinkSchema),
  connectController.createOnboardingLink
);

// Get account status
router.get('/status', connectController.getStatus);

// Get balance
router.get('/balance', connectController.getBalance);

// Get account info (for debugging)
router.get('/account-info', connectController.getAccountInfo);

// Request payout
router.post(
  '/request-payout',
  validate(requestPayoutSchema),
  connectController.requestPayout
);

export default router;

