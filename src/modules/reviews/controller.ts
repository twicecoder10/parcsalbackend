import { Request, Response } from 'express';
import { reviewService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const reviewController = {
  async createReview(req: AuthRequest, res: Response) {
    const { bookingId } = req.params;
    const review = await reviewService.createReview(req, bookingId, req.body);
    res.status(201).json(review);
  },

  async updateReview(req: AuthRequest, res: Response) {
    const { bookingId } = req.params;
    const review = await reviewService.updateReview(req, bookingId, req.body);
    res.json(review);
  },

  async getReview(req: Request, res: Response) {
    const { bookingId } = req.params;
    const review = await reviewService.getReview(bookingId);
    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found',
      });
    }
    return res.json(review);
  },

  async getCompanyReviews(req: Request, res: Response) {
    const { companyId } = req.params;
    const result = await reviewService.getCompanyReviews(companyId, req.query);
    res.json(result);
  },

  async getMyReviews(req: AuthRequest, res: Response) {
    const result = await reviewService.getMyReviews(req, req.query);
    res.json(result);
  },

  async deleteReview(req: AuthRequest, res: Response) {
    const { bookingId } = req.params;
    const result = await reviewService.deleteReview(req, bookingId);
    res.json(result);
  },

  async getCompanyReviewStats(req: Request, res: Response) {
    const { companyId } = req.params;
    const stats = await reviewService.getCompanyReviewStats(companyId);
    res.json(stats);
  },

  async replyToReview(req: AuthRequest, res: Response) {
    const { bookingId } = req.params;
    const { reply } = req.body;
    const review = await reviewService.replyToReview(req, bookingId, reply);
    res.json(review);
  },
};

