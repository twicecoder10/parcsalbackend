import { companyRepository, UpdateCompanyData } from './repository';
import { UpdateCompanyDto, CompleteCompanyOnboardingDto, CreateWarehouseAddressDto, UpdateWarehouseAddressDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { onboardingRepository } from '../onboarding/repository';
import prisma from '../../config/database';
import { invitationRepository } from './invitation-repository';
import { emailService } from '../../config/email';
import { config } from '../../config/env';
import { deleteImageByUrl } from '../../utils/upload';
import { createNotification, createCompanyNotification } from '../../utils/notifications';
import { reviewRepository } from '../reviews/repository';
import { checkStaffPermission } from '../../utils/permissions';
import { InvitationStatus } from '@prisma/client';

export const companyService = {
  async getMyCompany(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User is not associated with a company');
    }

    const company = await companyRepository.findById(req.user.companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    return company;
  },

  async updateMyCompany(req: AuthRequest, dto: UpdateCompanyDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User is not associated with a company');
    }

    // Check if user has permission (company admin or super admin)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can update company profile');
    }

    // Get current company to check for old logo
    const currentCompany = await companyRepository.findById(req.user.companyId);
    if (!currentCompany) {
      throw new NotFoundError('Company not found');
    }

    const updateData: UpdateCompanyData = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.website !== undefined) updateData.website = dto.website || null;
    
    // Handle logo update and cleanup old logo
    if (dto.logoUrl !== undefined) {
      updateData.logoUrl = dto.logoUrl || null;
      
      // If logo is being updated and old logo exists, delete the old one
      if (currentCompany.logoUrl && currentCompany.logoUrl !== dto.logoUrl) {
        const companyId = req.user.companyId;
        deleteImageByUrl(currentCompany.logoUrl).catch((err) => {
          console.error(`Failed to cleanup old logo for company ${companyId}:`, err);
        });
      }
    }

    const company = await companyRepository.update(req.user.companyId, updateData);
    
    // Mark company_profile onboarding step as complete when profile is updated
    await onboardingRepository.updateCompanyOnboardingStep(
      req.user.companyId,
      'company_profile',
      true
    ).catch((err) => {
      // Don't fail the update if onboarding update fails
      console.error('Failed to update onboarding step:', err);
    });
    
    return company;
  },

  async listAllCompanies(query: any) {
    const pagination = parsePagination(query);
    const isVerified = query.isVerified === 'true' ? true : query.isVerified === 'false' ? false : undefined;

    const { companies, total } = await companyRepository.listAll({
      ...pagination,
      isVerified,
    });

    return createPaginatedResponse(companies, total, pagination);
  },

  async verifyCompany(id: string, isVerified: boolean) {
    const company = await companyRepository.findById(id);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    return companyRepository.verify(id, isVerified);
  },

  async completeOnboarding(req: AuthRequest, dto: CompleteCompanyOnboardingDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User is not associated with a company');
    }

    // Check if user has permission (company admin or company staff)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'COMPANY_STAFF' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins and staff can complete company onboarding');
    }

    const company = await companyRepository.findById(req.user.companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const updateData: UpdateCompanyData = {
      description: dto.companyDescription || company.description,
      website: dto.companyWebsite || company.website,
      logoUrl: dto.companyLogoUrl || company.logoUrl,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      address: dto.address || null,
      city: dto.city || company.city,
      state: dto.state || null,
      postalCode: dto.postalCode || null,
    };

    await companyRepository.update(req.user.companyId, updateData);

    // Mark company_profile onboarding step as complete
    // This will recalculate company.onboardingCompleted based on all required steps
    await onboardingRepository.updateCompanyOnboardingStep(
      req.user.companyId,
      'company_profile',
      true
    ).catch((err) => {
      console.error('Failed to update company onboarding step:', err);
    });

    // Mark user's profile_completion step as complete
    // For COMPANY_ADMIN, completing company profile is their profile completion
    // This will also recalculate user.onboardingCompleted based on user steps and company onboarding
    await onboardingRepository.updateUserOnboardingStep(
      req.user.id,
      'profile_completion',
      true
    ).catch((err) => {
      console.error('Failed to update user onboarding step:', err);
    });

    return {
      message: 'Onboarding completed successfully',
    };
  },

  // Overview/Dashboard methods
  async getOverviewStats(req: AuthRequest) {
    // Check staff permission
    await checkStaffPermission(req, 'viewAnalytics');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const companyId = req.user.companyId;

    // Get active shipments count
    const activeShipments = await prisma.shipmentSlot.count({
      where: {
        companyId,
        status: 'PUBLISHED',
      },
    });

    // Get upcoming departures (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const upcomingDepartures = await prisma.shipmentSlot.count({
      where: {
        companyId,
        status: 'PUBLISHED',
        departureTime: {
          gte: new Date(),
          lte: sevenDaysFromNow,
        },
      },
    });

    // Get total bookings
    const totalBookings = await prisma.booking.count({
      where: { companyId },
    });

    // Get revenue from accepted bookings
    const acceptedBookings = await prisma.booking.findMany({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
      },
      select: {
        calculatedPrice: true,
      },
    });

    const revenue = acceptedBookings.reduce((sum, booking) => {
      return sum + Number(booking.calculatedPrice);
    }, 0);

    // Get pending bookings count
    const pendingBookings = await prisma.booking.count({
      where: {
        companyId,
        status: 'PENDING',
      },
    });

    // Get accepted bookings count
    const acceptedBookingsCount = await prisma.booking.count({
      where: {
        companyId,
        status: 'ACCEPTED',
      },
    });

    // Calculate change percentages (comparing last 30 days to previous 30 days)
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recentRevenue = await prisma.booking.aggregate({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
        createdAt: {
          gte: last30Days,
        },
      },
      _sum: {
        calculatedPrice: true,
      },
    });

    const previousRevenue = await prisma.booking.aggregate({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
        createdAt: {
          gte: previous30Days,
          lt: last30Days,
        },
      },
      _sum: {
        calculatedPrice: true,
      },
    });

    const recentRevenueValue = Number(recentRevenue._sum.calculatedPrice || 0);
    const previousRevenueValue = Number(previousRevenue._sum.calculatedPrice || 0);
    const revenueChangePercentage =
      previousRevenueValue === 0
        ? (recentRevenueValue > 0 ? 100 : 0)
        : ((recentRevenueValue - previousRevenueValue) / previousRevenueValue) * 100;

    const recentBookingsCount = await prisma.booking.count({
      where: {
        companyId,
        createdAt: {
          gte: last30Days,
        },
      },
    });

    const previousBookingsCount = await prisma.booking.count({
      where: {
        companyId,
        createdAt: {
          gte: previous30Days,
          lt: last30Days,
        },
      },
    });

    const bookingsChangePercentage =
      previousBookingsCount === 0
        ? (recentBookingsCount > 0 ? 100 : 0)
        : ((recentBookingsCount - previousBookingsCount) / previousBookingsCount) * 100;

    return {
      activeShipments,
      upcomingDepartures,
      totalBookings,
      revenue: Number(revenue.toFixed(2)),
      pendingBookings,
      acceptedBookings: acceptedBookingsCount,
      revenueChangePercentage: Number(revenueChangePercentage.toFixed(2)),
      bookingsChangePercentage: Number(bookingsChangePercentage.toFixed(2)),
    };
  },

  async getRecentBookings(req: AuthRequest, limit: number = 5) {
    // Check staff permission
    await checkStaffPermission(req, 'viewBookings');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const bookings = await prisma.booking.findMany({
      where: {
        companyId: req.user.companyId,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
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
            originCountry: true,
            originCity: true,
            destinationCountry: true,
            destinationCity: true,
          },
        },
        payment: true,
      },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      customer: {
        id: booking.customer.id,
        name: booking.customer.fullName,
        email: booking.customer.email,
      },
      route: {
        origin: `${booking.shipmentSlot.originCity}, ${booking.shipmentSlot.originCountry}`,
        destination: `${booking.shipmentSlot.destinationCity}, ${booking.shipmentSlot.destinationCountry}`,
      },
      status: booking.status,
      price: Number(booking.calculatedPrice),
      createdAt: booking.createdAt,
    }));
  },

  async getUpcomingShipments(req: AuthRequest, limit: number = 5) {
    // Check staff permission
    await checkStaffPermission(req, 'viewShipments');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const shipments = await prisma.shipmentSlot.findMany({
      where: {
        companyId: req.user.companyId,
        status: 'PUBLISHED',
        departureTime: {
          gte: new Date(),
        },
      },
      take: limit,
      orderBy: {
        departureTime: 'asc',
      },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return shipments.map((shipment) => ({
      id: shipment.id,
      route: {
        origin: `${shipment.originCity}, ${shipment.originCountry}`,
        destination: `${shipment.destinationCity}, ${shipment.destinationCountry}`,
      },
      departureTime: shipment.departureTime,
      mode: shipment.mode,
      bookingsCount: shipment._count.bookings,
    }));
  },

  // Analytics
  async getAnalytics(req: AuthRequest, period: 'week' | 'month' | 'quarter' | 'year') {
    // Check staff permission
    await checkStaffPermission(req, 'viewAnalytics');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const companyId = req.user.companyId;
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        previousStartDate = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        break;
      default:
        throw new BadRequestError('Invalid period. Must be week, month, quarter, or year');
    }

    // Revenue data
    const currentRevenue = await prisma.booking.aggregate({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
        createdAt: { gte: startDate },
      },
      _sum: { calculatedPrice: true },
    });

    const previousRevenue = await prisma.booking.aggregate({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
        createdAt: { gte: previousStartDate, lt: startDate },
      },
      _sum: { calculatedPrice: true },
    });

    const revenueValue = Number(currentRevenue._sum.calculatedPrice || 0);
    const previousRevenueValue = Number(previousRevenue._sum.calculatedPrice || 0);
    const revenueChangePercentage =
      previousRevenueValue === 0
        ? (revenueValue > 0 ? 100 : 0)
        : ((revenueValue - previousRevenueValue) / previousRevenueValue) * 100;

    // Bookings data
    const [currentBookings, previousBookings, acceptedBookings, pendingBookings, rejectedBookings] = await Promise.all([
      prisma.booking.count({
        where: { companyId, createdAt: { gte: startDate } },
      }),
      prisma.booking.count({
        where: { companyId, createdAt: { gte: previousStartDate, lt: startDate } },
      }),
      prisma.booking.count({
        where: { companyId, status: 'ACCEPTED', createdAt: { gte: startDate } },
      }),
      prisma.booking.count({
        where: { companyId, status: 'PENDING', createdAt: { gte: startDate } },
      }),
      prisma.booking.count({
        where: { companyId, status: 'REJECTED', createdAt: { gte: startDate } },
      }),
    ]);

    const bookingsChangePercentage =
      previousBookings === 0
        ? (currentBookings > 0 ? 100 : 0)
        : ((currentBookings - previousBookings) / previousBookings) * 100;

    // Shipments data
    const [activeShipments, publishedShipments, completedShipments, previousActiveShipments] = await Promise.all([
      prisma.shipmentSlot.count({
        where: { companyId, status: { in: ['DRAFT', 'PUBLISHED'] } },
      }),
      prisma.shipmentSlot.count({
        where: { companyId, status: 'PUBLISHED' },
      }),
      prisma.shipmentSlot.count({
        where: { companyId, status: 'CLOSED', updatedAt: { gte: startDate } },
      }),
      prisma.shipmentSlot.count({
        where: { companyId, status: { in: ['DRAFT', 'PUBLISHED'] }, updatedAt: { lt: startDate } },
      }),
    ]);

    const shipmentsChangePercentage =
      previousActiveShipments === 0
        ? (activeShipments > 0 ? 100 : 0)
        : ((activeShipments - previousActiveShipments) / previousActiveShipments) * 100;

    // Top routes
    const topRoutesData = await prisma.booking.groupBy({
      by: ['shipmentSlotId'],
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      _count: { id: true },
      _sum: { calculatedPrice: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topRoutes = await Promise.all(
      topRoutesData.map(async (route) => {
        const shipment = await prisma.shipmentSlot.findUnique({
          where: { id: route.shipmentSlotId },
          select: {
            originCountry: true,
            originCity: true,
            destinationCountry: true,
            destinationCity: true,
          },
        });

        return {
          route: shipment
            ? `${shipment.originCity}, ${shipment.originCountry} → ${shipment.destinationCity}, ${shipment.destinationCountry}`
            : 'Unknown',
          bookingsCount: route._count.id,
          revenue: Number(route._sum.calculatedPrice || 0),
        };
      })
    );

    // Revenue by period (time series)
    const revenueByPeriod = await prisma.booking.findMany({
      where: {
        companyId,
        status: 'ACCEPTED',
        paymentStatus: 'PAID',
        createdAt: { gte: startDate },
      },
      select: {
        calculatedPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by period
    const groupedRevenue: Record<string, number> = {};
    revenueByPeriod.forEach((booking) => {
      const date = new Date(booking.createdAt);
      let key: string;

      if (period === 'week') {
        key = date.toISOString().split('T')[0]; // Daily
      } else if (period === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // Monthly
      } else if (period === 'quarter') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
      } else {
        key = String(date.getFullYear());
      }

      groupedRevenue[key] = (groupedRevenue[key] || 0) + Number(booking.calculatedPrice);
    });

    const revenueTimeSeries = Object.entries(groupedRevenue).map(([period, revenue]) => ({
      period,
      revenue: Number(revenue.toFixed(2)),
    }));

    return {
      revenue: {
        total: Number(revenueValue.toFixed(2)),
        changePercentage: Number(revenueChangePercentage.toFixed(2)),
      },
      bookings: {
        total: currentBookings,
        accepted: acceptedBookings,
        pending: pendingBookings,
        rejected: rejectedBookings,
        changePercentage: Number(bookingsChangePercentage.toFixed(2)),
      },
      shipments: {
        active: activeShipments,
        published: publishedShipments,
        completed: completedShipments,
        changePercentage: Number(shipmentsChangePercentage.toFixed(2)),
      },
      topRoutes,
      revenueByPeriod: revenueTimeSeries,
    };
  },

  // Team Management
  async getTeamMembers(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view team members');
    }

    const teamMembers = await prisma.user.findMany({
      where: {
        companyId: req.user.companyId,
        role: {
          in: ['COMPANY_ADMIN', 'COMPANY_STAFF'],
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return teamMembers.map((member) => ({
      id: member.id,
      name: member.fullName,
      email: member.email,
      role: member.role,
      status: 'ACTIVE', // All users in the list are active
      joinedAt: member.createdAt,
    }));
  },

  async updateTeamMemberRole(req: AuthRequest, memberId: string, role: 'COMPANY_STAFF' | 'COMPANY_ADMIN') {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can update team member roles');
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
    });

    if (!member || member.companyId !== req.user.companyId) {
      throw new NotFoundError('Team member not found');
    }

    if (member.role !== 'COMPANY_ADMIN' && member.role !== 'COMPANY_STAFF') {
      throw new BadRequestError('User is not a team member');
    }

    // Prevent removing the last admin
    if (member.role === 'COMPANY_ADMIN' && role === 'COMPANY_STAFF') {
      const adminCount = await prisma.user.count({
        where: {
          companyId: req.user.companyId,
          role: 'COMPANY_ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new BadRequestError('Cannot remove the last company admin');
      }
    }

    const updated = await prisma.user.update({
      where: { id: memberId },
      data: { role },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return {
      id: updated.id,
      name: updated.fullName,
      email: updated.email,
      role: updated.role,
      status: 'ACTIVE',
      joinedAt: updated.createdAt,
    };
  },

  async removeTeamMember(req: AuthRequest, memberId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can remove team members');
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
    });

    if (!member || member.companyId !== req.user.companyId) {
      throw new NotFoundError('Team member not found');
    }

    if (member.role !== 'COMPANY_ADMIN' && member.role !== 'COMPANY_STAFF') {
      throw new BadRequestError('User is not a team member');
    }

    // Prevent removing the last admin
    if (member.role === 'COMPANY_ADMIN') {
      const adminCount = await prisma.user.count({
        where: {
          companyId: req.user.companyId,
          role: 'COMPANY_ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new BadRequestError('Cannot remove the last company admin');
      }
    }

    // Remove user from company (set companyId to null)
    await prisma.user.update({
      where: { id: memberId },
      data: { companyId: null },
    });

    // Notify other company admins about removal
    await createCompanyNotification(
      req.user.companyId,
      'TEAM_MEMBER_REMOVED',
      'Team Member Removed',
      `${member.fullName} (${member.email}) has been removed from the team`,
      {
        memberId: member.id,
        memberName: member.fullName,
        memberEmail: member.email,
        removedBy: req.user.id,
      }
    ).catch((err) => {
      console.error('Failed to create team member removal notification:', err);
    });

    return { message: 'Team member removed successfully' };
  },

  // Team Invitations
  async inviteTeamMember(req: AuthRequest, email: string, role: 'COMPANY_STAFF' | 'COMPANY_ADMIN') {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can invite team members');
    }

    const companyId = req.user.companyId;

    // Check if email is already a team member
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.companyId === companyId) {
      throw new BadRequestError('User is already a team member');
    }

    // Check if there's a pending invitation for this email
    const existingInvitation = await invitationRepository.findByEmailAndCompany(email, companyId);
    if (existingInvitation) {
      throw new BadRequestError('A pending invitation already exists for this email');
    }

    // Check plan limits
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { activePlan: true },
    });

    if (company?.activePlan) {
      const currentTeamCount = await prisma.user.count({
        where: {
          companyId,
          role: {
            in: ['COMPANY_ADMIN', 'COMPANY_STAFF'],
          },
        },
      });

      const pendingInvitationsCount = await prisma.teamInvitation.count({
        where: {
          companyId,
          status: 'PENDING',
        },
      });

      const maxTeamMembers = company.activePlan.maxTeamMembers;
      if (maxTeamMembers !== null && (currentTeamCount + pendingInvitationsCount) >= maxTeamMembers) {
        throw new BadRequestError(
          `Plan limit reached. Maximum ${maxTeamMembers} team members allowed.`
        );
      }
    }

    // Create invitation (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await invitationRepository.create({
      companyId,
      email,
      role,
      invitedById: req.user.id,
      expiresAt,
    });

    // Send invitation email
    const invitationUrl = `${config.frontendUrl}/auth/accept-invitation?token=${invitation.token}`;
    const companyName = company?.name || 'the company';

    await emailService.sendTeamInvitationEmail(
      email,
      invitation.token,
      companyName,
      role,
      invitationUrl
    ).catch((err) => {
      // Log error but don't fail the invitation creation
      console.error('Failed to send invitation email:', err);
    });

    // Create notification if user already exists
    if (existingUser) {
      await createNotification({
        userId: existingUser.id,
        type: 'TEAM_INVITATION',
        title: 'Team Invitation',
        body: `You have been invited to join ${companyName} as ${role === 'COMPANY_ADMIN' ? 'Company Admin' : 'Company Staff'}`,
        metadata: {
          invitationId: invitation.id,
          companyId: companyId,
          companyName: companyName,
          role: role,
          token: invitation.token,
        },
      }).catch((err) => {
        console.error('Failed to create team invitation notification:', err);
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invitedAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    };
  },

  async getPendingInvitations(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view invitations');
    }

    // Expire old invitations first
    await invitationRepository.expireOldInvitations();

    const invitations = await invitationRepository.findByCompany(req.user.companyId, 'PENDING');

    return invitations.map((invitation: any) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invitedAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      invitedBy: invitation.invitedBy ? {
        id: invitation.invitedBy.id,
        name: invitation.invitedBy.fullName,
        email: invitation.invitedBy.email,
      } : null,
    }));
  },

  async getInvitations(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view invitations');
    }

    // Expire old invitations first
    await invitationRepository.expireOldInvitations();

    // Get optional status filter from query params
    const status = req.query?.status as string | undefined;
    const validStatuses = ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'];
    
    if (status && !validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const invitations = await invitationRepository.findByCompany(
      req.user.companyId,
      status as InvitationStatus | undefined
    );

    return invitations.map((invitation: any) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      invitedBy: invitation.invitedBy ? {
        id: invitation.invitedBy.id,
        name: invitation.invitedBy.fullName,
        email: invitation.invitedBy.email,
      } : null,
      acceptedBy: invitation.acceptedBy ? {
        id: invitation.acceptedBy.id,
        name: invitation.acceptedBy.fullName,
        email: invitation.acceptedBy.email,
      } : null,
    }));
  },

  async cancelInvitation(req: AuthRequest, invitationId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can cancel invitations');
    }

    // Try finding by ID first (more reliable)
    let invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
    });

    // If not found by ID, try finding by token
    if (!invitation) {
      invitation = await invitationRepository.findByToken(invitationId);
    }

    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    // Verify the invitation belongs to the user's company
    if (invitation.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to cancel this invitation');
    }

    // Allow revoking any invitation that hasn't been accepted
    // This includes PENDING, EXPIRED, and already CANCELLED (idempotent)
    if (invitation.status === 'ACCEPTED') {
      throw new BadRequestError('Cannot revoke an accepted invitation');
    }

    // If already cancelled, return success (idempotent operation)
    if (invitation.status === 'CANCELLED') {
      return { message: 'Invitation is already revoked' };
    }

    await invitationRepository.updateStatus(invitation.id, 'CANCELLED');
    return { message: 'Invitation revoked successfully' };
  },

  // Company Settings
  async getSettings(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Get company with notification preferences
    // For now, we'll use default settings per user
    // In the future, this could be stored in a separate Settings model or JSON field on Company
    const company = await companyRepository.findById(req.user.companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Get user's notification preferences (company users can have individual preferences)
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        notificationEmail: true,
        notificationSMS: true,
      },
    });

    return {
      notifications: {
        email: user?.notificationEmail ?? true,
        sms: user?.notificationSMS ?? false,
        bookingUpdates: true, // Default to true, can be made configurable
        shipmentUpdates: true, // Default to true, can be made configurable
      },
    };
  },

  async updateSettings(req: AuthRequest, settings: any) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Update user's notification preferences
    if (settings.notifications) {
      const updateData: any = {};
      if (settings.notifications.email !== undefined) {
        updateData.notificationEmail = settings.notifications.email;
      }
      if (settings.notifications.sms !== undefined) {
        updateData.notificationSMS = settings.notifications.sms;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: updateData,
        });
      }
    }

    // Get updated user preferences
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        notificationEmail: true,
        notificationSMS: true,
      },
    });

    return {
      notifications: {
        email: user?.notificationEmail ?? true,
        sms: user?.notificationSMS ?? false,
        bookingUpdates: settings.notifications?.bookingUpdates ?? true,
        shipmentUpdates: settings.notifications?.shipmentUpdates ?? true,
      },
    };
  },

  // Warehouse Addresses
  async createWarehouseAddress(req: AuthRequest, dto: CreateWarehouseAddressDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user has permission (company admin or super admin)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can add warehouse addresses');
    }

    const companyId = req.user.companyId;

    // If this is set as default, unset other default addresses
    if (dto.isDefault) {
      await prisma.warehouseAddress.updateMany({
        where: {
          companyId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const warehouseAddress = await prisma.warehouseAddress.create({
      data: {
        companyId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state || null,
        country: dto.country,
        postalCode: dto.postalCode || null,
        isDefault: dto.isDefault || false,
      },
    });

    return warehouseAddress;
  },

  async listWarehouseAddresses(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const warehouseAddresses = await prisma.warehouseAddress.findMany({
      where: {
        companyId: req.user.companyId,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return warehouseAddresses;
  },

  async updateWarehouseAddress(req: AuthRequest, warehouseId: string, dto: UpdateWarehouseAddressDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user has permission (company admin or super admin)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can update warehouse addresses');
    }

    const companyId = req.user.companyId;

    // Verify the warehouse address belongs to the company
    const existingWarehouse = await prisma.warehouseAddress.findUnique({
      where: { id: warehouseId },
    });

    if (!existingWarehouse) {
      throw new NotFoundError('Warehouse address not found');
    }

    if (existingWarehouse.companyId !== companyId) {
      throw new ForbiddenError('You do not have permission to update this warehouse address');
    }

    // If setting this as default, unset other default addresses
    if (dto.isDefault === true) {
      await prisma.warehouseAddress.updateMany({
        where: {
          companyId,
          isDefault: true,
          id: { not: warehouseId },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state || null;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.postalCode !== undefined) updateData.postalCode = dto.postalCode || null;
    if (dto.isDefault !== undefined) updateData.isDefault = dto.isDefault;

    const warehouseAddress = await prisma.warehouseAddress.update({
      where: { id: warehouseId },
      data: updateData,
    });

    return warehouseAddress;
  },

  async deleteWarehouseAddress(req: AuthRequest, warehouseId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user has permission (company admin or super admin)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can delete warehouse addresses');
    }

    const companyId = req.user.companyId;

    // Verify the warehouse address belongs to the company
    const existingWarehouse = await prisma.warehouseAddress.findUnique({
      where: { id: warehouseId },
    });

    if (!existingWarehouse) {
      throw new NotFoundError('Warehouse address not found');
    }

    if (existingWarehouse.companyId !== companyId) {
      throw new ForbiddenError('You do not have permission to delete this warehouse address');
    }

    await prisma.warehouseAddress.delete({
      where: { id: warehouseId },
    });

    return { message: 'Warehouse address deleted successfully' };
  },

  // Public method to get warehouse addresses by company ID or slug
  async getCompanyWarehouseAddresses(companyIdOrSlug: string) {
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
        isVerified: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Only show warehouse addresses for verified companies
    if (!company.isVerified) {
      throw new ForbiddenError('Company warehouse addresses are not available');
    }

    const warehouseAddresses = await prisma.warehouseAddress.findMany({
      where: {
        companyId: company.id,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return warehouseAddresses;
  },

  // Get current user's restrictions (for frontend layout)
  async getMyRestrictions(req: AuthRequest) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Admins and super admins have no restrictions
    if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'SUPER_ADMIN') {
      // Return all actions as enabled for admins
      const allActionsEnabled: Record<string, boolean> = {
        createShipment: true,
        updateShipment: true,
        deleteShipment: true,
        updateShipmentStatus: true,
        updateShipmentTrackingStatus: true,
        acceptBooking: true,
        rejectBooking: true,
        updateBookingStatus: true,
        addProofImages: true,
        regenerateLabel: true,
        replyToReview: true,
        viewAnalytics: true,
        viewBookings: true,
        viewShipments: true,
        viewPayments: true,
        viewPaymentStats: true,
        processRefund: true,
      };
      return {
        restrictions: allActionsEnabled,
        isAdmin: true,
      };
    }

    // For staff, get their specific restrictions
    if (req.user.role === 'COMPANY_STAFF') {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { restrictions: true },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Default restrictions - all actions enabled by default
      const defaultRestrictions: Record<string, boolean> = {
        createShipment: true,
        updateShipment: true,
        deleteShipment: true,
        updateShipmentStatus: true,
        updateShipmentTrackingStatus: true,
        acceptBooking: true,
        rejectBooking: true,
        updateBookingStatus: true,
        addProofImages: true,
        regenerateLabel: true,
        replyToReview: true,
        viewAnalytics: true,
        viewBookings: true,
        viewShipments: true,
        viewPayments: true,
        viewPaymentStats: true,
        processRefund: true,
      };

      const restrictions = (user.restrictions as Record<string, boolean> | null) || {};
      
      // Merge with defaults - if a restriction is not set, it defaults to true (enabled)
      const mergedRestrictions: Record<string, boolean> = {};
      Object.keys(defaultRestrictions).forEach((action) => {
        mergedRestrictions[action] = restrictions[action] !== undefined ? restrictions[action] : defaultRestrictions[action];
      });

      return {
        restrictions: mergedRestrictions,
        isAdmin: false,
      };
    }

    // For other roles (like CUSTOMER), return empty restrictions
    return {
      restrictions: {},
      isAdmin: false,
    };
  },

  // Staff Restrictions Management (per staff member)
  async getStaffRestrictions(req: AuthRequest, memberId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view staff restrictions');
    }

    // Get the staff member
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        companyId: true,
        restrictions: true,
      },
    });

    if (!member) {
      throw new NotFoundError('Staff member not found');
    }

    // Verify the member belongs to the same company
    if (member.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to view restrictions for this staff member');
    }

    // Verify the member is actually a staff member
    if (member.role !== 'COMPANY_STAFF' && member.role !== 'COMPANY_ADMIN') {
      throw new BadRequestError('User is not a staff member');
    }

    // Default restrictions - all actions enabled by default
    const defaultRestrictions: Record<string, boolean> = {
      createShipment: true,
      updateShipment: true,
      deleteShipment: true,
      updateShipmentStatus: true,
      updateShipmentTrackingStatus: true,
      acceptBooking: true,
      rejectBooking: true,
      updateBookingStatus: true,
      addProofImages: true,
      regenerateLabel: true,
      replyToReview: true,
      viewAnalytics: true,
      viewBookings: true,
      viewShipments: true,
      viewPayments: true,
      viewPaymentStats: true,
      processRefund: true,
    };

    const restrictions = (member.restrictions as Record<string, boolean> | null) || {};
    
    // Merge with defaults - if a restriction is not set, it defaults to true (enabled)
    const mergedRestrictions: Record<string, boolean> = {};
    Object.keys(defaultRestrictions).forEach((action) => {
      mergedRestrictions[action] = restrictions[action] !== undefined ? restrictions[action] : defaultRestrictions[action];
    });

    return {
      member: {
        id: member.id,
        email: member.email,
        name: member.fullName,
        role: member.role,
      },
      restrictions: mergedRestrictions,
    };
  },

  async updateStaffRestrictions(req: AuthRequest, memberId: string, restrictions: Record<string, boolean>) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can update staff restrictions');
    }

    // Get the staff member
    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        companyId: true,
        restrictions: true,
      },
    });

    if (!member) {
      throw new NotFoundError('Staff member not found');
    }

    // Verify the member belongs to the same company
    if (member.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update restrictions for this staff member');
    }

    // Verify the member is actually a staff member
    if (member.role !== 'COMPANY_STAFF' && member.role !== 'COMPANY_ADMIN') {
      throw new BadRequestError('User is not a staff member');
    }

    // Prevent admins from having restrictions
    if (member.role === 'COMPANY_ADMIN') {
      throw new BadRequestError('Admins cannot have restrictions applied');
    }

    // Validate restriction keys
    const validActions = [
      'createShipment',
      'updateShipment',
      'deleteShipment',
      'updateShipmentStatus',
      'updateShipmentTrackingStatus',
      'acceptBooking',
      'rejectBooking',
      'updateBookingStatus',
      'addProofImages',
      'regenerateLabel',
      'replyToReview',
      'viewAnalytics',
      'viewBookings',
      'viewShipments',
      'viewPayments',
      'viewPaymentStats',
      'processRefund',
    ];

    const invalidActions = Object.keys(restrictions).filter((key) => !validActions.includes(key));
    if (invalidActions.length > 0) {
      throw new BadRequestError(`Invalid action keys: ${invalidActions.join(', ')}`);
    }

    // Get current restrictions and merge with new ones
    const currentRestrictions = (member.restrictions as Record<string, boolean> | null) || {};
    const updatedRestrictions = { ...currentRestrictions, ...restrictions };

    // Update user with new restrictions
    await prisma.user.update({
      where: { id: memberId },
      data: {
        restrictions: updatedRestrictions as any,
      },
    });

    return {
      member: {
        id: member.id,
        email: member.email,
        name: member.fullName,
        role: member.role,
      },
      restrictions: updatedRestrictions,
    };
  },

  // Public method to get company profile with limited info
  async getPublicCompanyProfile(companyIdOrSlug: string) {
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
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        website: true,
        country: true,
        city: true,
        isVerified: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Get average rating and review count
    const [averageRating, reviewCount] = await Promise.all([
      reviewRepository.getCompanyAverageRating(company.id),
      reviewRepository.getCompanyReviewCount(company.id),
    ]);

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      description: company.description,
      logoUrl: company.logoUrl,
      website: company.website,
      country: company.country,
      city: company.city,
      isVerified: company.isVerified,
      rating: averageRating !== null ? Number(Number(averageRating).toFixed(1)) : null,
      reviewCount,
    };
  },

  async getCompanyShipments(companyIdOrSlug: string, query: any = {}) {
    // Find company by ID or slug
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

    // Parse pagination
    const pagination = parsePagination(query);

    // Query only PUBLISHED shipments for this company
    const where = {
      companyId: company.id,
      status: 'PUBLISHED' as const,
    };

    const [shipments, total] = await Promise.all([
      prisma.shipmentSlot.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: {
          departureTime: 'asc',
        },
        select: {
          id: true,
          originCountry: true,
          originCity: true,
          destinationCountry: true,
          destinationCity: true,
          departureTime: true,
          arrivalTime: true,
          mode: true,
          pricingModel: true,
          pricePerKg: true,
          pricePerItem: true,
          flatPrice: true,
          totalCapacityKg: true,
          totalCapacityItems: true,
          remainingCapacityKg: true,
          remainingCapacityItems: true,
          cutoffTimeForReceivingItems: true,
          createdAt: true,
        },
      }),
      prisma.shipmentSlot.count({ where }),
    ]);

    return createPaginatedResponse(shipments, total, pagination);
  },
};

