import { Router } from 'express';
import { subscriptionController } from './controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { createSubscriptionCheckoutSchema } from './dto';

const router = Router();

// All subscription management endpoints require COMPANY_ADMIN role
router.post(
  '/checkout-session',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  validate(createSubscriptionCheckoutSchema),
  subscriptionController.createCheckoutSession
);

// Get current company subscription
router.get(
  '/me',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  subscriptionController.getMySubscription
);

// Company admin subscription routes (matching FE requirements)
router.get(
  '/',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  subscriptionController.getMySubscription
);

// Sync subscription from Stripe (for manual recovery)
router.post(
  '/sync',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  subscriptionController.syncSubscription
);

// Cancel subscription
router.post(
  '/cancel',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  subscriptionController.cancelSubscription
);

// Update payment method
router.put(
  '/payment-method',
  authenticate,
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  subscriptionController.updatePaymentMethod
);

// Webhook route (no authentication, verified by Stripe signature)
// Raw body parser is applied at app level for this route
router.post(
  '/webhooks/stripe-subscriptions',
  subscriptionController.handleWebhook
);

export default router;

