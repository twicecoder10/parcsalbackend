import prisma from '../../config/database';
import { User } from '@prisma/client';

export interface UpdateCustomerProfileData {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  city?: string;
  address?: string | null;
  country?: string | null;
  preferredShippingMode?: string | null;
  notificationEmail?: boolean;
  notificationSMS?: boolean;
  onboardingCompleted?: boolean;
}

export interface DashboardStats {
  activeBookings: number;
  pendingBookings: number;
  totalBookings: number;
  upcomingDepartures: number;
}

export const customerRepository = {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async updateProfile(id: string, data: UpdateCustomerProfileData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async getDashboardStats(customerId: string): Promise<DashboardStats> {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [activeBookings, pendingBookings, totalBookings, upcomingDepartures] = await Promise.all([
      // Active bookings: IN_TRANSIT or ACCEPTED
      prisma.booking.count({
        where: {
          customerId,
          status: {
            in: ['IN_TRANSIT', 'ACCEPTED'],
          },
        },
      }),
      // Pending bookings
      prisma.booking.count({
        where: {
          customerId,
          status: 'PENDING',
        },
      }),
      // Total bookings
      prisma.booking.count({
        where: { customerId },
      }),
      // Upcoming departures (within next 7 days)
      prisma.booking.count({
        where: {
          customerId,
          shipmentSlot: {
            departureTime: {
              gte: now,
              lte: sevenDaysFromNow,
            },
          },
        },
      }),
    ]);

    return {
      activeBookings,
      pendingBookings,
      totalBookings,
      upcomingDepartures,
    };
  },

  async getRecentBookings(customerId: string, limit: number = 5) {
    return prisma.booking.findMany({
      where: { customerId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
            departureTime: true,
          },
        },
      },
    });
  },
};

