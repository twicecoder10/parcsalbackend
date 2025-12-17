import { Router } from 'express';
import { paymentController } from './controller';
import { authenticate, requireCompanyAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { requireStaffPermission } from '../../utils/permissions';
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
  requireStaffPermission('viewPayments'),
  validate(listCompanyPaymentsSchema),
  paymentController.getCompanyPayments
);

// Get payment statistics
router.get(
  '/stats',
  authenticate,
  requireCompanyAccess,
  requireStaffPermission('viewPaymentStats'),
  validate(getPaymentStatsSchema),
  paymentController.getCompanyPaymentStats
);

// Get payment by ID
router.get(
  '/:paymentId',
  authenticate,
  requireCompanyAccess,
  requireStaffPermission('viewPayments'),
  validate(getPaymentByIdSchema),
  paymentController.getCompanyPaymentById
);

// Process refund
router.post(
  '/:paymentId/refund',
  authenticate,
  requireCompanyAccess,
  requireStaffPermission('processRefund'),
  validate(processRefundSchema),
  paymentController.processRefund
);

export default router;

