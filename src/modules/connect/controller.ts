import { Response, NextFunction } from 'express';
import { connectService } from './service';
import { CreateOnboardingLinkDto, RequestPayoutDto } from './dto';
import { AuthRequest } from '../../middleware/auth';

export const connectController = {
  async createOnboardingLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.companyId) {
        res.status(403).json({
          status: 'error',
          message: 'User must be associated with a company',
        });
        return;
      }

      const dto = req.body as CreateOnboardingLinkDto;
      const url = await connectService.createOnboardingLink(
        req.user.companyId,
        dto.returnUrl,
        dto.fromOnboarding
      );

      res.status(200).json({
        status: 'success',
        data: { url },
      });
    } catch (error) {
      next(error);
    }
  },

  async getStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.companyId) {
        res.status(403).json({
          status: 'error',
          message: 'User must be associated with a company',
        });
        return;
      }

      const status = await connectService.refreshAccountStatus(req.user.companyId);

      res.status(200).json({
        status: 'success',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  },

  async getBalance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.companyId) {
        res.status(403).json({
          status: 'error',
          message: 'User must be associated with a company',
        });
        return;
      }

      const balance = await connectService.retrieveBalance(req.user.companyId);

      res.status(200).json({
        status: 'success',
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAccountInfo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.companyId) {
        res.status(403).json({
          status: 'error',
          message: 'User must be associated with a company',
        });
        return;
      }

      const info = await connectService.getAccountInfo(req.user.companyId);

      res.status(200).json({
        status: 'success',
        data: info,
      });
    } catch (error) {
      next(error);
    }
  },

  async requestPayout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.companyId) {
        res.status(403).json({
          status: 'error',
          message: 'User must be associated with a company',
        });
        return;
      }

      const dto = req.body as RequestPayoutDto;
      // Convert amount from pounds to pence (minor units)
      const amountMinor = Math.round(dto.amount * 100);
      const payout = await connectService.requestPayout(req, req.user.companyId, amountMinor);

      res.status(200).json({
        status: 'success',
        data: payout,
      });
    } catch (error) {
      next(error);
    }
  },
};

