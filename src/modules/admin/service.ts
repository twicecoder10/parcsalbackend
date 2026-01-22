import { NotFoundError, BadRequestError } from '../../utils/errors';
import { companyRepository } from '../companies/repository';
import { bookingRepository } from '../bookings/repository';
import { shipmentRepository } from '../shipments/repository';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { settingsManager } from '../../utils/settings';
import prisma from '../../config/database';
import { Prisma, CarrierPlan } from '@prisma/client';

// Helper functions
async function getRevenueForPeriod(startDate: Date, endDate: Date): Promise<number> {
  const bookings = await prisma.booking.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      paymentStatus: 'PAID',
    },
    select: { calculatedPrice: true },
  });

  return bookings.reduce((sum, booking) => sum + Number(booking.calculatedPrice), 0);
}

function groupByPeriod(
  data: Array<{ createdAt: Date; [key: string]: any }>,
  period: 'day' | 'week' | 'month',
  dateField: string = 'createdAt',
  valueField?: string
) {
  const groups: Record<string, { period: string; value: number }> = {};

  data.forEach((item) => {
    const date = new Date(item[dateField]);
    let key: string;

    if (period === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (period === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!groups[key]) {
      groups[key] = { period: key, value: 0 };
    }

    if (valueField) {
      groups[key].value += Number(item[valueField] || 0);
    } else {
      groups[key].value += 1;
    }
  });

  return Object.values(groups).sort((a, b) => a.period.localeCompare(b.period));
}

export const adminService = {
  // Dashboard
  async getDashboardSummary() {
    const [users, companies, shipments, bookings, activeSubscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
      prisma.shipmentSlot.count({
        where: { status: 'PUBLISHED' },
      }),
      prisma.booking.count(),
      prisma.subscription.count({
        where: { status: 'ACTIVE' },
      }),
    ]);

    // Calculate revenue from paid bookings
    const paidBookings = await prisma.booking.findMany({
      where: { paymentStatus: 'PAID' },
      select: { calculatedPrice: true },
    });

    const revenue = paidBookings.reduce((sum, booking) => {
      return sum + Number(booking.calculatedPrice);
    }, 0);

    // Get breakdown by role
    const userBreakdown = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    // Get verified vs unverified companies
    const companyVerification = await prisma.company.groupBy({
      by: ['isVerified'],
      _count: true,
    });

    return {
      users: {
        total: users,
        breakdown: userBreakdown.map((u) => ({
          role: u.role,
          count: u._count,
        })),
      },
      companies: {
        total: companies,
        verified: companyVerification.find((c) => c.isVerified)?._count || 0,
        unverified: companyVerification.find((c) => !c.isVerified)?._count || 0,
      },
      shipments: {
        published: shipments,
      },
      bookings: {
        total: bookings,
      },
      subscriptions: {
        active: activeSubscriptions,
      },
      revenue: {
        total: revenue,
        currency: 'GBP',
      },
    };
  },

  async getDashboardStats() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now.setDate(now.getDate() - 7));
    const monthStart = new Date(now.setDate(now.getDate() - 30));

    const [
      totalUsers,
      totalCompanies,
      activeShipments,
      totalBookings,
      bookingsToday,
      bookingsWeek,
      bookingsMonth,
      revenueToday,
      revenueWeek,
      revenueMonth,
      pendingVerifications,
      pendingBookings,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
      prisma.shipmentSlot.count({ where: { status: 'PUBLISHED' } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.booking.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.booking.count({ where: { createdAt: { gte: monthStart } } }),
      getRevenueForPeriod(todayStart, new Date()),
      getRevenueForPeriod(weekStart, new Date()),
      getRevenueForPeriod(monthStart, new Date()),
      prisma.company.count({ where: { isVerified: false } }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
    ]);

    // Calculate growth percentages
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousWeekBookings = await prisma.booking.count({
      where: { createdAt: { gte: previousWeekStart, lt: weekStart } },
    });
    const bookingsGrowth = previousWeekBookings > 0
      ? ((bookingsWeek - previousWeekBookings) / previousWeekBookings) * 100
      : 0;

    const previousWeekRevenue = await getRevenueForPeriod(previousWeekStart, weekStart);
    const revenueGrowth = previousWeekRevenue > 0
      ? ((revenueWeek - previousWeekRevenue) / previousWeekRevenue) * 100
      : 0;

    return {
      totalUsers,
      totalCompanies,
      activeShipments,
      bookings: {
        total: totalBookings,
        today: bookingsToday,
        week: bookingsWeek,
        month: bookingsMonth,
      },
      revenue: {
        today: revenueToday,
        week: revenueWeek,
        month: revenueMonth,
        currency: 'GBP',
      },
      pendingVerifications,
      pendingBookings,
      growth: {
        bookings: Math.round(bookingsGrowth * 100) / 100,
        revenue: Math.round(revenueGrowth * 100) / 100,
      },
    };
  },

  async getDashboardAnalytics(period: string = 'month', metric: string = 'users') {
    const now = new Date();
    let startDate: Date;
    let groupBy: 'day' | 'week' | 'month' = 'day';

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        groupBy = 'day';
        break;
      case 'month':
        startDate = new Date(now.setDate(now.getDate() - 30));
        groupBy = 'day';
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        groupBy = 'month';
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    if (metric === 'users') {
      const users = await prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      return groupByPeriod(users, groupBy, 'createdAt');
    } else if (metric === 'bookings') {
      const bookings = await prisma.booking.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      return groupByPeriod(bookings, groupBy, 'createdAt');
    } else if (metric === 'revenue') {
      const bookings = await prisma.booking.findMany({
        where: {
          createdAt: { gte: startDate },
          paymentStatus: 'PAID',
        },
        select: { createdAt: true, calculatedPrice: true },
        orderBy: { createdAt: 'asc' },
      });

      const grouped = groupByPeriod(bookings, groupBy, 'createdAt', 'calculatedPrice');
      return grouped.map((item) => ({
        ...item,
        value: Number(item.value || 0),
      }));
    }

    return [];
  },

  // Companies
  async listCompanies(query: any) {
    const pagination = parsePagination(query);
    const where: Prisma.CompanyWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { country: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.verified === 'true') {
      where.isVerified = true;
    } else if (query.verified === 'false') {
      where.isVerified = false;
    }

    if (query.plan) {
      where.activePlan = { name: query.plan };
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { createdAt: 'desc' },
        include: {
          activePlan: true,
          admin: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          _count: {
            select: {
              staff: true,
              shipmentSlots: true,
              bookings: true,
            },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return createPaginatedResponse(companies, total, pagination);
  },

  async getCompany(id: string) {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const [shipments, bookings, revenue, staff] = await Promise.all([
      prisma.shipmentSlot.count({ where: { companyId: id } }),
      prisma.booking.count({ where: { companyId: id } }),
      this.getCompanyRevenue(id),
      prisma.user.count({ where: { companyId: id } }),
    ]);

    return {
      ...company,
      stats: {
        totalShipments: shipments,
        activeShipments: await prisma.shipmentSlot.count({
          where: { companyId: id, status: 'PUBLISHED' },
        }),
        totalBookings: bookings,
        revenue,
        teamSize: staff,
      },
    };
  },

  async getCompanyRevenue(companyId: string): Promise<number> {
    const bookings = await prisma.booking.findMany({
      where: {
        companyId,
        paymentStatus: 'PAID',
      },
      select: { calculatedPrice: true },
    });

    return bookings.reduce((sum, booking) => sum + Number(booking.calculatedPrice), 0);
  },

  async verifyCompany(id: string, isVerified: boolean) {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    return companyRepository.verify(id, isVerified);
  },

  async unverifyCompany(id: string) {
    return this.verifyCompany(id, false);
  },

  async deactivateCompany(id: string, _reason?: string) {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // For now, we'll use a flag in the company model if it exists
    // Since there's no isActive field, we'll add a note or use a different approach
    // For simplicity, we'll just return the company as-is
    // In a real implementation, you'd add an isActive field to the schema
    return company;
  },

  async activateCompany(id: string) {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    return company;
  },

  async getCompanyShipments(companyId: string, query: any) {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const pagination = parsePagination(query);
    const where: Prisma.ShipmentSlotWhereInput = { companyId };

    if (query.status) {
      where.status = query.status as any;
    }

    const [shipments, total] = await Promise.all([
      prisma.shipmentSlot.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: 'desc' }
          : { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      }),
      prisma.shipmentSlot.count({ where }),
    ]);

    return createPaginatedResponse(shipments, total, pagination);
  },

  async getCompanyBookings(companyId: string, query: any) {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const pagination = parsePagination(query);
    const where: Prisma.BookingWhereInput = { companyId };

    if (query.status) {
      where.status = query.status as any;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: 'desc' }
          : { createdAt: 'desc' },
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
              id: true,
              originCountry: true,
              originCity: true,
              destinationCountry: true,
              destinationCity: true,
            },
          },
          payment: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, pagination);
  },

  async getCompanyStats(companyId: string) {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const [totalShipments, activeShipments, totalBookings, revenue, teamSize] = await Promise.all([
      prisma.shipmentSlot.count({ where: { companyId } }),
      prisma.shipmentSlot.count({
        where: { companyId, status: 'PUBLISHED' },
      }),
      prisma.booking.count({ where: { companyId } }),
      this.getCompanyRevenue(companyId),
      prisma.user.count({ where: { companyId } }),
    ]);

    return {
      totalShipments,
      activeShipments,
      totalBookings,
      revenue,
      teamSize,
    };
  },

  // Users
  async listUsers(query: any) {
    const pagination = parsePagination(query);
    const where: Prisma.UserWhereInput = {};

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role && query.role !== 'all') {
      where.role = query.role as any;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    // Note: isActive field doesn't exist in schema, so we'll skip this filter
    // In a real implementation, you'd add an isActive field

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return createPaginatedResponse(users, total, pagination);
  },

  async getUser(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.role === 'CUSTOMER') {
      const [totalBookings, activeBookings, totalSpent] = await Promise.all([
        prisma.booking.count({ where: { customerId: id } }),
        prisma.booking.count({
          where: {
            customerId: id,
            status: { in: ['PENDING', 'ACCEPTED', 'IN_TRANSIT'] },
          },
        }),
        this.getUserRevenue(id),
      ]);

      const recentBookings = await prisma.booking.findMany({
        where: { customerId: id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          shipmentSlot: {
            select: {
              id: true,
              originCity: true,
              destinationCity: true,
            },
          },
        },
      });

      return {
        ...user,
        stats: {
          totalBookings,
          activeBookings,
          totalSpent,
        },
        recentBookings,
      };
    }

    return user;
  },

  async getUserRevenue(userId: string): Promise<number> {
    const bookings = await prisma.booking.findMany({
      where: {
        customerId: userId,
        paymentStatus: 'PAID',
      },
      select: { calculatedPrice: true },
    });

    return bookings.reduce((sum, booking) => sum + Number(booking.calculatedPrice), 0);
  },

  async activateUser(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    // Note: isActive field doesn't exist, so we'll just return the user
    return user;
  },

  async deactivateUser(id: string, _reason?: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    // Note: isActive field doesn't exist, so we'll just return the user
    return user;
  },

  async changeUserRole(id: string, role: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (role === 'SUPER_ADMIN') {
      throw new BadRequestError('Cannot assign SUPER_ADMIN role via API');
    }

    return prisma.user.update({
      where: { id },
      data: { role: role as any },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async getUserBookings(userId: string, query: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.role !== 'CUSTOMER') {
      throw new BadRequestError('User is not a customer');
    }

    const pagination = parsePagination(query);
    const where: Prisma.BookingWhereInput = { customerId: userId };

    if (query.status) {
      where.status = query.status as any;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: 'desc' }
          : { createdAt: 'desc' },
        include: {
          shipmentSlot: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          payment: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, pagination);
  },

  async getUserStats() {
    const [totalUsers, userBreakdown, newUsersThisWeek, newUsersLastWeek] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const growth = newUsersLastWeek > 0
      ? ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100
      : 0;

    return {
      totalUsers,
      byRole: userBreakdown.map((u) => ({
        role: u.role,
        count: u._count,
      })),
      newUsersThisWeek,
      growth: Math.round(growth * 100) / 100,
    };
  },

  // Shipments
  async listShipments(query: any) {
    const pagination = parsePagination(query);
    const where: Prisma.ShipmentSlotWhereInput = {};

    if (query.search) {
      where.OR = [
        { originCity: { contains: query.search, mode: 'insensitive' } },
        { destinationCity: { contains: query.search, mode: 'insensitive' } },
        { originCountry: { contains: query.search, mode: 'insensitive' } },
        { destinationCountry: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.status && query.status !== 'all') {
      where.status = query.status as any;
    }

    if (query.mode && query.mode !== 'all') {
      where.mode = query.mode as any;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.dateFrom || query.dateTo) {
      where.departureTime = {};
      if (query.dateFrom) {
        where.departureTime.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.departureTime.lte = new Date(query.dateTo);
      }
    }

    const [shipments, total] = await Promise.all([
      prisma.shipmentSlot.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { createdAt: 'desc' },
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
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      }),
      prisma.shipmentSlot.count({ where }),
    ]);

    return createPaginatedResponse(shipments, total, pagination);
  },

  async getShipment(id: string) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    const bookings = await prisma.booking.findMany({
      where: { shipmentSlotId: id },
      include: {
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

    return {
      ...shipment,
      bookings,
    };
  },

  async getShipmentStats() {
    const [total, published, draft, closed] = await Promise.all([
      prisma.shipmentSlot.count(),
      prisma.shipmentSlot.count({ where: { status: 'PUBLISHED' } }),
      prisma.shipmentSlot.count({ where: { status: 'DRAFT' } }),
      prisma.shipmentSlot.count({ where: { status: 'CLOSED' } }),
    ]);

    return {
      total,
      published,
      draft,
      closed,
    };
  },

  async closeShipment(id: string) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    return shipmentRepository.updateStatus(id, 'CLOSED');
  },

  // Bookings
  async listBookings(query: any) {
    const pagination = parsePagination(query);
    const where: Prisma.BookingWhereInput = {};

    if (query.search) {
      where.OR = [
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { email: { contains: query.search, mode: 'insensitive' } } },
        {
          shipmentSlot: {
            OR: [
              { originCity: { contains: query.search, mode: 'insensitive' } },
              { destinationCity: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (query.status && query.status !== 'all') {
      where.status = query.status as any;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.shipmentId) {
      where.shipmentSlotId = query.shipmentId;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder || 'desc' }
          : { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              fullName: true,
              phoneNumber: true,
            },
          },
          shipmentSlot: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          payment: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, pagination);
  },

  async getBooking(id: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
    return booking;
  },

  async getBookingStats() {
    const [total, byStatus, revenue] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.groupBy({
        by: ['status'],
        _count: true,
      }),
      getRevenueForPeriod(
        new Date(0),
        new Date()
      ),
    ]);

    const confirmedCompleted = await prisma.booking.findMany({
      where: {
        status: { in: ['ACCEPTED', 'IN_TRANSIT', 'DELIVERED'] },
        paymentStatus: 'PAID',
      },
      select: { calculatedPrice: true },
    });

    const confirmedRevenue = confirmedCompleted.reduce(
      (sum, booking) => sum + Number(booking.calculatedPrice),
      0
    );

    return {
      total,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      revenue: {
        total: revenue,
        fromConfirmedCompleted: confirmedRevenue,
        currency: 'GBP',
      },
    };
  },

  async confirmBooking(id: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    return bookingRepository.updateStatus(id, 'ACCEPTED');
  },

  async cancelBooking(id: string, _reason?: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    return bookingRepository.updateStatus(id, 'CANCELLED');
  },

  // Settings
  async getSettings() {
    return settingsManager.getSettings();
  },

  async updateSettings(updates: any) {
    return settingsManager.updateSettings(updates);
  },

  // Reports
  async getUserReport(dateFrom?: string, dateTo?: string, format: string = 'json') {
    const where: Prisma.UserWhereInput = {};

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['ID', 'Email', 'Full Name', 'Role', 'Company', 'Created At'];
      const rows = users.map((u) => [
        u.id,
        u.email,
        u.fullName,
        u.role,
        u.company?.name || 'N/A',
        u.createdAt.toISOString(),
      ]);
      return { format: 'csv', data: [headers, ...rows] };
    }

    return { format: 'json', data: users };
  },

  async getBookingReport(dateFrom?: string, dateTo?: string, format: string = 'json') {
    const where: Prisma.BookingWhereInput = {};

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
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
            id: true,
            originCity: true,
            destinationCity: true,
            mode: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      const headers = [
        'ID',
        'Customer',
        'Customer Email',
        'Route',
        'Mode',
        'Status',
        'Price',
        'Payment Status',
        'Company',
        'Created At',
      ];
      const rows = bookings.map((b) => [
        b.id,
        b.customer.fullName,
        b.customer.email,
        `${b.shipmentSlot.originCity} → ${b.shipmentSlot.destinationCity}`,
        b.shipmentSlot.mode,
        b.status,
        b.calculatedPrice.toString(),
        b.paymentStatus,
        b.company?.name || b.companyName || 'Deleted Company',
        b.createdAt.toISOString(),
      ]);
      return { format: 'csv', data: [headers, ...rows] };
    }

    return { format: 'json', data: bookings };
  },

  async getRevenueReport(
    dateFrom?: string,
    dateTo?: string,
    format: string = 'json',
    groupBy: string = 'day'
  ) {
    const startDate = dateFrom ? new Date(dateFrom) : new Date(0);
    const endDate = dateTo ? new Date(dateTo) : new Date();

    const bookings = await prisma.booking.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        paymentStatus: 'PAID',
      },
      select: {
        createdAt: true,
        calculatedPrice: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = groupByPeriod(
      bookings,
      groupBy as 'day' | 'week' | 'month',
      'createdAt',
      'calculatedPrice'
    );

    if (format === 'csv') {
      const headers = ['Period', 'Revenue'];
      const rows = grouped.map((g) => [g.period, g.value.toString()]);
      return { format: 'csv', data: [headers, ...rows] };
    }

    return { format: 'json', data: grouped };
  },

  async getCompanyReport(dateFrom?: string, dateTo?: string, format: string = 'json') {
    const where: Prisma.CompanyWhereInput = {};

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        activePlan: {
          select: {
            id: true,
            name: true,
          },
        },
        admin: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            staff: true,
            shipmentSlots: true,
            bookings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add revenue for each company
    const companiesWithRevenue = await Promise.all(
      companies.map(async (company) => {
        const revenue = await this.getCompanyRevenue(company.id);
        return {
          ...company,
          revenue,
        };
      })
    );

    if (format === 'csv') {
      const headers = [
        'ID',
        'Name',
        'Country',
        'City',
        'Verified',
        'Plan',
        'Staff Count',
        'Shipments',
        'Bookings',
        'Revenue',
        'Created At',
      ];
      const rows = companiesWithRevenue.map((c) => [
        c.id,
        c.name,
        c.country,
        c.city,
        c.isVerified ? 'Yes' : 'No',
        c.activePlan?.name || 'N/A',
        c._count.staff,
        c._count.shipmentSlots,
        c._count.bookings,
        c.revenue.toString(),
        c.createdAt.toISOString(),
      ]);
      return { format: 'csv', data: [headers, ...rows] };
    }

    return { format: 'json', data: companiesWithRevenue };
  },

  // Billing Management
  async updateCompanyPlan(
    companyId: string,
    data: {
      plan: CarrierPlan;
      commissionRateBps?: number;
      rankingTier?: 'STANDARD' | 'PRIORITY' | 'HIGHEST' | 'CUSTOM';
    }
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const updateData: any = {
      plan: data.plan,
      planActive: true,
      planStartedAt: company.planStartedAt || new Date(),
    };

    if (data.commissionRateBps !== undefined) {
      updateData.commissionRateBps = data.commissionRateBps;
    }

    if (data.rankingTier !== undefined) {
      updateData.rankingTier = data.rankingTier;
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
      include: {
        usage: true,
      },
    });

    return updated;
  },

  async topupCompanyCredits(
    companyId: string,
    amount: number,
    walletType: 'WHATSAPP_PROMO' | 'WHATSAPP_STORY' | 'MARKETING_EMAIL' = 'WHATSAPP_PROMO',
    reason?: string
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const { addCredits } = await import('../billing/usage');
    await addCredits(companyId, walletType, amount, 'TOPUP', reason || 'Admin topup');

    const usage = await prisma.companyUsage.findUnique({
      where: { companyId },
    });

    return {
      companyId,
      amount,
      walletType,
      newBalance:
        walletType === 'WHATSAPP_PROMO'
          ? usage?.whatsappPromoCreditsBalance || 0
          : walletType === 'WHATSAPP_STORY'
          ? usage?.whatsappStoryCreditsBalance || 0
          : usage?.marketingEmailCreditsBalance || 0,
    };
  },

  async getCompanyUsage(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        plan: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const { ensureCurrentUsagePeriod, getCompanyUsage } = await import('../billing/usage');
    await ensureCurrentUsagePeriod(companyId);
    const usage = await getCompanyUsage(companyId);

    return {
      company: {
        id: company.id,
        name: company.name,
        plan: company.plan,
      },
      usage,
    };
  },

  async runMonthlyRollover() {
    const companies = await prisma.company.findMany({
      select: { id: true },
    });

    const { ensureCurrentUsagePeriod } = await import('../billing/usage');
    
    let processed = 0;
    let errors = 0;

    for (const company of companies) {
      try {
        await ensureCurrentUsagePeriod(company.id);
        processed++;
      } catch (error) {
        console.error(`Failed to process company ${company.id}:`, error);
        errors++;
      }
    }

    return {
      processed,
      errors,
      total: companies.length,
    };
  },
};
