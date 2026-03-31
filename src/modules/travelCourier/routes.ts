import { Router } from 'express';
import { travelCourierController } from './controller';
import { validate } from '../../middleware/validator';
import { authenticate, requireRole } from '../../middleware/auth';
import {
  createListingSchema,
  updateListingSchema,
  listingIdParamSchema,
  searchListingsSchema,
  createBookingSchema,
  bookingIdParamSchema,
  myBookingsQuerySchema,
  createReviewSchema,
  travellerReviewsQuerySchema,
  createDisputeSchema,
  disputeResponseSchema,
  adminDisputeListSchema,
  adminUpdateDisputeSchema,
  adminFlightProofListSchema,
  adminReviewFlightProofSchema,
  travellerConnectOnboardSchema,
} from './dto';

const router = Router();

// ─── Public Search ─────────────────────────────────────────
router.get(
  '/listings',
  validate(searchListingsSchema),
  travelCourierController.searchListings
);

router.get(
  '/listings/:id',
  validate(listingIdParamSchema),
  travelCourierController.getPublicListingById
);

// ─── Public Traveller Reviews ──────────────────────────────
router.get(
  '/travellers/:userId/reviews',
  validate(travellerReviewsQuerySchema),
  travelCourierController.getTravellerReviews
);

// ─── Traveller Stripe Connect ───────────────────────────────
router.post(
  '/connect/onboard',
  authenticate,
  validate(travellerConnectOnboardSchema),
  travelCourierController.createConnectOnboardingLink
);

router.get(
  '/connect/status',
  authenticate,
  travelCourierController.getConnectStatus
);

router.post(
  '/connect/dashboard-link',
  authenticate,
  travelCourierController.getConnectDashboardLink
);

router.get(
  '/connect/balance',
  authenticate,
  travelCourierController.getConnectBalance
);

router.get(
  '/earnings',
  authenticate,
  travelCourierController.getEarnings
);

// ─── Listing Management (traveller) ────────────────────────
router.post(
  '/listings',
  authenticate,
  validate(createListingSchema),
  travelCourierController.createListing
);

router.get(
  '/my-listings',
  authenticate,
  travelCourierController.getMyListings
);

router.get(
  '/my-listings/:id',
  authenticate,
  validate(listingIdParamSchema),
  travelCourierController.getMyListingById
);

router.patch(
  '/my-listings/:id',
  authenticate,
  validate(updateListingSchema),
  travelCourierController.updateListing
);

router.post(
  '/my-listings/:id/publish',
  authenticate,
  validate(listingIdParamSchema),
  travelCourierController.publishListing
);

router.post(
  '/my-listings/:id/close',
  authenticate,
  validate(listingIdParamSchema),
  travelCourierController.closeListing
);

// ─── Traveller Booking Management ──────────────────────────
router.get(
  '/my-listing-bookings',
  authenticate,
  validate(myBookingsQuerySchema),
  travelCourierController.getBookingsForMyListings
);

router.post(
  '/bookings/:id/approve',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.approveBooking
);

router.post(
  '/bookings/:id/reject',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.rejectBooking
);

router.post(
  '/bookings/:id/mark-delivered',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.markDelivered
);

// ─── Traveller: Dispute View & Response ────────────────────
router.get(
  '/bookings/:id/dispute',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.getDisputeForTraveller
);

router.post(
  '/bookings/:id/dispute-response',
  authenticate,
  validate(disputeResponseSchema),
  travelCourierController.respondToDispute
);

// ─── Customer Booking Routes ───────────────────────────────
router.post(
  '/listings/:id/book',
  authenticate,
  validate(createBookingSchema),
  travelCourierController.createBooking
);

router.get(
  '/my-bookings',
  authenticate,
  validate(myBookingsQuerySchema),
  travelCourierController.getMyBookingsAsCustomer
);

router.get(
  '/my-bookings/:id',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.getMyBookingById
);

router.post(
  '/my-bookings/:id/payment',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.getPaymentUrl
);

router.post(
  '/my-bookings/:id/confirm-delivery',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.confirmDelivery
);

// ─── Customer: Reviews ─────────────────────────────────────
router.post(
  '/my-bookings/:id/review',
  authenticate,
  validate(createReviewSchema),
  travelCourierController.createReview
);

router.get(
  '/my-bookings/:id/review',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.getBookingReview
);

// ─── Customer: Disputes ────────────────────────────────────
router.post(
  '/my-bookings/:id/dispute',
  authenticate,
  validate(createDisputeSchema),
  travelCourierController.openDispute
);

router.get(
  '/my-bookings/:id/dispute',
  authenticate,
  validate(bookingIdParamSchema),
  travelCourierController.getDisputeForCustomer
);

// ─── Admin: Flight Proof ───────────────────────────────────
router.get(
  '/admin/listings/pending-flight-proof',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(adminFlightProofListSchema),
  travelCourierController.listPendingFlightProof
);

router.patch(
  '/admin/listings/:id/review-flight-proof',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(adminReviewFlightProofSchema),
  travelCourierController.reviewFlightProof
);

// ─── Admin: Disputes ───────────────────────────────────────
router.get(
  '/admin/disputes',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(adminDisputeListSchema),
  travelCourierController.listDisputes
);

router.get(
  '/admin/disputes/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  travelCourierController.getDisputeById
);

router.patch(
  '/admin/disputes/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(adminUpdateDisputeSchema),
  travelCourierController.adminUpdateDispute
);

export default router;
