import { Router } from 'express';
import { contactController } from './controller';
import { validate } from '../../middleware/validator';
import { submitContactSchema } from './dto';

const router = Router();

router.post(
  '/',
  validate(submitContactSchema),
  contactController.submitContact
);

export default router;

