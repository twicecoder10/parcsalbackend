import { Request, Response, NextFunction } from 'express';
import { authService } from './service';
import { AuthRequest } from '../../middleware/auth';
import {
  RegisterCustomerDto,
  RegisterCompanyAdminDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  AcceptInvitationDto,
  ChangePasswordDto,
} from './dto';

export const authController = {
  async registerCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as RegisterCustomerDto;
      const result = await authService.registerCustomer(dto);

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async registerCompanyAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as RegisterCompanyAdminDto;
      const result = await authService.registerCompanyAdmin(dto);

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as LoginDto;
      const result = await authService.login(dto);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as RefreshTokenDto;
      const tokens = await authService.refreshToken(dto);

      res.status(200).json({
        status: 'success',
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(_req: Request, res: Response, next: NextFunction) {
    try {
      // In a stateless JWT system, logout is typically handled client-side
      // by removing the token. If you need server-side logout, implement a token blacklist.
      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ForgotPasswordDto;
      const result = await authService.forgotPassword(dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ResetPasswordDto;
      const result = await authService.resetPassword(dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as VerifyEmailDto;
      const result = await authService.verifyEmail(dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ResendVerificationDto;
      const result = await authService.resendVerification(dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await authService.getMe(req.user.id);

      return res.status(200).json({
        status: 'success',
        data: {
          user,
        },
      });
    } catch (error) {
      return next(error);
    }
  },

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ChangePasswordDto;
      const result = await authService.changePassword(req, dto);
      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  async acceptInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.query;
      const dto = req.body as AcceptInvitationDto;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          status: 'error',
          message: 'Invitation token is required',
        });
      }

      const result = await authService.acceptInvitation(token, dto.password, dto.fullName);
      return res.status(200).json({
        status: 'success',
        data: result,
        message: 'Invitation accepted successfully',
      });
    } catch (error) {
      return next(error);
    }
  },

  async deleteAccount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const { password } = req.body as { password: string };
      if (!password) {
        return res.status(400).json({
          status: 'error',
          message: 'Password is required',
        });
      }

      const result = await authService.deleteAccount(req.user.id, password);

      return res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      return next(error);
    }
  },
};

