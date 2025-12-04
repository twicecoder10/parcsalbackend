import { Response } from 'express';
import { onboardingService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const onboardingController = {
  async getOnboardingStatus(req: AuthRequest, res: Response) {
    const result = await onboardingService.getOnboardingStatus(req, req.query as any);
    res.json(result);
  },

  async completeStep(req: AuthRequest, res: Response) {
    const result = await onboardingService.completeStep(req, req.body);
    res.json(result);
  },
};

