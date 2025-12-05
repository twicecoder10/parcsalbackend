import { Router } from 'express';
import { customerController } from './controller';
import { bookingController } from '../bookings/controller';
import { validate } from '../../middleware/validator';
import { authenticate, requireRole } from '../../middleware/auth';
import {
  completeCustomerOnboardingSchema,
  updateCustomerProfileSchema,
  changePasswordSchema,
  updateNotificationPreferencesSchema,
  getRecentBookingsSchema,
  cancelBookingSchema,
  trackShipmentSchema,
  createPaymentSessionSchema,
  syncPaymentStatusSchema,
} from './dto';
import { listBookingsSchema, getBookingSchema, createBookingSchema } from '../bookings/dto';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireRole('CUSTOMER'));

// Dashboard
router.get('/dashboard/stats', customerController.getDashboardStats);
router.get('/bookings/recent', validate(getRecentBookingsSchema), customerController.getRecentBookings);

// Profile
router.get('/profile', customerController.getProfile);
router.put('/profile', validate(updateCustomerProfileSchema), customerController.updateProfile);
router.put(
  '/profile/onboarding',
  validate(completeCustomerOnboardingSchema),
  customerController.completeOnboarding
);
router.post('/profile/change-password', validate(changePasswordSchema), customerController.changePassword);

// Notifications
router.get('/notifications/preferences', customerController.getNotificationPreferences);
router.put(
  '/notifications/preferences',
  validate(updateNotificationPreferencesSchema),
  customerController.updateNotificationPreferences
);

// Bookings

// Bookings
router.post('/bookings', validate(createBookingSchema), bookingController.createBooking);
router.get('/bookings', validate(listBookingsSchema), bookingController.getMyBookings);
router.get('/bookings/:id', validate(getBookingSchema), bookingController.getBookingById);
router.post('/bookings/:id/cancel', validate(cancelBookingSchema), customerController.cancelBooking);

// Payment - Create checkout session for booking payment
router.post('/bookings/:id/payment', validate(createPaymentSessionSchema), customerController.createPaymentSession);
// Sync payment status (useful if webhook failed)
router.post('/bookings/:id/payment/sync', validate(syncPaymentStatusSchema), customerController.syncPaymentStatus);

// Tracking
router.get(
  '/bookings/:bookingId/track',
  validate(trackShipmentSchema),
  customerController.trackShipment
);

export default router;

