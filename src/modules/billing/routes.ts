import { Router } from 'express';
import { billingWebhookController } from './webhook-controller';

const router = Router();

// Webhook route (no authentication, verified by Stripe signature)
// Raw body parser is applied at app level for this route
router.post(
  '/webhooks/stripe/billing',
  billingWebhookController.handleWebhook
);

export default router;

