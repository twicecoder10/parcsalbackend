import { Router } from 'express';
import { paymentController } from './controller';
import { authenticate, requireCompanyAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  listCompanyPaymentsSchema,
  getPaymentByIdSchema,
  getPaymentStatsSchema,
  processRefundSchema,
} from './dto';

const router = Router();

// Get payments list for company
router.get(
  '/',
  authenticate,
  requireCompanyAccess,
  validate(listCompanyPaymentsSchema),
  paymentController.getCompanyPayments
);

// Get payment statistics
router.get(
  '/stats',
  authenticate,
  requireCompanyAccess,
  validate(getPaymentStatsSchema),
  paymentController.getCompanyPaymentStats
);

// Get payment by ID
router.get(
  '/:paymentId',
  authenticate,
  requireCompanyAccess,
  validate(getPaymentByIdSchema),
  paymentController.getCompanyPaymentById
);

// Process refund
router.post(
  '/:paymentId/refund',
  authenticate,
  requireCompanyAccess,
  validate(processRefundSchema),
  paymentController.processRefund
);

export default router;

