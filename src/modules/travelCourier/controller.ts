import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { travelCourierService } from './service';
import {
  CreateListingDto,
  UpdateListingDto,
  CreateBookingDto,
  CreateReviewDto,
  CreateDisputeDto,
  DisputeResponseDto,
  AdminUpdateDisputeDto,
  AdminReviewFlightProofDto,
  TravellerConnectOnboardDto,
} from './dto';

export const travelCourierController = {
  // ─── Listing Management ──────────────────────────────────

  async createListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateListingDto;
      const listing = await travelCourierService.createListing(req, dto);
      res.status(201).json({ status: 'success', data: listing });
    } catch (error) {
      next(error);
    }
  },

  async getMyListings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getMyListings(req, req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getMyListingById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const listing = await travelCourierService.getMyListingById(req, req.params.id);
      res.status(200).json({ status: 'success', data: listing });
    } catch (error) {
      next(error);
    }
  },

  async updateListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as UpdateListingDto;
      const listing = await travelCourierService.updateListing(req, req.params.id, dto);
      res.status(200).json({ status: 'success', data: listing });
    } catch (error) {
      next(error);
    }
  },

  async publishListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const listing = await travelCourierService.publishListing(req, req.params.id);
      res.status(200).json({ status: 'success', data: listing });
    } catch (error) {
      next(error);
    }
  },

  async closeListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const listing = await travelCourierService.closeListing(req, req.params.id);
      res.status(200).json({ status: 'success', data: listing });
    } catch (error) {
      next(error);
    }
  },

  // ─── Public Search ───────────────────────────────────────

  async searchListings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.searchListings(req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getPublicListingById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getPublicListingById(req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Booking Flow ────────────────────────────────────────

  async createBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateBookingDto;
      const booking = await travelCourierService.createBooking(req, req.params.id, dto);
      res.status(201).json({ status: 'success', data: booking });
    } catch (error) {
      next(error);
    }
  },

  async getMyBookingsAsCustomer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getMyBookingsAsCustomer(req, req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getMyBookingById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getMyBookingById(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getBookingsForMyListings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getBookingsForMyListings(req, req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async approveBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.approveBooking(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getPaymentUrl(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getPaymentUrl(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async rejectBooking(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.rejectBooking(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Delivery ────────────────────────────────────────────

  async markDelivered(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.markDelivered(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async confirmDelivery(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.confirmDelivery(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Admin: Flight Proof ─────────────────────────────────

  async listPendingFlightProof(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.listPendingFlightProof(req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async reviewFlightProof(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as AdminReviewFlightProofDto;
      const result = await travelCourierService.reviewFlightProof(req.user!.id, req.params.id, dto);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Reviews ─────────────────────────────────────────────

  async createReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateReviewDto;
      const result = await travelCourierService.createReview(req, req.params.id, dto);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getBookingReview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getBookingReview(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getTravellerReviews(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getTravellerReviews(req.params.userId, req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Disputes ────────────────────────────────────────────

  async openDispute(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateDisputeDto;
      const result = await travelCourierService.openDispute(req, req.params.id, dto);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getDisputeForCustomer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getDisputeForCustomer(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getDisputeForTraveller(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getDisputeForTraveller(req, req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async respondToDispute(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as DisputeResponseDto;
      const result = await travelCourierService.respondToDispute(req, req.params.id, dto);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Admin: Disputes ─────────────────────────────────────

  async listDisputes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.listDisputes(req.query);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getDisputeById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getDisputeById(req.params.id);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async adminUpdateDispute(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as AdminUpdateDisputeDto;
      const result = await travelCourierService.adminUpdateDispute(req.user!.id, req.params.id, dto);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  // ─── Traveller Stripe Connect ─────────────────────────────

  async createConnectOnboardingLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as TravellerConnectOnboardDto;
      const result = await travelCourierService.createConnectOnboardingLink(req, dto);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getConnectStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getConnectStatus(req);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getConnectDashboardLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getConnectDashboardLink(req);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getConnectBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getConnectBalance(req);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getEarnings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await travelCourierService.getEarnings(req);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },
};
