import { Request, Response, NextFunction } from 'express';
import { contactService } from './service';
import { SubmitContactDto } from './dto';

export const contactController = {
  async submitContact(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as SubmitContactDto;
      const result = await contactService.submitContact(dto);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },
};

