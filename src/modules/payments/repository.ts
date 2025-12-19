import prisma from '../../config/database';
import { Payment, PaymentTransactionStatus } from '@prisma/client';

export interface CreatePaymentData {
  id: string;
  bookingId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  baseAmount?: number | null;
  adminFeeAmount?: number | null;
  processingFeeAmount?: number | null;
  totalAmount?: number | null;
}

export const paymentRepository = {
  async create(data: CreatePaymentData): Promise<Payment> {
    return prisma.payment.create({
      data: {
        id: data.id,
        bookingId: data.bookingId,
        stripePaymentIntentId: data.stripePaymentIntentId,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        baseAmount: data.baseAmount,
        adminFeeAmount: data.adminFeeAmount,
        processingFeeAmount: data.processingFeeAmount,
        totalAmount: data.totalAmount,
      },
      include: {
        booking: {
          include: {
            shipmentSlot: true,
            customer: true,
          },
        },
      },
    });
  },

  async findByBookingId(bookingId: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { bookingId },
      include: {
        booking: true,
      },
    });
  },

  async findByStripePaymentIntentId(stripePaymentIntentId: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { stripePaymentIntentId },
      include: {
        booking: true,
      },
    });
  },

  async updateStatus(
    id: string,
    status: PaymentTransactionStatus
  ): Promise<Payment> {
    return prisma.payment.update({
      where: { id },
      data: { status },
      include: {
        booking: true,
      },
    });
  },

  async updateBookingPaymentStatus(
    bookingId: string,
    paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED'
  ): Promise<void> {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus },
    });
  },

  async findById(id: string) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            shipmentSlot: {
              select: {
                id: true,
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
              },
            },
          },
        },
      },
    });
  },

  async findByCompanyId(
    companyId: string,
    params: {
      limit: number;
      offset: number;
      status?: PaymentTransactionStatus;
      dateFrom?: Date;
      dateTo?: Date;
      bookingId?: string;
      search?: string;
    }
  ) {
    const where: any = {
      booking: {
        companyId,
      },
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) {
        where.createdAt.gte = params.dateFrom;
      }
      if (params.dateTo) {
        // Include the entire day
        const endDate = new Date(params.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    if (params.bookingId) {
      where.bookingId = params.bookingId;
    }

    if (params.search) {
      where.OR = [
        { bookingId: { contains: params.search, mode: 'insensitive' } },
        {
          booking: {
            customer: {
              OR: [
                { fullName: { contains: params.search, mode: 'insensitive' } },
                { email: { contains: params.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          booking: {
            include: {
              customer: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
              shipmentSlot: {
                select: {
                  id: true,
                  originCity: true,
                  originCountry: true,
                  destinationCity: true,
                  destinationCountry: true,
                },
              },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total };
  },

  async updateRefundInfo(
    id: string,
    data: {
      status: PaymentTransactionStatus;
      refundedAmount?: number;
      refundReason?: string;
      refundedAt?: Date;
    }
  ) {
    return prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        refundedAmount: data.refundedAmount,
        refundReason: data.refundReason,
        refundedAt: data.refundedAt,
      },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            shipmentSlot: {
              select: {
                id: true,
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
              },
            },
          },
        },
      },
    });
  },
};

