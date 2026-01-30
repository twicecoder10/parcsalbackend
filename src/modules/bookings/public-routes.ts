import { Router } from 'express';
import { bookingController } from './controller';
import { validate } from '../../middleware/validator';
import { getPublicBookingTrackingSchema, getPublicBookingTrackingQuerySchema } from './dto';

const router = Router();

// Public booking tracking timeline
router.get(
  '/track/:id',
  validate(getPublicBookingTrackingSchema),
  bookingController.getPublicBookingTrackingTimeline
);

router.get(
  '/track',
  validate(getPublicBookingTrackingQuerySchema),
  bookingController.getPublicBookingTrackingTimelineFromQuery
);

export default router;

