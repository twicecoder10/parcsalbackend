import { Response, NextFunction } from 'express';
import { companyService } from './service';
import { UpdateCompanyDto, CompleteCompanyOnboardingDto } from './dto';
import { AuthRequest } from '../../middleware/auth';

export const companyController = {
  async getMyCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const company = await companyService.getMyCompany(req);

      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateMyCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpdateCompanyDto;
      const company = await companyService.updateMyCompany(req, dto);

      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async listAllCompanies(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await companyService.listAllCompanies(req.query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;
      const company = await companyService.verifyCompany(id, isVerified);

      res.status(200).json({
        status: 'success',
        data: company,
      });
    } catch (error) {
      next(error);
    }
  },

  async completeOnboarding(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CompleteCompanyOnboardingDto;
      const result = await companyService.completeOnboarding(req, dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  // Overview/Dashboard
  async getOverviewStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await companyService.getOverviewStats(req);
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
      const bookings = await companyService.getRecentBookings(req, limit);
      res.status(200).json({
        status: 'success',
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUpcomingShipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const shipments = await companyService.getUpcomingShipments(req, limit);
      res.status(200).json({
        status: 'success',
        data: shipments,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period } = req.query;
      if (!period || !['week', 'month', 'quarter', 'year'].includes(period as string)) {
        return res.status(400).json({
          status: 'error',
          message: 'Period is required and must be week, month, quarter, or year',
        });
      }
      const analytics = await companyService.getAnalytics(req, period as 'week' | 'month' | 'quarter' | 'year');
      return res.status(200).json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      return next(error);
    }
  },

  async getTeamMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const members = await companyService.getTeamMembers(req);
      res.status(200).json({
        status: 'success',
        data: members,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTeamMemberRole(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { memberId } = req.params;
      const { role } = req.body;
      if (!role || !['COMPANY_STAFF', 'COMPANY_ADMIN'].includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: 'Role is required and must be COMPANY_STAFF or COMPANY_ADMIN',
        });
      }
      const member = await companyService.updateTeamMemberRole(req, memberId, role);
      return res.status(200).json({
        status: 'success',
        data: member,
      });
    } catch (error) {
      return next(error);
    }
  },

  async removeTeamMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { memberId } = req.params;
      const result = await companyService.removeTeamMember(req, memberId);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      return next(error);
    }
  },

  async getSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const settings = await companyService.getSettings(req);
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
      const settings = await companyService.updateSettings(req, req.body);
      res.status(200).json({
        status: 'success',
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  },

  async uploadLogo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // For now, accept logoUrl in body
      // In production, this would use multer or similar for file upload
      const { logoUrl } = req.body;
      if (!logoUrl) {
        return res.status(400).json({
          status: 'error',
          message: 'logoUrl is required',
        });
      }

      const company = await companyService.updateMyCompany(req, { logoUrl });
      return res.status(200).json({
        status: 'success',
        data: { logoUrl: company.logoUrl },
      });
    } catch (error) {
      return next(error);
    }
  },

  async inviteTeamMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, role } = req.body;
      if (!email || !role) {
        return res.status(400).json({
          status: 'error',
          message: 'Email and role are required',
        });
      }

      if (!['COMPANY_STAFF', 'COMPANY_ADMIN'].includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: 'Role must be COMPANY_STAFF or COMPANY_ADMIN',
        });
      }

      const invitation = await companyService.inviteTeamMember(req, email, role);
      return res.status(201).json({
        status: 'success',
        data: invitation,
        message: 'Invitation sent successfully',
      });
    } catch (error) {
      return next(error);
    }
  },

  async getPendingInvitations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const invitations = await companyService.getPendingInvitations(req);
      res.status(200).json({
        status: 'success',
        data: invitations,
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelInvitation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { invitationId } = req.params;
      const result = await companyService.cancelInvitation(req, invitationId);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },
};

