import { Router } from 'express';
import { travellerController } from './controller';
import { validate } from '../../middleware/validator';
import { authenticate, requireRole } from '../../middleware/auth';
import {
  upsertTravellerProfileSchema,
  updateTravellerProfileSchema,
  listTravellerProfilesSchema,
  reviewTravellerProfileSchema,
} from './dto';

const router = Router();

router.get(
  '/me/traveller-profile',
  authenticate,
  travellerController.getMyProfile
);

router.post(
  '/me/traveller-profile',
  authenticate,
  validate(upsertTravellerProfileSchema),
  travellerController.createProfile
);

router.patch(
  '/me/traveller-profile',
  authenticate,
  validate(updateTravellerProfileSchema),
  travellerController.updateProfile
);

router.get(
  '/admin/traveller-profiles',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(listTravellerProfilesSchema),
  travellerController.listProfiles
);

router.get(
  '/admin/traveller-profiles/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  travellerController.getProfileById
);

router.patch(
  '/admin/traveller-profiles/:id/review',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(reviewTravellerProfileSchema),
  travellerController.reviewProfile
);

export default router;
