import { Request, Response, NextFunction } from 'express';
import { planService } from './service';

export const planController = {
  async listPlans(_req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await planService.listPlans();

      res.status(200).json({
        status: 'success',
        data: plans,
      });
    } catch (error) {
      next(error);
    }
  },
};

