import { Response, NextFunction } from 'express';
import { notificationService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const notificationController = {
  async getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.getNotifications(req, req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.getUnreadCount(req);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { notificationId } = req.params;
      const result = await notificationService.markAsRead(req, notificationId);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.markAllAsRead(req);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { notificationId } = req.params;
      const result = await notificationService.deleteNotification(req, notificationId);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteAllRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationService.deleteAllRead(req);
      res.status(200).json({
        status: 'success',
        message: result.message,
        count: result.count,
      });
    } catch (error) {
      next(error);
    }
  },
};

