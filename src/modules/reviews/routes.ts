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

router.get(
  '/companies/:companyId/reviews',
  validate(getCompanyReviewsSchema),
  reviewController.getCompanyReviews
);

router.get(
  '/companies/:companyId/reviews/stats',
  reviewController.getCompanyReviewStats
);

// Company routes (authenticated)
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

