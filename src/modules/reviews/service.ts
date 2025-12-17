import { reviewRepository, CreateReviewData, UpdateReviewData } from './repository';
import { CreateReviewDto, UpdateReviewDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { bookingRepository } from '../bookings/repository';
import { BookingStatus } from '@prisma/client';
import prisma from '../../config/database';
import { checkStaffPermission } from '../../utils/permissions';

const ALLOWED_BOOKING_STATUSES: BookingStatus[] = ['REJECTED', 'CANCELLED', 'DELIVERED'];

export const reviewService = {
  async createReview(req: AuthRequest, bookingId: string, dto: CreateReviewDto) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can create reviews');
    }

    // Check if booking exists and belongs to the customer
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.customerId !== req.user.id) {
      throw new ForbiddenError('You can only review your own bookings');
    }

    // Validate companyId exists
    if (!booking.companyId) {
      throw new BadRequestError('Booking is not associated with a company');
    }

    // Check if booking status allows reviews
    if (!ALLOWED_BOOKING_STATUSES.includes(booking.status)) {
      throw new BadRequestError(
        `Reviews can only be created for bookings with status: ${ALLOWED_BOOKING_STATUSES.join(', ')}`
      );
    }

    // Check if review already exists
    const existingReview = await reviewRepository.findByBookingId(bookingId);
    if (existingReview) {
      throw new BadRequestError('A review already exists for this booking');
    }

    // Create review
    const createData: CreateReviewData = {
      bookingId,
      companyId: booking.companyId,
      customerId: req.user.id,
      rating: dto.rating,
      comment: dto.comment || null,
    };

    return reviewRepository.create(createData);
  },

  async updateReview(req: AuthRequest, bookingId: string, dto: UpdateReviewDto) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can update reviews');
    }

    // Check if review exists
    const review = await reviewRepository.findByBookingId(bookingId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check if review belongs to the customer
    if (review.customerId !== req.user.id) {
      throw new ForbiddenError('You can only update your own reviews');
    }

    // Update review
    const updateData: UpdateReviewData = {};
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.comment !== undefined) updateData.comment = dto.comment || null;

    return reviewRepository.update(bookingId, updateData);
  },

  async getReview(bookingId: string) {
    const review = await reviewRepository.findByBookingId(bookingId);
    return review;
  },

  async getCompanyReviews(companyIdOrSlug: string, query: any) {
    // Try to find company by ID or slug
    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { id: companyIdOrSlug },
          { slug: companyIdOrSlug },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const pagination = parsePagination(query);
    const rating = query.rating ? parseInt(query.rating, 10) : undefined;

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      throw new BadRequestError('Rating must be between 1 and 5');
    }

    const { reviews, total } = await reviewRepository.findByCompany(company.id, {
      ...pagination,
      rating,
    });

    return createPaginatedResponse(reviews, total, pagination);
  },

  async getMyReviews(req: AuthRequest, query: any) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can view their reviews');
    }

    const pagination = parsePagination(query);
    const { reviews, total } = await reviewRepository.findByCustomer(req.user.id, pagination);

    return createPaginatedResponse(reviews, total, pagination);
  },

  async deleteReview(req: AuthRequest, bookingId: string) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can delete reviews');
    }

    // Check if review exists
    const review = await reviewRepository.findByBookingId(bookingId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check if review belongs to the customer
    if (review.customerId !== req.user.id) {
      throw new ForbiddenError('You can only delete your own reviews');
    }

    await reviewRepository.delete(bookingId);

    return { message: 'Review deleted successfully' };
  },

  async getCompanyReviewStats(companyIdOrSlug: string) {
    // Try to find company by ID or slug
    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { id: companyIdOrSlug },
          { slug: companyIdOrSlug },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const [averageRating, reviewCount] = await Promise.all([
      reviewRepository.getCompanyAverageRating(company.id),
      reviewRepository.getCompanyReviewCount(company.id),
    ]);

    return {
      averageRating: averageRating ? Number(averageRating.toFixed(2)) : null,
      reviewCount,
    };
  },

  async getMyCompanyReviews(req: AuthRequest, query: any) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const pagination = parsePagination(query);
    const rating = query.rating ? parseInt(query.rating, 10) : undefined;

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      throw new BadRequestError('Rating must be between 1 and 5');
    }

    const { reviews, total } = await reviewRepository.findByCompany(req.user.companyId, {
      ...pagination,
      rating,
    });

    return createPaginatedResponse(reviews, total, pagination);
  },

  async getMyCompanyReviewStats(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const [averageRating, reviewCount] = await Promise.all([
      reviewRepository.getCompanyAverageRating(req.user.companyId),
      reviewRepository.getCompanyReviewCount(req.user.companyId),
    ]);

    return {
      averageRating: averageRating ? Number(averageRating.toFixed(2)) : null,
      reviewCount,
    };
  },

  async replyToReview(req: AuthRequest, bookingId: string, reply: string) {
    // Check staff permission
    await checkStaffPermission(req, 'replyToReview');

    if (!req.user || (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'COMPANY_STAFF')) {
      throw new ForbiddenError('Only company users can reply to reviews');
    }

    // Check if review exists
    const review = await reviewRepository.findByBookingId(bookingId);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Check if the review belongs to the company
    if (review.companyId !== req.user.companyId) {
      throw new ForbiddenError('You can only reply to reviews for your own company');
    }

    // Update review with company reply
    return reviewRepository.update(bookingId, { companyReply: reply });
  },
};

