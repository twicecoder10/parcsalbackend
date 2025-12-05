import prisma from '../../config/database';
import { Booking, BookingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaginationParams } from '../../utils/pagination';

export interface CreateBookingData {
  id: string;
  shipmentSlotId: string;
  customerId: string;
  companyId: string;
  requestedWeightKg?: number | null;
  requestedItemsCount?: number | null;
  calculatedPrice: Decimal;
  notes?: string | null;
  status: BookingStatus;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
}

export const bookingRepository = {
  async create(data: CreateBookingData): Promise<Booking> {
    return prisma.booking.create({
      data,
      include: {
        shipmentSlot: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                isVerified: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        payment: true,
      },
    });
  },

  async findById(id: string): Promise<Booking | null> {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        shipmentSlot: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                isVerified: true,
                logoUrl: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        payment: true,
      },
    });
  },

  async findByCustomer(
    customerId: string,
    params: PaginationParams & { status?: BookingStatus }
  ): Promise<{ bookings: Booking[]; total: number }> {
    const where: any = { customerId };
    if (params.status) {
      where.status = params.status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          shipmentSlot: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isVerified: true,
                  logoUrl: true,
                },
              },
            },
          },
          payment: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return { bookings, total };
  },

  async findByCompany(
    companyId: string,
    params: PaginationParams & { status?: BookingStatus; search?: string }
  ): Promise<{ bookings: Booking[]; total: number }> {
    const where: any = { companyId };
    if (params.status) {
      where.status = params.status;
    }

    // Add search functionality
    if (params.search) {
      where.OR = [
        {
          customer: {
            fullName: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
        },
        {
          customer: {
            email: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
        },
        {
          shipmentSlot: {
            OR: [
              {
                originCity: {
                  contains: params.search,
                  mode: 'insensitive',
                },
              },
              {
                destinationCity: {
                  contains: params.search,
                  mode: 'insensitive',
                },
              },
            ],
          },
        },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          shipmentSlot: {
            select: {
              id: true,
              originCountry: true,
              originCity: true,
              destinationCountry: true,
              destinationCity: true,
              departureTime: true,
              arrivalTime: true,
            },
          },
          customer: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          payment: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return { bookings, total };
  },

  async updateStatus(id: string, status: BookingStatus): Promise<Booking> {
    return prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        shipmentSlot: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                isVerified: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        payment: true,
      },
    });
  },

  async updateCapacity(
    shipmentSlotId: string,
    requestedWeightKg: number | null,
    requestedItemsCount: number | null
  ): Promise<void> {
    const shipment = await prisma.shipmentSlot.findUnique({
      where: { id: shipmentSlotId },
    });

    if (!shipment) {
      throw new Error('Shipment slot not found');
    }

    const updates: any = {};
    if (requestedWeightKg !== null && shipment.remainingCapacityKg !== null) {
      updates.remainingCapacityKg = {
        decrement: requestedWeightKg,
      };
    }
    if (requestedItemsCount !== null && shipment.remainingCapacityItems !== null) {
      updates.remainingCapacityItems = {
        decrement: requestedItemsCount,
      };
    }

    await prisma.shipmentSlot.update({
      where: { id: shipmentSlotId },
      data: updates,
    });
  },

  async countByCustomer(customerId: string): Promise<number> {
    return prisma.booking.count({
      where: { customerId },
    });
  },

  async updateStatusBySlot(
    shipmentSlotId: string,
    status: BookingStatus,
    filterStatuses?: BookingStatus[]
  ): Promise<{ count: number }> {
    const where: any = { shipmentSlotId };
    if (filterStatuses && filterStatuses.length > 0) {
      where.status = { in: filterStatuses };
    }

    const result = await prisma.booking.updateMany({
      where,
      data: { status },
    });

    return { count: result.count };
  },
};

