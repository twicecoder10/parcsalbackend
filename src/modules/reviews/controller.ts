import { Request, Response, NextFunction } from 'express';
import { reviewService } from './service';
import { AuthRequest } from '../../middleware/auth';

export const reviewController = {
  async createReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const review = await reviewService.createReview(req, bookingId, req.body);
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  },

  async updateReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const review = await reviewService.updateReview(req, bookingId, req.body);
      res.json(review);
    } catch (error) {
      next(error);
    }
  },

  async getReview(req: Request, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const review = await reviewService.getReview(bookingId);
      if (!review) {
        res.status(404).json({
          status: 'error',
          message: 'Review not found',
        });
        return;
      }
      res.json(review);
    } catch (error) {
      next(error);
    }
  },

  async getCompanyReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const { companyIdOrSlug } = req.params;
      const result = await reviewService.getCompanyReviews(companyIdOrSlug, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMyReviews(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await reviewService.getMyReviews(req, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async deleteReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const result = await reviewService.deleteReview(req, bookingId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getCompanyReviewStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { companyIdOrSlug } = req.params;
      const stats = await reviewService.getCompanyReviewStats(companyIdOrSlug);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },

  async replyToReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { bookingId } = req.params;
      const { reply } = req.body;
      const review = await reviewService.replyToReview(req, bookingId, reply);
      res.json(review);
    } catch (error) {
      next(error);
    }
  },

  async getMyCompanyReviews(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await reviewService.getMyCompanyReviews(req, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMyCompanyReviewStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await reviewService.getMyCompanyReviewStats(req);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
};

