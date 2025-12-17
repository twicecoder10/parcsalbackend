import { Router } from 'express';
import { reviewController } from './controller';
import { authenticate, requireCompanyAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  createReviewSchema,
  updateReviewSchema,
  getReviewSchema,
  getCompanyReviewsSchema,
  getMyReviewsSchema,
  getMyCompanyReviewsSchema,
  replyToReviewSchema,
} from './dto';

const router = Router();

// Customer routes (authenticated)
router.post(
  '/customer/bookings/:bookingId/reviews',
  authenticate,
  validate(createReviewSchema),
  reviewController.createReview
);

router.put(
  '/customer/bookings/:bookingId/reviews',
  authenticate,
  validate(updateReviewSchema),
  reviewController.updateReview
);

router.delete(
  '/customer/bookings/:bookingId/reviews',
  authenticate,
  validate(getReviewSchema),
  reviewController.deleteReview
);

router.get(
  '/customer/reviews',
  authenticate,
  validate(getMyReviewsSchema),
  reviewController.getMyReviews
);

// Public routes
router.get(
  '/bookings/:bookingId/reviews',
  validate(getReviewSchema),
  reviewController.getReview
);

// Company routes (authenticated) - MUST come before parameterized routes
router.get(
  '/companies/me/reviews',
  authenticate,
  requireCompanyAccess,
  validate(getMyCompanyReviewsSchema),
  reviewController.getMyCompanyReviews
);

router.get(
  '/companies/me/reviews/stats',
  authenticate,
  requireCompanyAccess,
  reviewController.getMyCompanyReviewStats
);

// Public company routes (parameterized) - MUST come after /me routes
router.get(
  '/companies/:companyIdOrSlug/reviews',
  validate(getCompanyReviewsSchema),
  reviewController.getCompanyReviews
);

router.get(
  '/companies/:companyIdOrSlug/reviews/stats',
  reviewController.getCompanyReviewStats
);

router.post(
  '/companies/bookings/:bookingId/reviews/reply',
  authenticate,
  requireCompanyAccess,
  validate(replyToReviewSchema),
  reviewController.replyToReview
);

router.put(
  '/companies/bookings/:bookingId/reviews/reply',
  authenticate,
  requireCompanyAccess,
  validate(replyToReviewSchema),
  reviewController.replyToReview
);

export default router;

