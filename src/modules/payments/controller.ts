import { Request, Response, NextFunction } from 'express';
import { paymentService } from './service';
import { CreateCheckoutSessionDto, ProcessRefundDto } from './dto';
import { AuthRequest } from '../../middleware/auth';

export const paymentController = {
  async createCheckoutSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateCheckoutSessionDto;
      const result = await paymentService.createCheckoutSession(req, dto);

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
      const result = await paymentService.handleStripeWebhook(req.body, sig);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async syncPaymentStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const sessionId = req.query?.session_id as string | undefined;
      const result = await paymentService.syncPaymentStatus(req, bookingId, sessionId);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // Company Payment Management Controllers
  async getCompanyPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await paymentService.getCompanyPayments(req, req.query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyPaymentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const payment = await paymentService.getCompanyPaymentById(req, paymentId);

      res.status(200).json({
        status: 'success',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyPaymentStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await paymentService.getCompanyPaymentStats(req, req.query);

      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async processRefund(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { paymentId } = req.params;
      const dto = req.body as ProcessRefundDto;
      const payment = await paymentService.processRefund(req, paymentId, dto);

      res.status(200).json({
        status: 'success',
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  },
};

