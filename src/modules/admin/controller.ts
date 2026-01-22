import { Response, NextFunction } from 'express';
import { adminService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const adminController = {
  // Dashboard
  async getDashboardSummary(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const summary = await adminService.getDashboardSummary();
      res.status(200).json({
        status: 'success',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDashboardStats(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDashboardAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period, metric } = req.query;
      const analytics = await adminService.getDashboardAnalytics(
        period as string,
        metric as string
      );
      res.status(200).json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  },

  // Companies
  async listCompanies(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminService.listCompanies(req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const company = await adminService.getCompany(id);
      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const company = await adminService.verifyCompany(id, true);
      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async unverifyCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const company = await adminService.unverifyCompany(id);
      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async deactivateCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const company = await adminService.deactivateCompany(id, reason);
      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async activateCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const company = await adminService.activateCompany(id);
      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyShipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await adminService.getCompanyShipments(id, req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await adminService.getCompanyBookings(id, req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const stats = await adminService.getCompanyStats(id);
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  // Users
  async listUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminService.listUsers(req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await adminService.getUser(id);
      res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  async activateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await adminService.activateUser(id);
      res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  async deactivateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const user = await adminService.deactivateUser(id, reason);
      res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  async changeUserRole(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const user = await adminService.changeUserRole(id, role);
      res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await adminService.getUserBookings(id, req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserStats(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getUserStats();
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  // Shipments
  async listShipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminService.listShipments(req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const shipment = await adminService.getShipment(id);
      res.status(200).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  async getShipmentStats(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getShipmentStats();
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async closeShipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const shipment = await adminService.closeShipment(id);
      res.status(200).json({
        status: 'success',
        data: shipment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Bookings
  async listBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminService.listBookings(req.query);
      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await adminService.getBooking(id);
      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBookingStats(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getBookingStats();
      res.status(200).json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async confirmBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await adminService.confirmBooking(id);
      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const booking = await adminService.cancelBooking(id, reason);
      res.status(200).json({
        status: 'success',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  },

  // Settings
  async getSettings(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const settings = await adminService.getSettings();
      res.status(200).json({
        status: 'success',
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const settings = await adminService.updateSettings(req.body);
      res.status(200).json({
        status: 'success',
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  },

  // Reports
  async getUserReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { dateFrom, dateTo, format } = req.query;
      const report = await adminService.getUserReport(
        dateFrom as string,
        dateTo as string,
        (format as string) || 'json'
      );
      res.status(200).json({
        status: 'success',
        ...report,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBookingReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { dateFrom, dateTo, format } = req.query;
      const report = await adminService.getBookingReport(
        dateFrom as string,
        dateTo as string,
        (format as string) || 'json'
      );
      res.status(200).json({
        status: 'success',
        ...report,
      });
    } catch (error) {
      next(error);
    }
  },

  async getRevenueReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { dateFrom, dateTo, format, groupBy } = req.query;
      const report = await adminService.getRevenueReport(
        dateFrom as string,
        dateTo as string,
        (format as string) || 'json',
        (groupBy as string) || 'day'
      );
      res.status(200).json({
        status: 'success',
        ...report,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { dateFrom, dateTo, format } = req.query;
      const report = await adminService.getCompanyReport(
        dateFrom as string,
        dateTo as string,
        (format as string) || 'json'
      );
      res.status(200).json({
        status: 'success',
        ...report,
      });
    } catch (error) {
      next(error);
    }
  },

  // Billing Management
  async updateCompanyPlan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { plan, commissionRateBps, rankingTier } = req.body;
      const result = await adminService.updateCompanyPlan(id, {
        plan,
        commissionRateBps,
        rankingTier,
      });
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async topupCompanyCredits(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount, reason, walletType } = req.body;
      const result = await adminService.topupCompanyCredits(id, amount, walletType, reason);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCompanyUsage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const usage = await adminService.getCompanyUsage(id);
      res.status(200).json({
        status: 'success',
        data: usage,
      });
    } catch (error) {
      next(error);
    }
  },

  async runMonthlyRollover(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminService.runMonthlyRollover();
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
