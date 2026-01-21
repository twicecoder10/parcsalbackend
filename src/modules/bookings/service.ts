import { bookingRepository, CreateBookingData } from './repository';
import { CreateBookingDto, UpdateBookingStatusDto, AddProofImagesDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import prisma from '../../config/database';
import { Decimal } from '@prisma/client/runtime/library';
import { onboardingRepository } from '../onboarding/repository';
import { createNotification, createCompanyNotification } from '../../utils/notifications';
import {
  queueBookingConfirmationEmail,
  queueBookingCancelledEmail,
  queueBookingDeliveredEmail,
  queueBookingRejectionEmail,
} from '../email/queue';
import Stripe from 'stripe';
import { config } from '../../config/env';
import { checkStaffPermission } from '../../utils/permissions';
import { generateBookingId } from '../../utils/bookingId';
import { deleteImagesByUrls } from '../../utils/upload';
import { generateShippingLabel } from '../../utils/labelGenerator';
import { calculateBookingCharges } from '../../utils/paymentCalculator';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

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

    // Only allow bookings for verified companies
    if (!shipmentSlot.company.isVerified) {
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

    // Validate warehouse addresses belong to the company
    if (dto.pickupWarehouseId) {
      const pickupWarehouse = await prisma.warehouseAddress.findUnique({
        where: { id: dto.pickupWarehouseId },
      });
      if (!pickupWarehouse || pickupWarehouse.companyId !== shipmentSlot.companyId) {
        throw new BadRequestError('Pickup warehouse address does not belong to this company');
      }
    }

    if (dto.deliveryWarehouseId) {
      const deliveryWarehouse = await prisma.warehouseAddress.findUnique({
        where: { id: dto.deliveryWarehouseId },
      });
      if (!deliveryWarehouse || deliveryWarehouse.companyId !== shipmentSlot.companyId) {
        throw new BadRequestError('Delivery warehouse address does not belong to this company');
      }
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
    const booking = await prisma.$transaction(async (tx): Promise<any> => {
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

      // Generate custom booking ID within transaction for consistency
      const bookingId = await generateBookingId(tx);
      
      // Get company name to preserve it in booking (in case company is deleted later)
      const company = await tx.company.findUnique({
        where: { id: shipmentSlot.companyId },
        select: { name: true },
      });

      // Create booking
      const bookingData: CreateBookingData = {
        id: bookingId,
        shipmentSlotId: dto.shipmentSlotId,
        customerId,
        companyId: shipmentSlot.companyId,
        companyName: company?.name || null, // Preserve company name for customer reference
        requestedWeightKg: dto.requestedWeightKg || null,
        requestedItemsCount: dto.requestedItemsCount || null,
        calculatedPrice: new Decimal(calculatedPrice),
        notes: dto.notes || null,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        // New parcel information fields
        parcelType: dto.parcelType || null,
        weight: dto.weight || null,
        value: dto.value ? new Decimal(dto.value) : null,
        length: dto.length || null,
        width: dto.width || null,
        height: dto.height || null,
        description: dto.description || null,
        images: dto.images || [],
        pickupMethod: dto.pickupMethod,
        deliveryMethod: dto.deliveryMethod,
        // Address fields
        pickupAddress: dto.pickupAddress || null,
        pickupCity: dto.pickupCity || null,
        pickupState: dto.pickupState || null,
        pickupCountry: dto.pickupCountry || null,
        pickupPostalCode: dto.pickupPostalCode || null,
        pickupContactName: dto.pickupContactName || null,
        pickupContactPhone: dto.pickupContactPhone || null,
        pickupWarehouseId: dto.pickupWarehouseId || null,
        deliveryAddress: dto.deliveryAddress || null,
        deliveryCity: dto.deliveryCity || null,
        deliveryState: dto.deliveryState || null,
        deliveryCountry: dto.deliveryCountry || null,
        deliveryPostalCode: dto.deliveryPostalCode || null,
        deliveryContactName: dto.deliveryContactName || null,
        deliveryContactPhone: dto.deliveryContactPhone || null,
        deliveryWarehouseId: dto.deliveryWarehouseId || null,
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
    // Fetch booking with relations for notification
    const bookingWithRelations = await prisma.booking.findUnique({
      where: { id: booking.id },
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
          },
        },
      },
    });
    
    if (bookingWithRelations?.customer && bookingWithRelations?.shipmentSlot && booking.companyId) {
      await createCompanyNotification(
        booking.companyId,
        'BOOKING_CREATED',
        'New Booking Received',
        `A new booking has been received from ${bookingWithRelations.customer.fullName} for ${bookingWithRelations.shipmentSlot.originCity} to ${bookingWithRelations.shipmentSlot.destinationCity}`,
        {
          bookingId: booking.id,
          customerId: booking.customerId,
          customerName: bookingWithRelations.customer.fullName,
          shipmentSlotId: booking.shipmentSlotId,
        }
      ).catch((err) => {
        console.error('Failed to create notification:', err);
      });
    }

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
    const search = query.search as string | undefined;

    const { bookings, total } = await bookingRepository.findByCustomer(
      req.user.id,
      { ...pagination, status, search }
    );

    // Sanitize sensitive data for customer
    const sanitizedBookings = bookings.map(booking => this.sanitizeBookingForCustomer(booking));

    return createPaginatedResponse(sanitizedBookings, total, pagination);
  },

  async getCompanyBookings(req: AuthRequest, query: any) {
    // Check staff permission
    await checkStaffPermission(req, 'viewBookings');

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

    // Sanitize sensitive data for company users
    const sanitizedBookings = bookings.map(booking => this.sanitizeBookingForCompany(booking));

    return createPaginatedResponse(sanitizedBookings, total, pagination);
  },

  async updateBookingStatus(req: AuthRequest, id: string, dto: UpdateBookingStatusDto) {
    // Check staff permission
    await checkStaffPermission(req, 'updateBookingStatus');

    // Get booking
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId !== null && booking.companyId === req.user.companyId;
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
      if (['IN_TRANSIT', 'DELIVERED'].includes(dto.status) && booking.companyId) {
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
                company: {
                  select: {
                    name: true,
                  },
                },
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
          await queueBookingConfirmationEmail({
            customerEmail: bookingForEmail.customer.email,
            customerName: bookingForEmail.customer.fullName,
            bookingId: booking.id,
            companyName: bookingForEmail.shipmentSlot.company?.name || bookingForEmail.company?.name || 'Company',
            originCity: bookingForEmail.shipmentSlot.originCity,
            destinationCity: bookingForEmail.shipmentSlot.destinationCity,
            departureTime: bookingForEmail.shipmentSlot.departureTime,
            price: Number(bookingForEmail.calculatedPrice),
          }).catch((err) => {
            console.error('Failed to queue booking confirmation email:', err);
          });
        }
      }

      // Send email when booking is cancelled
      if (dto.status === 'CANCELLED') {
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
                company: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            company: {
              select: {
                name: true,
              },
            },
          },
        });

        if (bookingForEmail && bookingForEmail.customer.notificationEmail) {
          await queueBookingCancelledEmail({
            customerEmail: bookingForEmail.customer.email,
            customerName: bookingForEmail.customer.fullName,
            bookingId: booking.id,
            companyName: bookingForEmail.shipmentSlot.company.name,
          }).catch((err) => {
            console.error('Failed to queue booking cancelled email:', err);
          });
        }
      }

      // Send email when booking is delivered
      if (dto.status === 'DELIVERED') {
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
                company: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            company: {
              select: {
                name: true,
              },
            },
          },
        });

        if (bookingForEmail && bookingForEmail.customer.notificationEmail) {
          await queueBookingDeliveredEmail({
            customerEmail: bookingForEmail.customer.email,
            customerName: bookingForEmail.customer.fullName,
            bookingId: booking.id,
            companyName: bookingForEmail.shipmentSlot.company.name,
          }).catch((err) => {
            console.error('Failed to queue booking delivered email:', err);
          });
        }
      }

      // Clean up images when booking is cancelled or rejected
      if (dto.status === 'CANCELLED' || dto.status === 'REJECTED') {
        const imagesToDelete: string[] = [
          ...(booking.images || []),
          ...(booking.pickupProofImages || []),
          ...(booking.deliveryProofImages || []),
        ];

        if (imagesToDelete.length > 0) {
          deleteImagesByUrls(imagesToDelete).catch((err) => {
            console.error(`Failed to cleanup images for ${dto.status.toLowerCase()} booking ${booking.id}:`, err);
          });
        }
      }
    }

    // Sanitize sensitive data for company users (but not super admins)
    return !isSuperAdmin 
      ? this.sanitizeBookingForCompany(updatedBooking)
      : updatedBooking;
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

    const isCompanyOwner = booking.companyId !== null && booking.companyId === req.user.companyId;
    const isCustomer = booking.customerId === req.user.id;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isCustomer && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to view this booking');
    }

    // Calculate price breakdown if not already stored (for pending bookings)
    // This ensures frontend always has fee breakdown before payment
    const bookingWithFees = booking as any;
    if (booking.paymentStatus === 'PENDING' && (!bookingWithFees.baseAmount || !bookingWithFees.totalAmount)) {
      // Get company for commission rate
      const company = booking.companyId
        ? await prisma.company.findUnique({
            where: { id: booking.companyId },
            select: { plan: true, commissionRateBps: true },
          })
        : null;

      // Calculate fees - adminFeeAmount is ALWAYS 15% (charged to customer)
      // This is separate from commission (which is only deducted from FREE plan companies)
      const baseAmountMinor = Math.round(Number(booking.calculatedPrice) * 100);
      const ADMIN_FEE_BPS = 1500; // Always 15% admin fee charged to customer
      const charges = calculateBookingCharges(baseAmountMinor, ADMIN_FEE_BPS);
      
      // Calculate commission amount deducted from company payout
      const companyPlan = company?.plan || 'FREE';
      const commissionAmount = companyPlan === 'FREE' ? charges.adminFeeAmount : 0;
      
      // Add calculated fees to booking object for response
      bookingWithFees.baseAmount = charges.baseAmount;
      bookingWithFees.adminFeeAmount = charges.adminFeeAmount;
      bookingWithFees.processingFeeAmount = charges.processingFeeAmount;
      bookingWithFees.totalAmount = charges.totalAmount;
      bookingWithFees.commissionAmount = commissionAmount;
    }

    // Filter sensitive data for customers
    if (isCustomer && !isCompanyOwner && !isSuperAdmin) {
      return this.sanitizeBookingForCustomer(booking);
    }

    // Filter sensitive data for company users (but not super admins)
    if (isCompanyOwner && !isSuperAdmin) {
      return this.sanitizeBookingForCompany(booking);
    }

    return booking;
  },

  sanitizeBookingForCustomer(booking: any) {
    const sanitized = { ...booking };

    // Sanitize payment object - remove Stripe IDs
    if (sanitized.payment) {
      const { stripePaymentIntentId, stripeChargeId, ...paymentData } = sanitized.payment;
      sanitized.payment = paymentData;
    }

    // Sanitize company object - remove sensitive Stripe and internal data
    if (sanitized.company) {
      const {
        stripeAccountId,
        stripeOnboardingStatus,
        chargesEnabled,
        payoutsEnabled,
        adminId,
        activePlanId,
        planExpiresAt,
        onboardingSteps,
        contactPhone,
        contactEmail,
        ...companyData
      } = sanitized.company;
      sanitized.company = companyData;
    }

    // Sanitize company in shipmentSlot
    if (sanitized.shipmentSlot?.company) {
      const {
        stripeAccountId,
        stripeOnboardingStatus,
        chargesEnabled,
        payoutsEnabled,
        adminId,
        activePlanId,
        planExpiresAt,
        onboardingSteps,
        contactPhone,
        contactEmail,
        ...companyData
      } = sanitized.shipmentSlot.company;
      sanitized.shipmentSlot.company = companyData;
    }

    return sanitized;
  },

  sanitizeBookingForCompany(booking: any) {
    const sanitized = { ...booking };

    // Remove customer email (PII) - company doesn't need customer email
    if (sanitized.customer) {
      const { email, ...customerData } = sanitized.customer;
      sanitized.customer = customerData;
    }

    // Sanitize payment object - remove Stripe IDs (sensitive payment data)
    if (sanitized.payment) {
      const { stripePaymentIntentId, stripeChargeId, ...paymentData } = sanitized.payment;
      sanitized.payment = paymentData;
    }

    // Company can see their own company data, so no need to sanitize company object
    // But sanitize company in shipmentSlot if it's a different company (shouldn't happen, but safety)
    if (sanitized.shipmentSlot?.company && sanitized.shipmentSlot.company.id !== booking.companyId) {
      const {
        stripeAccountId,
        stripeOnboardingStatus,
        chargesEnabled,
        payoutsEnabled,
        adminId,
        activePlanId,
        planExpiresAt,
        onboardingSteps,
        contactPhone,
        contactEmail,
        ...companyData
      } = sanitized.shipmentSlot.company;
      sanitized.shipmentSlot.company = companyData;
    }

    return sanitized;
  },

  async acceptBooking(req: AuthRequest, id: string) {
    // Check staff permission
    await checkStaffPermission(req, 'acceptBooking');

    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!req.user || !booking.companyId || booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to accept this booking');
    }

    if (booking.status !== 'PENDING') {
      throw new BadRequestError('Only pending bookings can be accepted');
    }

    // Validate that payment status is PAID before accepting
    if (booking.paymentStatus !== 'PAID') {
      throw new BadRequestError('Cannot accept booking. Payment has not been completed by the customer.');
    }

    const updatedBooking = await bookingRepository.updateStatus(id, 'ACCEPTED');

    // Generate and upload shipping label
    // Note: Status is now ACCEPTED and payment is PAID (validated above), so label generation is safe
    try {
      // Get full booking details with all relations needed for label
      const bookingForLabel = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          shipmentSlot: true,
          customer: true,
          company: true,
          pickupWarehouse: true,
          deliveryWarehouse: true,
        },
      });

      if (bookingForLabel && bookingForLabel.company) {
        // Double-check status and payment before generating label
        if (bookingForLabel.status !== 'ACCEPTED' && bookingForLabel.status !== 'IN_TRANSIT' && bookingForLabel.status !== 'DELIVERED') {
          throw new BadRequestError('Cannot generate label for booking with status: ' + bookingForLabel.status);
        }
        if (bookingForLabel.paymentStatus !== 'PAID') {
          throw new BadRequestError('Cannot generate label. Payment has not been completed.');
        }
        
        const labelResult = await generateShippingLabel(bookingForLabel);
        await bookingRepository.updateLabelUrl(booking.id, labelResult.url);
      }
    } catch (labelError: any) {
      // Log error but don't fail the acceptance - label can be regenerated later
      console.error(`Failed to generate label for booking ${booking.id}:`, labelError);
    }

    // Get shipment slot details for email
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
      select: {
        originCity: true,
        originCountry: true,
        destinationCity: true,
        destinationCountry: true,
        departureTime: true,
        arrivalTime: true,
        mode: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    });

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
        company: {
          select: {
            name: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
    });

    // Send booking confirmation email
    if (bookingForEmail && bookingForEmail.customer.notificationEmail && shipmentSlot) {
      await queueBookingConfirmationEmail({
        customerEmail: bookingForEmail.customer.email,
        customerName: bookingForEmail.customer.fullName,
        bookingId: booking.id,
        companyName: shipmentSlot.company.name,
        originCity: shipmentSlot.originCity,
        destinationCity: shipmentSlot.destinationCity,
        departureTime: shipmentSlot.departureTime,
        price: Number(bookingForEmail.calculatedPrice),
      }).catch((err) => {
        console.error('Failed to queue booking confirmation email:', err);
      });
    }

    // Notify customer about acceptance
    await createNotification({
      userId: booking.customerId,
      type: 'BOOKING_ACCEPTED',
      title: 'Booking Accepted',
      body: `Your booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been accepted`,
      metadata: {
        bookingId: booking.id,
        shipmentSlotId: booking.shipmentSlotId,
        status: 'ACCEPTED',
      },
    }).catch((err) => {
      console.error('Failed to create customer notification:', err);
    });

    // Sanitize sensitive data for company users
    return this.sanitizeBookingForCompany(updatedBooking);
  },

  async rejectBooking(req: AuthRequest, id: string, reason: string) {
    // Check staff permission
    await checkStaffPermission(req, 'rejectBooking');

    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!req.user || !booking.companyId || booking.companyId !== req.user.companyId) {
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
      select: {
        remainingCapacityKg: true,
        remainingCapacityItems: true,
        originCity: true,
        destinationCity: true,
        company: {
          select: {
            name: true,
          },
        },
      },
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

    // Process refund if payment exists
    let refundProcessed = false;
    if (updatedBooking.payment && updatedBooking.payment.status === 'SUCCEEDED') {
      try {
        // Get Stripe charge ID from payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(
          updatedBooking.payment.stripePaymentIntentId
        );
        const chargeId = paymentIntent.latest_charge as string;

        if (chargeId) {
          const refundAmount = Number(updatedBooking.payment.amount);
          const refundAmountInCents = Math.round(refundAmount * 100);

          // Process full refund via Stripe
          await stripe.refunds.create({
            charge: chargeId,
            amount: refundAmountInCents,
            reason: 'requested_by_customer',
            metadata: {
              bookingId: booking.id,
              refundReason: `Booking rejected: ${reason || 'No reason provided'}`,
            },
          });

          // Update payment record
          await prisma.payment.update({
            where: { id: updatedBooking.payment.id },
            data: {
              status: 'REFUNDED',
              refundedAmount: refundAmount,
              refundReason: `Booking rejected: ${reason || 'No reason provided'}`,
              refundedAt: new Date(),
            },
          });

          // Update booking payment status
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: 'REFUNDED',
            },
          });

          refundProcessed = true;
          // Refund processed successfully - error handling will log if it fails
        }
      } catch (refundError: any) {
        console.error('Failed to process refund for rejected booking:', refundError);
        // Don't throw - we still want to reject the booking even if refund fails
        // The refund can be processed manually later
      }
    }

    // Get customer details for email
    const customer = await prisma.user.findUnique({
      where: { id: booking.customerId },
      select: {
        email: true,
        fullName: true,
        notificationEmail: true,
      },
    });

    // Send rejection email if customer has email notifications enabled
    if (customer && customer.notificationEmail && shipmentSlot) {
      await queueBookingRejectionEmail({
        customerEmail: customer.email,
        customerName: customer.fullName,
        bookingId: booking.id,
        companyName: shipmentSlot.company.name,
      }).catch((err) => {
        console.error('Failed to queue booking rejection email:', err);
      });
    }

    // Notify customer about rejection
    await createNotification({
      userId: booking.customerId,
      type: 'BOOKING_REJECTED',
      title: 'Booking Rejected',
      body: `Your booking from ${shipmentSlot?.originCity || 'origin'} to ${shipmentSlot?.destinationCity || 'destination'} has been rejected. ${reason ? `Reason: ${reason}` : ''}${refundProcessed ? ' A refund has been processed for your payment.' : ''}`,
      metadata: {
        bookingId: booking.id,
        shipmentSlotId: booking.shipmentSlotId,
        reason,
        refunded: refundProcessed,
      },
    }).catch((err) => {
      console.error('Failed to create notification:', err);
    });

    // Clean up booking images (parcel images, pickup proof, delivery proof)
    const imagesToDelete: string[] = [
      ...(booking.images || []),
      ...(booking.pickupProofImages || []),
      ...(booking.deliveryProofImages || []),
    ];

    if (imagesToDelete.length > 0) {
      deleteImagesByUrls(imagesToDelete).catch((err) => {
        console.error(`Failed to cleanup images for rejected booking ${booking.id}:`, err);
      });
    }

    // Sanitize sensitive data for company users
    return this.sanitizeBookingForCompany(updatedBooking);
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

  async addProofImages(req: AuthRequest, id: string, dto: AddProofImagesDto) {
    // Check staff permission
    await checkStaffPermission(req, 'addProofImages');

    // Get booking - verify it exists first
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify booking is in a state that allows adding proof images
    // Proof images should only be added to accepted or in-transit bookings
    if (booking.status === 'REJECTED' || booking.status === 'CANCELLED') {
      throw new BadRequestError('Cannot add proof images to a rejected or cancelled booking');
    }

    // Verify ownership - only company can add proof images
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId !== null && booking.companyId === req.user.companyId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to add proof images to this booking');
    }

    // Validate at least one proof image array is provided
    if ((!dto.pickupProofImages || dto.pickupProofImages.length === 0) &&
        (!dto.deliveryProofImages || dto.deliveryProofImages.length === 0)) {
      throw new BadRequestError('At least one proof image is required');
    }

    const updatedBooking = await bookingRepository.addProofImages(
      id,
      dto.pickupProofImages || [],
      dto.deliveryProofImages || []
    );

    // Sanitize sensitive data for company users (but not super admins)
    return !isSuperAdmin 
      ? this.sanitizeBookingForCompany(updatedBooking)
      : updatedBooking;
  },

  async getBookingLabel(req: AuthRequest, id: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership - only company can access labels
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId !== null && booking.companyId === req.user.companyId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to access this booking label');
    }

    // Validate booking status - cannot access labels for pending, rejected, or cancelled bookings
    if (booking.status === 'PENDING' || booking.status === 'REJECTED' || booking.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot access label for booking with status: ${booking.status}`);
    }

    // Validate payment status - payment must be completed
    if (booking.paymentStatus !== 'PAID') {
      throw new BadRequestError('Cannot access label. Payment has not been completed.');
    }

    if (!booking.labelUrl) {
      throw new BadRequestError('Label has not been generated for this booking yet');
    }

    return {
      labelUrl: booking.labelUrl,
      bookingId: booking.id,
    };
  },

  async regenerateBookingLabel(req: AuthRequest, id: string) {
    // Check staff permission
    await checkStaffPermission(req, 'regenerateLabel');

    const booking = await bookingRepository.findById(id);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership - only company can regenerate labels
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const isCompanyOwner = booking.companyId !== null && booking.companyId === req.user.companyId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCompanyOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to regenerate this booking label');
    }

    // Validate booking status - cannot generate labels for pending, rejected, or cancelled bookings
    if (booking.status === 'PENDING' || booking.status === 'REJECTED' || booking.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot generate label for booking with status: ${booking.status}`);
    }

    // Validate payment status - payment must be completed
    if (booking.paymentStatus !== 'PAID') {
      throw new BadRequestError('Cannot generate label. Payment has not been completed.');
    }

    // Get full booking details with all relations needed for label
    const bookingForLabel = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        shipmentSlot: true,
        customer: true,
        company: true,
        pickupWarehouse: true,
        deliveryWarehouse: true,
      },
    });

    if (!bookingForLabel) {
      throw new NotFoundError('Booking not found');
    }

    if (!bookingForLabel.company) {
      throw new BadRequestError('Cannot generate label for booking with deleted company');
    }

    const labelResult = await generateShippingLabel(bookingForLabel);
    const updatedBooking = await bookingRepository.updateLabelUrl(booking.id, labelResult.url);

    // Sanitize sensitive data for company users (but not super admins)
    return !isSuperAdmin
      ? this.sanitizeBookingForCompany(updatedBooking)
      : updatedBooking;
  },

  async scanBarcode(req: AuthRequest, barcode: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // The barcode contains the booking ID
    const bookingId = barcode.trim();

    // Validate booking ID format (should match booking ID pattern)
    if (!bookingId || bookingId.length === 0) {
      throw new BadRequestError('Invalid barcode: empty or invalid format');
    }

    // Find booking by ID
    const booking = await bookingRepository.findById(bookingId);
    
    if (!booking) {
      throw new NotFoundError('Booking not found. Please check the barcode and try again.');
    }

    // Verify the booking belongs to the company
    if (!booking.companyId || booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('This booking does not belong to your company');
    }

    // Return booking with full details
    return booking;
  },
};

