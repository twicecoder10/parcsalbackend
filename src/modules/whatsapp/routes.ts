import { Router } from 'express';
import { whatsappController } from './controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Webhook routes (no authentication required - Meta verifies via token)
router.get('/webhooks/whatsapp', whatsappController.verifyWebhook);
router.post('/webhooks/whatsapp', whatsappController.handleWebhook);

// User opt-in route
router.patch('/me/whatsapp-opt-in', authenticate, whatsappController.updateOptIn);

// Admin routes
router.get(
  '/admin/whatsapp-messages',
  authenticate,
  requireRole('SUPER_ADMIN'),
  whatsappController.getMessages
);

export default router;
