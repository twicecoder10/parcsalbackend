import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { contactAdminService } from './contactAdmin.service';
import { UpdateContactMessageDto } from './contactAdmin.validation';

export const contactAdminController = {
  async listContactMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await contactAdminService.listContactMessages(req.query);
      res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  async getContactMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const contact = await contactAdminService.getContactMessage(req.params.id);
      res.status(200).json({
        status: 'success',
        data: contact,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateContactMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpdateContactMessageDto;
      const contact = await contactAdminService.updateContactMessage(req.params.id, dto);
      res.status(200).json({
        status: 'success',
        data: contact,
      });
    } catch (error) {
      next(error);
    }
  },
};

