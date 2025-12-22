import prisma from '../../config/database';
import { BookingExtraCharge, ExtraChargeStatus, Prisma } from '@prisma/client';

type ExtraChargeWithRelations = Prisma.BookingExtraChargeGetPayload<{
  include: {
    booking: {
      include: {
        customer: {
          select: {
            id: true;
            email: true;
            fullName: true;
          };
        };
        shipmentSlot: {
          select: {
            originCity: true;
            originCountry: true;
            destinationCity: true;
            destinationCountry: true;
            mode: true;
          };
        };
      };
    };
    company: {
      select: {
        id: true;
        name: true;
        stripeAccountId: true;
        chargesEnabled: true;
      };
    };
    createdBy: {
      select: {
        id: true;
        fullName: true;
        email: true;
      };
    };
  };
}>;


export interface CreateExtraChargeData {
  bookingId: string;
  companyId: string;
  createdByUserId: string;
  reason: 'EXCESS_WEIGHT' | 'EXTRA_ITEMS' | 'OVERSIZE' | 'REPACKING' | 'LATE_DROP_OFF' | 'OTHER';
  description?: string | null;
  evidenceUrls?: string[];
  baseAmount: number;
  adminFeeAmount: number;
  processingFeeAmount: number;
  totalAmount: number;
  expiresAt: Date;
  status?: ExtraChargeStatus;
}

export const extraChargeRepository = {
  async create(data: CreateExtraChargeData): Promise<ExtraChargeWithRelations> {
    return prisma.bookingExtraCharge.create({
      data,
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                mode: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findById(id: string): Promise<ExtraChargeWithRelations | null> {
    return prisma.bookingExtraCharge.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                mode: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByBookingId(bookingId: string): Promise<BookingExtraCharge[]> {
    return prisma.bookingExtraCharge.findMany({
      where: { bookingId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async updateStatus(
    id: string,
    status: ExtraChargeStatus,
    updateData?: {
      paidAt?: Date;
      declinedAt?: Date;
      cancelledAt?: Date;
      stripeSessionId?: string | null;
      stripePaymentIntentId?: string | null;
    }
  ): Promise<ExtraChargeWithRelations> {
    return prisma.bookingExtraCharge.update({
      where: { id },
      data: {
        status,
        ...updateData,
      },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                mode: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByStripeSessionId(sessionId: string): Promise<ExtraChargeWithRelations | null> {
    return prisma.bookingExtraCharge.findFirst({
      where: { stripeSessionId: sessionId },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                mode: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByStripePaymentIntentId(paymentIntentId: string): Promise<ExtraChargeWithRelations | null> {
    return prisma.bookingExtraCharge.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                mode: true,
              },
            },
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async expireOldPendingCharges(): Promise<number> {
    const result = await prisma.bookingExtraCharge.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    return result.count;
  },
};

