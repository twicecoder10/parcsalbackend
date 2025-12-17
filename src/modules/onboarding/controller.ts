import { Response, NextFunction } from 'express';
import { onboardingService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const onboardingController = {
  async getOnboardingStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await onboardingService.getOnboardingStatus(req, req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async completeStep(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await onboardingService.completeStep(req, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};

