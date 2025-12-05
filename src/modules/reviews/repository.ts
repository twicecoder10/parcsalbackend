import prisma from '../../config/database';
import { Review } from '@prisma/client';
import { PaginationParams } from '../../utils/pagination';

export interface CreateReviewData {
  bookingId: string;
  companyId: string;
  customerId: string;
  rating: number;
  comment?: string | null;
}

export interface UpdateReviewData {
  rating?: number;
  comment?: string | null;
  companyReply?: string | null;
}

export const reviewRepository = {
  async create(data: CreateReviewData): Promise<Review> {
    return prisma.review.create({
      data,
      include: {
        booking: {
          include: {
            shipmentSlot: {
              select: {
                id: true,
                originCity: true,
                destinationCity: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByBookingId(bookingId: string): Promise<Review | null> {
    return prisma.review.findUnique({
      where: { bookingId },
      include: {
        booking: {
          include: {
            shipmentSlot: {
              select: {
                id: true,
                originCity: true,
                destinationCity: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByCompany(
    companyId: string,
    params: PaginationParams & { rating?: number }
  ): Promise<{ reviews: Review[]; total: number }> {
    const where: any = { companyId };
    if (params.rating) {
      where.rating = params.rating;
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          booking: {
            include: {
              shipmentSlot: {
                select: {
                  id: true,
                  originCity: true,
                  destinationCity: true,
                },
              },
            },
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.review.count({ where }),
    ]);

    return { reviews, total };
  },

  async findByCustomer(
    customerId: string,
    params: PaginationParams
  ): Promise<{ reviews: Review[]; total: number }> {
    const where = { customerId };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          booking: {
            include: {
              shipmentSlot: {
                select: {
                  id: true,
                  originCity: true,
                  destinationCity: true,
                },
              },
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.review.count({ where }),
    ]);

    return { reviews, total };
  },

  async update(bookingId: string, data: UpdateReviewData): Promise<Review> {
    return prisma.review.update({
      where: { bookingId },
      data,
      include: {
        booking: {
          include: {
            shipmentSlot: {
              select: {
                id: true,
                originCity: true,
                destinationCity: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async delete(bookingId: string): Promise<void> {
    await prisma.review.delete({
      where: { bookingId },
    });
  },

  async getCompanyAverageRating(companyId: string): Promise<number | null> {
    const result = await prisma.review.aggregate({
      where: { companyId },
      _avg: {
        rating: true,
      },
    });

    return result._avg.rating;
  },

  async getCompanyReviewCount(companyId: string): Promise<number> {
    return prisma.review.count({
      where: { companyId },
    });
  },
};

