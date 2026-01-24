import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { feedbackService } from './service';
import { SubmitFeedbackDto, UpdateFeedbackDto } from './dto';
import { uploadFile } from '../../utils/upload';
import { BadRequestError } from '../../utils/errors';

export const feedbackController = {
  async submitFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as SubmitFeedbackDto;
      const feedback = await feedbackService.submitFeedback(req, dto);
      res.status(201).json({
        status: 'success',
        data: feedback,
      });
    } catch (error) {
      next(error);
    }
  },

  async listFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await feedbackService.listFeedback(req.query);
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpdateFeedbackDto;
      const feedback = await feedbackService.updateFeedback(req.params.id, dto);
      res.status(200).json({
        status: 'success',
        data: feedback,
      });
    } catch (error) {
      next(error);
    }
  },

  async getFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const feedback = await feedbackService.getFeedbackById(req.params.id);
      res.status(200).json({
        status: 'success',
        data: feedback,
      });
    } catch (error) {
      next(error);
    }
  },

  async uploadFeedbackAttachments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new BadRequestError('No files uploaded');
      }

      const uploadResults = await Promise.all(
        files.map((file) => uploadFile(file, 'feedback'))
      );

      const urls = uploadResults.map((result) => result.url);

      res.status(200).json({
        status: 'success',
        data: {
          attachments: urls,
          count: urls.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

