import { Router } from 'express';
import { feedbackController } from './controller';
import { validate } from '../../middleware/validator';
import { submitFeedbackSchema, listFeedbackSchema, updateFeedbackSchema, getFeedbackSchema } from './dto';
import { authenticate, optionalAuthenticate, requireRole } from '../../middleware/auth';
import { feedbackImageUpload } from '../../utils/upload';

const router = Router();

// Public feedback submission (optional auth)
router.post(
  '/feedback',
  optionalAuthenticate,
  validate(submitFeedbackSchema),
  feedbackController.submitFeedback
);

// Optional screenshot uploads for feedback
router.post(
  '/feedback/attachments',
  optionalAuthenticate,
  feedbackImageUpload.array('images', 5),
  feedbackController.uploadFeedbackAttachments
);

// Admin feedback management
router.get(
  '/admin/feedback',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(listFeedbackSchema),
  feedbackController.listFeedback
);

router.get(
  '/admin/feedback/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(getFeedbackSchema),
  feedbackController.getFeedback
);

router.patch(
  '/admin/feedback/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(updateFeedbackSchema),
  feedbackController.updateFeedback
);

export default router;

