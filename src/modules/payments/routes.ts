import { Router } from 'express';
import { paymentController } from './controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { createCheckoutSessionSchema } from './dto';

const router = Router();

router.post(
  '/checkout-session',
  authenticate,
  requireRole('CUSTOMER'),
  validate(createCheckoutSessionSchema),
  paymentController.createCheckoutSession
);

// Sync payment status manually (useful if webhook failed)
router.post(
  '/bookings/:bookingId/sync',
  authenticate,
  paymentController.syncPaymentStatus
);

// Webhook route (no authentication, verified by Stripe signature)
// Raw body parser is applied at app level for this route
router.post(
  '/webhooks/stripe',
  paymentController.handleWebhook
);

export default router;

