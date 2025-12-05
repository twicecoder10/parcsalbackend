import { Router } from 'express';
import { bookingController } from './controller';
import { authenticate, requireCompanyAccess, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  createBookingSchema,
  updateBookingStatusSchema,
  getBookingSchema,
  listBookingsSchema,
  addProofImagesSchema,
} from './dto';

const router = Router();

// Customer routes
router.post(
  '/',
  authenticate,
  requireRole('CUSTOMER'),
  validate(createBookingSchema),
  bookingController.createBooking
);

router.get(
  '/me',
  authenticate,
  requireRole('CUSTOMER'),
  validate(listBookingsSchema),
  bookingController.getMyBookings
);

// Company routes
router.get(
  '/company',
  authenticate,
  requireCompanyAccess,
  validate(listBookingsSchema),
  bookingController.getCompanyBookings
);

// Company admin routes (matching FE requirements)
router.get(
  '/',
  authenticate,
  requireCompanyAccess,
  validate(listBookingsSchema),
  bookingController.getCompanyBookings
);

router.patch(
  '/company/:id/status',
  authenticate,
  requireCompanyAccess,
  validate(updateBookingStatusSchema),
  bookingController.updateBookingStatus
);

router.post(
  '/company/:id/accept',
  authenticate,
  requireCompanyAccess,
  bookingController.acceptBooking
);

router.post(
  '/company/:id/reject',
  authenticate,
  requireCompanyAccess,
  bookingController.rejectBooking
);

// Company booking action routes (matching FE requirements)
router.patch(
  '/:id/status',
  authenticate,
  requireCompanyAccess,
  validate(updateBookingStatusSchema),
  bookingController.updateBookingStatus
);

router.post(
  '/:id/accept',
  authenticate,
  requireCompanyAccess,
  bookingController.acceptBooking
);

router.post(
  '/:id/reject',
  authenticate,
  requireCompanyAccess,
  bookingController.rejectBooking
);

router.get(
  '/company/stats',
  authenticate,
  requireCompanyAccess,
  bookingController.getBookingStats
);

// Company booking stats route (matching FE requirements)
router.get(
  '/stats',
  authenticate,
  requireCompanyAccess,
  bookingController.getBookingStats
);

// Company route - Add proof images
router.patch(
  '/company/:id/proof-images',
  authenticate,
  requireCompanyAccess,
  validate(addProofImagesSchema),
  bookingController.addProofImages
);

router.patch(
  '/:id/proof-images',
  authenticate,
  requireCompanyAccess,
  validate(addProofImagesSchema),
  bookingController.addProofImages
);

// Shared route (both customer and company can view their own bookings)
router.get(
  '/:id',
  authenticate,
  validate(getBookingSchema),
  bookingController.getBookingById
);

export default router;

