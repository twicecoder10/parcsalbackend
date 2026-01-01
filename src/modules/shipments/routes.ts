import { Router } from 'express';
import { shipmentController } from './controller';
import { authenticate, requireCompanyAccess, optionalAuthenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { searchLimiter } from '../../middleware/rateLimiter';
import {
  createShipmentSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
  updateShipmentTrackingStatusSchema,
  searchShipmentsSchema,
  getShipmentSchema,
  trackShipmentByBookingSchema,
} from './dto';

const router = Router();

// Public routes
router.get(
  '/search',
  searchLimiter,
  validate(searchShipmentsSchema),
  shipmentController.searchShipments
);
router.get('/track/:bookingId', validate(trackShipmentByBookingSchema), shipmentController.trackShipmentByBooking);
// Optional auth - if authenticated company user, skip verification check
router.get('/:id', optionalAuthenticate, validate(getShipmentSchema), shipmentController.getShipmentById);

// Company routes
router.post(
  '/',
  authenticate,
  requireCompanyAccess,
  validate(createShipmentSchema),
  shipmentController.createShipment
);

router.get(
  '/company',
  authenticate,
  requireCompanyAccess,
  shipmentController.getMyShipments
);

// Company admin routes (matching FE requirements)
router.get(
  '/',
  authenticate,
  requireCompanyAccess,
  shipmentController.getMyShipments
);

router.patch(
  '/:id',
  authenticate,
  requireCompanyAccess,
  validate(updateShipmentSchema),
  shipmentController.updateShipment
);

router.patch(
  '/:id/status',
  authenticate,
  requireCompanyAccess,
  validate(updateShipmentStatusSchema),
  shipmentController.updateShipmentStatus
);

router.patch(
  '/:id/tracking-status',
  authenticate,
  requireCompanyAccess,
  validate(updateShipmentTrackingStatusSchema),
  shipmentController.updateShipmentTrackingStatus
);

router.delete(
  '/:id',
  authenticate,
  requireCompanyAccess,
  shipmentController.deleteShipment
);

router.get(
  '/:shipmentId/bookings',
  authenticate,
  requireCompanyAccess,
  shipmentController.getShipmentBookings
);

export default router;

