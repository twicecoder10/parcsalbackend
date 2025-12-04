import { Router } from 'express';
import { planController } from './controller';

const router = Router();

// Public endpoint
router.get('/', planController.listPlans);

export default router;

