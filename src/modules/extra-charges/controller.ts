import { Response, NextFunction } from 'express';
import { extraChargeService } from './service';
import {
  CreateExtraChargeDto,
} from './dto';
import { AuthRequest } from '../../middleware/auth';

export const extraChargeController = {
  async createExtraCharge(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const dto = req.body as CreateExtraChargeDto;
      const extraCharge = await extraChargeService.createExtraCharge(req, bookingId, dto);

      res.status(201).json({
        status: 'success',
        data: extraCharge,
      });
    } catch (error) {
      next(error);
    }
  },

  async listExtraCharges(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const extraCharges = await extraChargeService.listExtraCharges(req, bookingId);

      res.status(200).json({
        status: 'success',
        data: extraCharges,
      });
    } catch (error) {
      next(error);
    }
  },

  async payExtraCharge(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId, extraChargeId } = req.params;
      const result = await extraChargeService.payExtraCharge(req, bookingId, extraChargeId);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async declineExtraCharge(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId, extraChargeId } = req.params;
      const extraCharge = await extraChargeService.declineExtraCharge(req, bookingId, extraChargeId);

      res.status(200).json({
        status: 'success',
        data: extraCharge,
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelExtraCharge(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId, extraChargeId } = req.params;
      const extraCharge = await extraChargeService.cancelExtraCharge(req, bookingId, extraChargeId);

      res.status(200).json({
        status: 'success',
        data: extraCharge,
      });
    } catch (error) {
      next(error);
    }
  },
};

