import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from './service';
import { CreateSubscriptionCheckoutDto } from './dto';
import { AuthRequest } from '../../middleware/auth';

export const subscriptionController = {
  async createCheckoutSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateSubscriptionCheckoutDto;
      const result = await subscriptionService.createCheckoutSession(req, dto);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const result = await subscriptionService.handleStripeWebhook(req.body, sig);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMySubscription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const subscription = await subscriptionService.getMySubscription(req);

      res.status(200).json({
        status: 'success',
        data: subscription,
      });
    } catch (error) {
      next(error);
    }
  },

  async syncSubscription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({
          status: 'error',
          message: 'Session ID is required',
        });
      }

      const result = await subscriptionService.syncSubscriptionFromStripe(req, sessionId);
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  },

  async cancelSubscription(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const result = await subscriptionService.cancelSubscription(req, reason);
      res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.subscription,
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePaymentMethod(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await subscriptionService.updatePaymentMethod(req);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

