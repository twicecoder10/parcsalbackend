import { bookingRepository, CreateBookingData } from './repository';
import { CreateBookingDto, UpdateBookingStatusDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import prisma from '../../config/database';
import { Decimal } from '@prisma/client/runtime/library';
import { onboardingRepository } from '../onboarding/repository';
import { createNotification, createCompanyNotification } from '../../utils/notifications';
import { emailService } from '../../config/email';

export const bookingService = {
  calculatePrice(
    pricingModel: 'PER_KG' | 'PER_ITEM' | 'FLAT',
    pricePerKg: number | null,
    pricePerItem: number | null,
    flatPrice: number | null,
    requestedWeightKg: number | null,
    requestedItemsCount: number | null
  ): number {
    if (pricingModel === 'FLAT') {
      if (!flatPrice) {
        throw new BadRequestError('Flat price is not set for this shipment');
      }
      return Number(flatPrice);
    }

    if (pricingModel === 'PER_KG') {
      if (!pricePerKg || !requestedWeightKg) {
        throw new BadRequestError('Price per kg and weight are required');
      }
      return Number(pricePerKg) * requestedWeightKg;
    }

    if (pricingModel === 'PER_ITEM') {
      if (!pricePerItem || !requestedItemsCount) {
        throw new BadRequestError('Price per item and item count are required');
      }
      return Number(pricePerItem) * requestedItemsCount;
    }

    throw new BadRequestError('Invalid pricing model');
  },

  async createBooking(req: AuthRequest, dto: CreateBookingDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }
    if (req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can create bookings');
    }

    // Get shipment slot
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: dto.shipmentSlotId },
      include: {
        company: true,
      },
    });

    if (!shipmentSlot) {
      throw new NotFoundError('Shipment slot not found');
    }

    if (shipmentSlot.status !== 'PUBLISHED') {
      throw new BadRequestError('Shipment slot is not available for booking');
    }

    // Validate capacity based on pricing model
    if (shipmentSlot.pricingModel === 'PER_KG') {
      if (!dto.requestedWeightKg || dto.requestedWeightKg <= 0) {
        throw new BadRequestError('requestedWeightKg is required for PER_KG pricing model');
      }
      if (shipmentSlot.remainingCapacityKg === null) {
        throw new BadRequestError('Weight-based booking not supported for this shipment');
      }
      if (shipmentSlot.remainingCapacityKg < dto.requestedWeightKg) {
        throw new BadRequestError('Insufficient capacity for requested weight');
      }
    } else if (shipmentSlot.pricingModel === 'PER_ITEM') {
      if (!dto.requestedItemsCount || dto.requestedItemsCount <= 0) {
        throw new BadRequestError('requestedItemsCount is required for PER_ITEM pricing model');
      }
      if (shipmentSlot.remainingCapacityItems === null) {
        throw new BadRequestError('Item-based booking not supported for this shipment');
      }
      if (shipmentSlot.remainingCapacityItems < dto.requestedItemsCount) {
        throw new BadRequestError('Insufficient capacity for requested items');
      }
    } else if (shipmentSlot.pricingModel === 'FLAT') {
      // For FLAT pricing, we can optionally limit to 1 booking or check if still available
      // For now, just check if slot is published (already done above)
    }

    // Calculate price
    const calculatedPrice = this.calculatePrice(
      shipmentSlot.pricingModel,
      shipmentSlot.pricePerKg ? Number(shipmentSlot.pricePerKg) : null,
      shipmentSlot.pricePerItem ? Number(shipmentSlot.pricePerItem) : null,
      shipmentSlot.flatPrice ? Number(shipmentSlot.flatPrice) : null,
      dto.requestedWeightKg || null,
      dto.requestedItemsCount || null
    );

    // Store user ID for use in transaction
    const customerId = req.user.id;

    // Create booking and update capacity in a transaction to prevent race conditions
    const booking = await prisma.$transaction(async (tx) => {
      // Re-check capacity within transaction (with lock)
      const lockedSlot = await tx.shipmentSlot.findUnique({
        where: { id: dto.shipmentSlotId },
      });

      if (!lockedSlot || lockedSlot.status !== 'PUBLISHED') {
        throw new BadRequestError('Shipment slot is not available for booking');
      }

      // Validate capacity again (double-check)
      if (shipmentSlot.pricingModel === 'PER_KG') {
        if (lockedSlot.remainingCapacityKg === null || lockedSlot.remainingCapacityKg < (dto.requestedWeightKg || 0)) {
          throw new BadRequestError('Insufficient capacity for requested weight');
        }
      } else if (shipmentSlot.pricingModel === 'PER_ITEM') {
        if (lockedSlot.remainingCapacityItems === null || lockedSlot.remainingCapacityItems < (dto.requestedItemsCount || 0)) {
          throw new BadRequestError('Insufficient capacity for requested items');
        }
      }

      // Create booking
      const bookingData: CreateBookingData = {
        shipmentSlotId: dto.shipmentSlotId,
        customerId,
        companyId: shipmentSlot.companyId,
        requestedWeightKg: dto.requestedWeightKg || null,
        requestedItemsCount: dto.requestedItemsCount || null,
        calculatedPrice: new Decimal(calculatedPrice),
        notes: dto.notes || null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      };

      const newBooking = await tx.booking.create({
        data: bookingData,
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
        },
      });

      // Update capacity (reserve the space)
      const updates: any = {};
      if (dto.requestedWeightKg && lockedSlot.remainingCapacityKg !== null) {
        updates.remainingCapacityKg = {
          decrement: dto.requestedWeightKg,
        };
      }
      if (dto.requestedItemsCount && lockedSlot.remainingCapacityItems !== null) {
        updates.remainingCapacityItems = {
          decrement: dto.requestedItemsCount,
        };
      }

      await tx.shipmentSlot.update({
        where: { id: dto.shipmentSlotId },
        data: updates,
      });

      return newBooking;
    });

    // Check if this is the customer's first booking and mark onboarding step
    const existingBookings = await bookingRepository.countByCustomer(req.user.id);
    if (existingBookings === 1) {
      // This is the first booking, mark onboarding step as complete
      await onboardingRepository.updateUserOnboardingStep(
        req.user.id,
        'first_booking',
        true
      ).catch((err) => {
        // Don't fail the booking creation if onboarding update fails
        console.error('Failed to update onboarding step:', err);
      });
    }

    // Notify company about new booking
    await createCompanyNotification(
      booking.companyId,
      'BOOKING_CREATED',
      'New Booking Received',
      `A new booking has been received from ${booking.customer.fullName} for ${booking.shipmentSlot.originCity} to ${booking.shipmentSlot.destinationCity}`,
      {
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.customer.fullName,
        shipmentSlotId: booking.shipmentSlotId,
      }
    ).catch((err) => {
      console.error('Failed to create notification:', err);
    });

    return booking;
  },

  async getMyBookings(req: AuthRequest, query: any) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    if (req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can view their bookings');
    }

    const pagination = parsePagination(query);
    const status = query.status as any;

    const { bookings, total } = await bookingRepository.findByCustomer(
      req.user.id,
      { ...pagination, status }
    );

    return createPaginatedResponse(bookings, total, pagination);
  },

  async getCompanyBookings(req: AuthRequest, query: any) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const pagination = parsePagination(query);
    const status = query.status as any;
    const search = query.search as string | undefined;

    const { bookings, total } = await bookingRepository.findByCompany(
      req.user.companyId,
      { ...pagination, status, search }
    );

    return createPaginatedResponse(bookings, total, pagination);
  },

  async updateBookingStatus(req: AuthRequest, id: string, dto: UpdateBookingStatusDto) {
    // Get booking
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId === req.user.companyId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to update this booking');
    }

    // Only company can accept/reject bookings
    if (['ACCEPTED', 'REJECTED', 'IN_TRANSIT', 'DELIVERED'].includes(dto.status)) {
      if (!isCompanyOwner && !isSuperAdmin) {
        throw new ForbiddenError('Only the company can update booking to this status');
      }
    }

    const updatedBooking = await bookingRepository.updateStatus(id, dto.status);

    // Get shipment slot details for notifications
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
      select: {
        originCity: true,
        destinationCity: true,
      },
    });

    // Create notifications based on status change
    const statusMessages: Record<string, { type: any; title: string; body: string }> = {
      ACCEPTED: {
        type: 'BOOKING_ACCEPTED',
        title: 'Booking Accepted',
        body: `Your booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been accepted`,
      },
      REJECTED: {
        type: 'BOOKING_REJECTED',
        title: 'Booking Rejected',
        body: `Your booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been rejected`,
      },
      IN_TRANSIT: {
        type: 'BOOKING_IN_TRANSIT',
        title: 'Shipment In Transit',
        body: `Your shipment from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} is now in transit`,
      },
      DELIVERED: {
        type: 'BOOKING_DELIVERED',
        title: 'Shipment Delivered',
        body: `Your shipment from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been delivered`,
      },
      CANCELLED: {
        type: 'BOOKING_CANCELLED',
        title: 'Booking Cancelled',
        body: `The booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been cancelled`,
      },
    };

    const statusInfo = statusMessages[dto.status];
    if (statusInfo) {
      // Notify customer
      await createNotification({
        userId: booking.customerId,
        type: statusInfo.type,
        title: statusInfo.title,
        body: statusInfo.body,
        metadata: {
          bookingId: booking.id,
          shipmentSlotId: booking.shipmentSlotId,
          status: dto.status,
        },
      }).catch((err) => {
        console.error('Failed to create customer notification:', err);
      });

      // Notify company (for status changes that affect company)
      if (['IN_TRANSIT', 'DELIVERED'].includes(dto.status)) {
        await createCompanyNotification(
          booking.companyId,
          statusInfo.type,
          statusInfo.title,
          `Booking ${booking.id} status updated to ${dto.status}`,
          {
            bookingId: booking.id,
            customerId: booking.customerId,
            shipmentSlotId: booking.shipmentSlotId,
            status: dto.status,
          }
        ).catch((err) => {
          console.error('Failed to create company notification:', err);
        });
      }

      // Send booking confirmation email when booking is accepted
      if (dto.status === 'ACCEPTED') {
        // Get full booking details for email
        const bookingForEmail = await prisma.booking.findUnique({
          where: { id: booking.id },
          include: {
            customer: {
              select: {
                email: true,
                fullName: true,
                notificationEmail: true,
              },
            },
            shipmentSlot: {
              select: {
                originCity: true,
                originCountry: true,
                destinationCity: true,
                destinationCountry: true,
                departureTime: true,
                arrivalTime: true,
                mode: true,
              },
            },
            company: {
              select: {
                name: true,
                contactEmail: true,
                contactPhone: true,
              },
            },
          },
        });

        if (bookingForEmail && bookingForEmail.customer.notificationEmail) {
          await emailService.sendBookingConfirmationEmail(
            bookingForEmail.customer.email,
            bookingForEmail.customer.fullName,
            booking.id,
            {
              originCity: bookingForEmail.shipmentSlot.originCity,
              originCountry: bookingForEmail.shipmentSlot.originCountry,
              destinationCity: bookingForEmail.shipmentSlot.destinationCity,
              destinationCountry: bookingForEmail.shipmentSlot.destinationCountry,
              departureTime: bookingForEmail.shipmentSlot.departureTime,
              arrivalTime: bookingForEmail.shipmentSlot.arrivalTime,
              mode: bookingForEmail.shipmentSlot.mode,
              price: Number(bookingForEmail.calculatedPrice),
              currency: 'gbp',
            },
            bookingForEmail.company.name,
            bookingForEmail.company.contactEmail || undefined,
            bookingForEmail.company.contactPhone || undefined
          ).catch((err) => {
            console.error('Failed to send booking confirmation email:', err);
          });
        }
      }
    }

    return updatedBooking;
  },

  async getBookingById(req: AuthRequest, id: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify access
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId === req.user.companyId;
    const isCustomer = booking.customerId === req.user.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isCustomer && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to view this booking');
    }

    return booking;
  },

  async acceptBooking(req: AuthRequest, id: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!req.user || booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to accept this booking');
    }

    if (booking.status !== 'PENDING') {
      throw new BadRequestError('Only pending bookings can be accepted');
    }

    return bookingRepository.updateStatus(id, 'ACCEPTED');
  },

  async rejectBooking(req: AuthRequest, id: string, reason: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!req.user || booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to reject this booking');
    }

    if (booking.status !== 'PENDING') {
      throw new BadRequestError('Only pending bookings can be rejected');
    }

    // Update booking status and add rejection reason to notes
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: reason,
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

    // Get shipment slot to check capacity
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
    });

    if (!shipmentSlot) {
      throw new NotFoundError('Shipment slot not found');
    }

    // Release capacity back to shipment slot
    if (booking.requestedWeightKg && shipmentSlot.remainingCapacityKg !== null) {
      await prisma.shipmentSlot.update({
        where: { id: booking.shipmentSlotId },
        data: {
          remainingCapacityKg: {
            increment: booking.requestedWeightKg,
          },
        },
      });
    }

    if (booking.requestedItemsCount && shipmentSlot.remainingCapacityItems !== null) {
      await prisma.shipmentSlot.update({
        where: { id: booking.shipmentSlotId },
        data: {
          remainingCapacityItems: {
            increment: booking.requestedItemsCount,
          },
        },
      });
    }

    // Notify customer about rejection
    await createNotification({
      userId: booking.customerId,
      type: 'BOOKING_REJECTED',
      title: 'Booking Rejected',
      body: `Your booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been rejected. ${reason ? `Reason: ${reason}` : ''}`,
      metadata: {
        bookingId: booking.id,
        shipmentSlotId: booking.shipmentSlotId,
        reason,
      },
    }).catch((err) => {
      console.error('Failed to create notification:', err);
    });

    return updatedBooking;
  },

  async getBookingStats(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const companyId = req.user.companyId;

    const [total, pending, accepted, rejected, revenueData] = await Promise.all([
      prisma.booking.count({ where: { companyId } }),
      prisma.booking.count({ where: { companyId, status: 'PENDING' } }),
      prisma.booking.count({ where: { companyId, status: 'ACCEPTED' } }),
      prisma.booking.count({ where: { companyId, status: 'REJECTED' } }),
      prisma.booking.aggregate({
        where: {
          companyId,
          status: 'ACCEPTED',
          paymentStatus: 'PAID',
        },
        _sum: {
          calculatedPrice: true,
        },
      }),
    ]);

    return {
      total,
      pending,
      accepted,
      rejected,
      revenue: Number(revenueData._sum.calculatedPrice || 0),
    };
  },
};

