import { Router } from 'express';
import { extraChargeController } from './controller';
import { authenticate, requireCompanyAccess, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  createExtraChargeSchema,
  listExtraChargesSchema,
  payExtraChargeSchema,
  declineExtraChargeSchema,
  cancelExtraChargeSchema,
} from './dto';

const router = Router();

// Company creates extra charge request
router.post(
  '/bookings/:bookingId/extra-charges',
  authenticate,
  requireCompanyAccess,
  validate(createExtraChargeSchema),
  extraChargeController.createExtraCharge
);

// List extra charges for a booking (customer or company)
router.get(
  '/bookings/:bookingId/extra-charges',
  authenticate,
  validate(listExtraChargesSchema),
  extraChargeController.listExtraCharges
);

// Customer pays an extra charge
router.post(
  '/bookings/:bookingId/extra-charges/:extraChargeId/pay',
  authenticate,
  requireRole('CUSTOMER'),
  validate(payExtraChargeSchema),
  extraChargeController.payExtraCharge
);

// Customer declines an extra charge
router.post(
  '/bookings/:bookingId/extra-charges/:extraChargeId/decline',
  authenticate,
  requireRole('CUSTOMER'),
  validate(declineExtraChargeSchema),
  extraChargeController.declineExtraCharge
);

// Company cancels an extra charge request
router.post(
  '/bookings/:bookingId/extra-charges/:extraChargeId/cancel',
  authenticate,
  requireCompanyAccess,
  validate(cancelExtraChargeSchema),
  extraChargeController.cancelExtraCharge
);

export default router;

