import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { travellerService } from './service';
import { UpsertTravellerProfileDto, UpdateTravellerProfileDto, ReviewTravellerProfileDto } from './dto';

export const travellerController = {
  async getMyProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await travellerService.getMyProfile(req);
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  },

  async createProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpsertTravellerProfileDto;
      const profile = await travellerService.createProfile(req, dto);
      res.status(201).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpdateTravellerProfileDto;
      const profile = await travellerService.updateProfile(req, dto);
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  },

  async getProfileById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await travellerService.getProfileById(req.params.id);
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  },

  async listProfiles(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travellerService.listProfiles(req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async reviewProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as ReviewTravellerProfileDto;
      const profile = await travellerService.reviewProfile(req.user!.id, id, dto);
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  },
};
