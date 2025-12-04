import { Response, NextFunction } from 'express';
import { customerService } from './service';
import { paymentService } from '../payments/service';
import { AuthRequest } from '../../middleware/auth';

export const customerController = {
  async getDashboardStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await customerService.getDashboardStats(req);
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRecentBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const bookings = await customerService.getRecentBookings(req, limit);
      res.status(200).json({
        status: 'success',
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  },

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await customerService.getProfile(req);
      res.status(200).json({
        status: 'success',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await customerService.updateProfile(req, req.body);
      res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.profile,
      });
    } catch (error) {
      next(error);
    }
  },

  async completeOnboarding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await customerService.completeOnboarding(req, req.body);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await customerService.changePassword(req, req.body);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async getNotificationPreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const preferences = await customerService.getNotificationPreferences(req);
      res.status(200).json({
        status: 'success',
        data: preferences,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateNotificationPreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await customerService.updateNotificationPreferences(req, req.body);
      res.status(200).json({
        status: 'success',
        message: result.message,
        data: result.preferences,
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await customerService.cancelBooking(req, req.params.id);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async createPaymentSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await paymentService.createCheckoutSession(req, {
        bookingId: req.params.id,
      });
      res.status(200).json({
        status: 'success',
        message: 'Payment session created successfully',
        data: {
          sessionId: result.sessionId,
          url: result.url,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async syncPaymentStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sessionId = req.query?.session_id as string | undefined;
      const result = await paymentService.syncPaymentStatus(req, req.params.id, sessionId);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async trackShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const trackingInfo = await customerService.trackShipment(req, bookingId);
      res.status(200).json({
        status: 'success',
        data: trackingInfo,
      });
    } catch (error) {
      next(error);
    }
  },
};

