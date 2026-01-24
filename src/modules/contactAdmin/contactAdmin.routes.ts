import { Router } from 'express';
import { contactAdminController } from './contactAdmin.controller';
import { validate } from '../../middleware/validator';
import { analyticsLimiter } from '../../middleware/rateLimiter';
import {
  listContactMessagesSchema,
  getContactMessageSchema,
  updateContactMessageSchema,
} from './contactAdmin.validation';

const router = Router();

router.get(
  '/',
  analyticsLimiter,
  validate(listContactMessagesSchema),
  contactAdminController.listContactMessages
);

router.get(
  '/:id',
  analyticsLimiter,
  validate(getContactMessageSchema),
  contactAdminController.getContactMessage
);

router.patch(
  '/:id',
  validate(updateContactMessageSchema),
  contactAdminController.updateContactMessage
);

export default router;

