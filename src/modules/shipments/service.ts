import { shipmentRepository, CreateShipmentData, UpdateShipmentData, SearchFilters } from './repository';
import { CreateShipmentDto, UpdateShipmentDto, UpdateShipmentStatusDto, UpdateShipmentTrackingStatusDto, SearchShipmentsDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import prisma from '../../config/database';
import { onboardingRepository } from '../onboarding/repository';
import { bookingRepository } from '../bookings/repository';
import { BookingStatus, BookingTrackingStatus, SlotTrackingStatus } from '@prisma/client';
import { createShipmentCustomerNotifications } from '../../utils/notifications';
import { emailService } from '../../config/email';
import { checkStaffPermission } from '../../utils/permissions';
import { getMaxShipmentsPerMonth } from '../billing/planConfig';
import { ensureCurrentUsagePeriod, getCompanyUsage, incrementShipmentsCreated } from '../billing/usage';
import { captureEvent } from '../../lib/posthog';

const slotTrackingToBookingTracking: Partial<
  Record<
    SlotTrackingStatus,
    { status: BookingTrackingStatus; eligibleStatuses: BookingTrackingStatus[] }
  >
> = {
  IN_TRANSIT: {
    status: 'IN_TRANSIT',
    eligibleStatuses: ['BOOKED', 'ITEM_RECEIVED', 'PACKED', 'READY_FOR_DISPATCH'],
  },
  ARRIVED_AT_DESTINATION: {
    status: 'ARRIVED_AT_DESTINATION',
    eligibleStatuses: ['IN_TRANSIT'],
  },
  DELAYED: {
    status: 'DELAYED',
    eligibleStatuses: [
      'BOOKED',
      'ITEM_RECEIVED',
      'PACKED',
      'READY_FOR_DISPATCH',
      'IN_TRANSIT',
      'ARRIVED_AT_DESTINATION',
      'OUT_FOR_DELIVERY',
    ],
  },
  DELIVERED: {
    status: 'DELIVERED',
    eligibleStatuses: ['OUT_FOR_DELIVERY', 'IN_TRANSIT'],
  },
};

async function appendBookingTrackingEventsFromSlot(
  shipmentSlotId: string,
  trackingStatus: SlotTrackingStatus,
  createdById?: string | null
) {
  const mapping = slotTrackingToBookingTracking[trackingStatus];
  if (!mapping) {
    return;
  }

  // Exclude bookings in final states - never update tracking for final bookings
  const finalStates: BookingStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

  const bookings = await prisma.booking.findMany({
    where: {
      shipmentSlotId,
      trackingStatus: { in: mapping.eligibleStatuses },
      // Exclude bookings in final states
      status: {
        notIn: finalStates,
      },
    },
    select: {
      id: true,
    },
  });

  await Promise.allSettled(
    bookings.map((booking) =>
      prisma.$transaction(async (tx) => {
        const event = await tx.bookingTrackingEvent.create({
          data: {
            bookingId: booking.id,
            status: mapping.status,
            note: `Auto-updated from shipment slot tracking: ${trackingStatus}`,
            createdById: createdById || null,
          },
        });

        await tx.booking.update({
          where: { id: booking.id },
          data: {
            trackingStatus: mapping.status,
            trackingUpdatedAt: event.createdAt,
          },
        });
      })
    )
  );
}

export const shipmentService = {
  async createShipment(req: AuthRequest, dto: CreateShipmentDto) {
    // Check staff permission
    await checkStaffPermission(req, 'createShipment');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check plan limits
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      include: { activePlan: true },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Optional: Check if company is verified (uncomment if you want to enforce verification)
    // if (!company.isVerified) {
    //   throw new BadRequestError('Company must be verified to create shipment slots');
    // }

    // Enforce monthly shipment creation limit
    await ensureCurrentUsagePeriod(company.id);
    const usage = await getCompanyUsage(company.id);
    const maxShipments = getMaxShipmentsPerMonth(company);
    
    if (usage && maxShipments !== Infinity && usage.shipmentsCreated >= maxShipments) {
      captureEvent({
        distinctId: req.user.id || company.id,
        event: 'limit_reached_shipment',
        properties: {
          companyId: company.id,
          plan: company.plan,
          corridor: `${dto.originCity} -> ${dto.destinationCity}`,
          isFreePlanCommissionApplied: company.plan === 'FREE',
          limitType: 'monthly_shipments',
        },
      });
      throw new ForbiddenError(
        `You've reached your monthly shipment limit. Upgrade to Starter or Professional to remove limits and pay 0% commission.`
      );
    }

    if (company.activePlan) {
      const activeCount = await shipmentRepository.countActiveByCompany(req.user.companyId);
      const maxSlots = company.activePlan.maxActiveShipmentSlots;

      if (maxSlots !== null && activeCount >= maxSlots) {
        captureEvent({
          distinctId: req.user.id || company.id,
          event: 'limit_reached_shipment',
          properties: {
            companyId: company.id,
            plan: company.plan,
            corridor: `${dto.originCity} -> ${dto.destinationCity}`,
            isFreePlanCommissionApplied: company.plan === 'FREE',
            limitType: 'active_slots',
          },
        });
        throw new BadRequestError(
          `Plan limit reached. Maximum ${maxSlots} active shipment slots allowed.`
        );
      }
    }

    // Determine final status - check warehouses if trying to publish
    let finalStatus = dto.status || 'DRAFT';
    
    // If trying to publish, validate warehouses exist
    if (finalStatus === 'PUBLISHED') {
      const warehouses = await prisma.warehouseAddress.findMany({
        where: { companyId: req.user.companyId },
        select: { country: true },
      });

      const warehouseCountries = new Set(warehouses.map(w => w.country));

      if (!warehouseCountries.has(dto.originCountry)) {
        // Automatically set to DRAFT if warehouse is missing
        finalStatus = 'DRAFT';
      } else if (!warehouseCountries.has(dto.destinationCountry)) {
        // Automatically set to DRAFT if warehouse is missing
        finalStatus = 'DRAFT';
      }
    }
    // If status is DRAFT, allow creation without warehouse validation

    // Validate pricing model matches provided prices
    if (dto.pricingModel === 'FLAT' && !dto.flatPrice) {
      throw new BadRequestError('Flat price is required for FLAT pricing model');
    }
    if (dto.pricingModel === 'PER_KG' && !dto.pricePerKg) {
      throw new BadRequestError('Price per kg is required for PER_KG pricing model');
    }
    if (dto.pricingModel === 'PER_ITEM' && !dto.pricePerItem) {
      throw new BadRequestError('Price per item is required for PER_ITEM pricing model');
    }

    // Validate dates
    const departureTime = new Date(dto.departureTime);
    const arrivalTime = new Date(dto.arrivalTime);
    const cutoffTime = new Date(dto.cutoffTimeForReceivingItems);

    if (departureTime >= arrivalTime) {
      throw new BadRequestError('Departure time must be before arrival time');
    }

    if (cutoffTime > departureTime) {
      throw new BadRequestError('Cutoff time for receiving items must be before or equal to departure time');
    }

    // Validate capacity matches pricing model
    if (dto.pricingModel === 'PER_KG' && !dto.totalCapacityKg) {
      throw new BadRequestError('totalCapacityKg is required for PER_KG pricing model');
    }
    if (dto.pricingModel === 'PER_ITEM' && !dto.totalCapacityItems) {
      throw new BadRequestError('totalCapacityItems is required for PER_ITEM pricing model');
    }
    // For FLAT pricing, at least one capacity field must be present
    if (dto.pricingModel === 'FLAT' && !dto.totalCapacityKg && !dto.totalCapacityItems) {
      throw new BadRequestError('At least one of totalCapacityKg or totalCapacityItems must be provided for FLAT pricing model');
    }

    // Initialize remaining capacity with total capacity
    const createData: CreateShipmentData = {
      companyId: req.user.companyId,
      originCountry: dto.originCountry,
      originCity: dto.originCity,
      destinationCountry: dto.destinationCountry,
      destinationCity: dto.destinationCity,
      departureTime: new Date(dto.departureTime),
      arrivalTime: new Date(dto.arrivalTime),
      mode: dto.mode,
      totalCapacityKg: dto.totalCapacityKg,
      totalCapacityItems: dto.totalCapacityItems,
      remainingCapacityKg: dto.totalCapacityKg,
      remainingCapacityItems: dto.totalCapacityItems,
      pricingModel: dto.pricingModel,
      pricePerKg: dto.pricePerKg,
      pricePerItem: dto.pricePerItem,
      flatPrice: dto.flatPrice,
      cutoffTimeForReceivingItems: new Date(dto.cutoffTimeForReceivingItems),
      status: finalStatus,
    };

    // Check if this is the company's first shipment slot (before creating)
    const existingCount = await shipmentRepository.countActiveByCompany(req.user.companyId);
    const isFirstShipment = existingCount === 0;

    const shipment = await shipmentRepository.create(createData);

    // Increment shipment creation count
    await incrementShipmentsCreated(company.id, 1).catch((err) => {
      // Log error but don't fail shipment creation
      console.error('Failed to increment shipment creation count:', err);
    });

    const pricingAmount =
      shipment.pricingModel === 'FLAT'
        ? shipment.flatPrice
        : shipment.pricingModel === 'PER_KG'
          ? shipment.pricePerKg
          : shipment.pricePerItem;
    const amount = pricingAmount !== null && pricingAmount !== undefined ? Number(pricingAmount) : null;
    const corridor = `${shipment.originCity} -> ${shipment.destinationCity}`;

    captureEvent({
      distinctId: req.user.id || company.id,
      event: 'shipment_created',
      properties: {
        companyId: company.id,
        plan: company.plan,
        shipmentId: shipment.id,
        amount,
        corridor,
        isFreePlanCommissionApplied: company.plan === 'FREE',
      },
    });

    if (shipment.status === 'PUBLISHED') {
      captureEvent({
        distinctId: req.user.id || company.id,
        event: 'shipment_published',
        properties: {
          companyId: company.id,
          plan: company.plan,
          shipmentId: shipment.id,
          amount,
          corridor,
          isFreePlanCommissionApplied: company.plan === 'FREE',
        },
      });
    }

    // Mark onboarding step as complete if this is the first shipment
    if (isFirstShipment) {
      await onboardingRepository.updateCompanyOnboardingStep(
        req.user.companyId,
        'first_shipment_slot',
        true
      ).catch((err) => {
        // Don't fail the shipment creation if onboarding update fails
        console.error('Failed to update onboarding step:', err);
      });
    }

    return shipment;
  },

  async getMyShipments(req: AuthRequest, query: any) {
    // Check staff permission
    await checkStaffPermission(req, 'viewShipments');

    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const pagination = parsePagination(query);
    const status = query.status as any;
    const mode = query.mode as any;
    const search = query.search as string | undefined;

    const { shipments, total } = await shipmentRepository.findByCompany(
      req.user.companyId,
      { ...pagination, status, mode, search }
    );

    return createPaginatedResponse(shipments, total, pagination);
  },

  async updateShipment(req: AuthRequest, id: string, dto: UpdateShipmentDto) {
    // Check staff permission
    await checkStaffPermission(req, 'updateShipment');

    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
    }

    // Validate warehouses if updating countries on a PUBLISHED shipment
    const originCountry = dto.originCountry !== undefined ? dto.originCountry : shipment.originCountry;
    const destinationCountry = dto.destinationCountry !== undefined ? dto.destinationCountry : shipment.destinationCountry;

    if (shipment.status === 'PUBLISHED' && (dto.originCountry !== undefined || dto.destinationCountry !== undefined)) {
      const warehouses = await prisma.warehouseAddress.findMany({
        where: { companyId: shipment.companyId },
        select: { country: true },
      });

      const warehouseCountries = new Set(warehouses.map(w => w.country));

      if (!warehouseCountries.has(originCountry)) {
        throw new BadRequestError(
          `Cannot update published shipment slot. You must have at least one warehouse in ${originCountry} (origin country).`
        );
      }

      if (!warehouseCountries.has(destinationCountry)) {
        throw new BadRequestError(
          `Cannot update published shipment slot. You must have at least one warehouse in ${destinationCountry} (destination country).`
        );
      }
    }

    // Determine the pricing model after update (use new value if provided, otherwise existing)
    const pricingModel = dto.pricingModel !== undefined ? dto.pricingModel : shipment.pricingModel;
    
    // Validate capacity matches pricing model
    if (pricingModel === 'PER_KG') {
      const totalCapacityKg = dto.totalCapacityKg !== undefined ? dto.totalCapacityKg : shipment.totalCapacityKg;
      if (!totalCapacityKg) {
        throw new BadRequestError('totalCapacityKg is required for PER_KG pricing model');
      }
    }
    if (pricingModel === 'PER_ITEM') {
      const totalCapacityItems = dto.totalCapacityItems !== undefined ? dto.totalCapacityItems : shipment.totalCapacityItems;
      if (!totalCapacityItems) {
        throw new BadRequestError('totalCapacityItems is required for PER_ITEM pricing model');
      }
    }
    if (pricingModel === 'FLAT') {
      const totalCapacityKg = dto.totalCapacityKg !== undefined ? dto.totalCapacityKg : shipment.totalCapacityKg;
      const totalCapacityItems = dto.totalCapacityItems !== undefined ? dto.totalCapacityItems : shipment.totalCapacityItems;
      if (!totalCapacityKg && !totalCapacityItems) {
        throw new BadRequestError('At least one of totalCapacityKg or totalCapacityItems must be provided for FLAT pricing model');
      }
    }

    const updateData: UpdateShipmentData = {};
    if (dto.originCountry !== undefined) updateData.originCountry = dto.originCountry;
    if (dto.originCity !== undefined) updateData.originCity = dto.originCity;
    if (dto.destinationCountry !== undefined) updateData.destinationCountry = dto.destinationCountry;
    if (dto.destinationCity !== undefined) updateData.destinationCity = dto.destinationCity;
    if (dto.departureTime !== undefined) updateData.departureTime = new Date(dto.departureTime);
    if (dto.arrivalTime !== undefined) updateData.arrivalTime = new Date(dto.arrivalTime);
    if (dto.mode !== undefined) updateData.mode = dto.mode;
    if (dto.totalCapacityKg !== undefined) updateData.totalCapacityKg = dto.totalCapacityKg;
    if (dto.totalCapacityItems !== undefined) updateData.totalCapacityItems = dto.totalCapacityItems;
    if (dto.pricingModel !== undefined) updateData.pricingModel = dto.pricingModel;
    if (dto.pricePerKg !== undefined) updateData.pricePerKg = dto.pricePerKg;
    if (dto.pricePerItem !== undefined) updateData.pricePerItem = dto.pricePerItem;
    if (dto.flatPrice !== undefined) updateData.flatPrice = dto.flatPrice;
    if (dto.cutoffTimeForReceivingItems !== undefined) {
      updateData.cutoffTimeForReceivingItems = new Date(dto.cutoffTimeForReceivingItems);
    }

    return shipmentRepository.update(id, updateData);
  },

  async updateShipmentStatus(req: AuthRequest, id: string, dto: UpdateShipmentStatusDto) {
    // Check staff permission
    await checkStaffPermission(req, 'updateShipmentStatus');

    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
    }

    // Validate warehouses when trying to publish
    if (dto.status === 'PUBLISHED' && shipment.status !== 'PUBLISHED') {
      const warehouses = await prisma.warehouseAddress.findMany({
        where: { companyId: shipment.companyId },
        select: { country: true },
      });

      const warehouseCountries = new Set(warehouses.map(w => w.country));

      if (!warehouseCountries.has(shipment.originCountry)) {
        throw new BadRequestError(
          `Cannot publish shipment slot. You must have at least one warehouse in ${shipment.originCountry} (origin country).`
        );
      }

      if (!warehouseCountries.has(shipment.destinationCountry)) {
        throw new BadRequestError(
          `Cannot publish shipment slot. You must have at least one warehouse in ${shipment.destinationCountry} (destination country).`
        );
      }
    }

    // Check if there are any pending bookings when trying to change status
    // Companies must accept or reject all pending bookings before changing shipment status
    // Exception: CLOSED status is allowed as it will cancel pending bookings
    if (dto.status !== 'CLOSED' && shipment.status !== dto.status) {
      const pendingBookingsCount = await prisma.booking.count({
        where: {
          shipmentSlotId: id,
          status: 'PENDING',
        },
      });

      if (pendingBookingsCount > 0) {
        throw new BadRequestError(
          `Cannot update shipment status. There are ${pendingBookingsCount} pending booking(s). Please accept or reject all bookings first.`
        );
      }
    }

    const oldStatus = shipment.status;
    const updatedShipment = await shipmentRepository.updateStatus(id, dto.status);

    // Update bookings based on status change
    if (dto.status === 'CLOSED' || (oldStatus === 'PUBLISHED' && dto.status === 'DRAFT')) {
      // Cancel all PENDING bookings when slot is closed or moved back to draft
      await bookingRepository.updateStatusBySlot(
        id,
        'CANCELLED',
        ['PENDING']
      ).catch((err) => {
        console.error('Failed to update booking statuses:', err);
      });
    }

    // Notify customers when shipment is published
    if (dto.status === 'PUBLISHED') {
      await createShipmentCustomerNotifications(
        id,
        'SHIPMENT_PUBLISHED',
        'New Shipment Available',
        `A new shipment from ${shipment.originCity} to ${shipment.destinationCity} is now available`,
        {
          shipmentSlotId: id,
          originCity: shipment.originCity,
          destinationCity: shipment.destinationCity,
        }
      ).catch((err) => {
        console.error('Failed to create shipment published notifications:', err);
      });

      if (oldStatus !== 'PUBLISHED') {
        const companyPlan = await prisma.company.findUnique({
          where: { id: shipment.companyId },
          select: { plan: true },
        });
        const plan = companyPlan?.plan || 'FREE';
        const pricingAmount =
          shipment.pricingModel === 'FLAT'
            ? shipment.flatPrice
            : shipment.pricingModel === 'PER_KG'
              ? shipment.pricePerKg
              : shipment.pricePerItem;
        const amount = pricingAmount !== null && pricingAmount !== undefined ? Number(pricingAmount) : null;

        captureEvent({
          distinctId: req.user.id || shipment.companyId,
          event: 'shipment_published',
          properties: {
            companyId: shipment.companyId,
            plan,
            shipmentId: shipment.id,
            amount,
            corridor: `${shipment.originCity} -> ${shipment.destinationCity}`,
            isFreePlanCommissionApplied: plan === 'FREE',
          },
        });
      }
    }

    // Notify customers when shipment is closed
    if (dto.status === 'CLOSED') {
      await createShipmentCustomerNotifications(
        id,
        'SHIPMENT_CLOSED',
        'Shipment Closed',
        `The shipment from ${shipment.originCity} to ${shipment.destinationCity} has been closed`,
        {
          shipmentSlotId: id,
          originCity: shipment.originCity,
          destinationCity: shipment.destinationCity,
        }
      ).catch((err) => {
        console.error('Failed to create shipment closed notifications:', err);
      });
    }

    return updatedShipment;
  },

  async updateShipmentTrackingStatus(req: AuthRequest, id: string, dto: UpdateShipmentTrackingStatusDto) {
    // Check staff permission
    await checkStaffPermission(req, 'updateShipmentTrackingStatus');

    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
    }

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    // Check if updating to DELIVERED would affect bookings that are already in final states
    // This is a safety check - the actual update logic will exclude final states
    if (dto.trackingStatus === 'DELIVERED' && !isSuperAdmin) {
      const finalStateBookings = await prisma.booking.count({
        where: {
          shipmentSlotId: id,
          status: {
            in: ['DELIVERED', 'CANCELLED', 'REJECTED'],
          },
        },
      });

      if (finalStateBookings > 0) {
        // This is just a warning - we'll still proceed but only update eligible bookings
        console.warn(
          `Updating slot ${id} to DELIVERED: ${finalStateBookings} booking(s) in final states will be excluded from update`
        );
      }
    }

    // Update the slot's tracking status
    const updatedShipment = await shipmentRepository.updateTrackingStatus(id, dto.trackingStatus);

    // Cascade status updates to bookings based on tracking status
    let bookingStatusUpdate: BookingStatus | null = null;
    let filterStatuses: BookingStatus[] | undefined = undefined;

    switch (dto.trackingStatus) {
      case 'IN_TRANSIT':
        // Update all ACCEPTED bookings to IN_TRANSIT
        bookingStatusUpdate = 'IN_TRANSIT';
        filterStatuses = ['ACCEPTED'];
        break;
      case 'ARRIVED_AT_DESTINATION':
        // Update ACCEPTED bookings to IN_TRANSIT (in case they weren't updated when slot went IN_TRANSIT)
        // Keep IN_TRANSIT bookings as IN_TRANSIT (they're still in transit until delivered)
        bookingStatusUpdate = 'IN_TRANSIT';
        filterStatuses = ['ACCEPTED', 'IN_TRANSIT'];
        break;
      case 'DELAYED':
        // Update all active bookings to IN_TRANSIT when slot is delayed
        // This includes PENDING, ACCEPTED, and IN_TRANSIT bookings
        // We exclude CANCELLED, REJECTED, and DELIVERED (final states)
        bookingStatusUpdate = 'IN_TRANSIT';
        filterStatuses = ['PENDING', 'ACCEPTED', 'IN_TRANSIT'];
        break;
      case 'DELIVERED':
        // Update all IN_TRANSIT bookings to DELIVERED
        bookingStatusUpdate = 'DELIVERED';
        filterStatuses = ['IN_TRANSIT'];
        break;
      case 'PENDING':
        // Reset to PENDING - only update ACCEPTED bookings back to PENDING
        // This might be used if shipment is reset
        bookingStatusUpdate = 'PENDING';
        filterStatuses = ['ACCEPTED', 'IN_TRANSIT'];
        break;
    }

    // Update bookings if we have a status to apply
    if (bookingStatusUpdate) {
      try {
        await bookingRepository.updateStatusBySlot(id, bookingStatusUpdate, filterStatuses);
        // Bookings updated successfully - error handling will log if it fails
      } catch (error) {
        console.error(`Failed to update bookings for slot ${id}:`, error);
        // Don't throw - allow the tracking status update to succeed even if booking update fails
      }
    }

    // Append booking-level tracking events (do not overwrite booking status)
    appendBookingTrackingEventsFromSlot(id, dto.trackingStatus, req.user?.id).catch((error) => {
      console.error(`Failed to append booking tracking events for slot ${id}:`, error);
    });

    // Notify customers about tracking updates
    const trackingMessages: Record<string, { title: string; body: string }> = {
      IN_TRANSIT: {
        title: 'Shipment In Transit',
        body: `Your shipment from ${shipment.originCity} to ${shipment.destinationCity} is now in transit`,
      },
      ARRIVED_AT_DESTINATION: {
        title: 'Shipment Arrived',
        body: `Your shipment from ${shipment.originCity} to ${shipment.destinationCity} has arrived at the destination`,
      },
      DELAYED: {
        title: 'Shipment Delayed',
        body: `Your shipment from ${shipment.originCity} to ${shipment.destinationCity} has been delayed`,
      },
      DELIVERED: {
        title: 'Shipment Delivered',
        body: `Your shipment from ${shipment.originCity} to ${shipment.destinationCity} has been delivered`,
      },
    };

    const trackingInfo = trackingMessages[dto.trackingStatus];
    if (trackingInfo) {
      await createShipmentCustomerNotifications(
        id,
        'SHIPMENT_TRACKING_UPDATE',
        trackingInfo.title,
        trackingInfo.body,
        {
          shipmentSlotId: id,
          trackingStatus: dto.trackingStatus,
          originCity: shipment.originCity,
          destinationCity: shipment.destinationCity,
        }
      ).catch((err) => {
        console.error('Failed to create tracking update notifications:', err);
      });

      // Send emails for DELAYED status
      if (dto.trackingStatus === 'DELAYED') {
        // Get all bookings for this slot that are eligible for delay notification
        const bookings = await prisma.booking.findMany({
          where: {
            shipmentSlotId: id,
            status: {
              in: ['PENDING', 'ACCEPTED', 'IN_TRANSIT'],
            },
          },
          include: {
            customer: {
              select: {
                id: true,
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
              },
            },
          },
        });

        // Send delayed email to each customer
        await Promise.all(
          bookings.map(async (booking) => {
            if (booking.customer.notificationEmail) {
              try {
                await emailService.sendBookingDelayedEmail(
                  booking.customer.email,
                  booking.customer.fullName,
                  booking.id,
                  {
                    originCity: booking.shipmentSlot.originCity,
                    originCountry: booking.shipmentSlot.originCountry,
                    destinationCity: booking.shipmentSlot.destinationCity,
                    destinationCountry: booking.shipmentSlot.destinationCountry,
                    departureTime: booking.shipmentSlot.departureTime,
                    arrivalTime: booking.shipmentSlot.arrivalTime,
                    mode: booking.shipmentSlot.mode,
                    price: Number(booking.calculatedPrice),
                    currency: 'gbp',
                  },
                  booking.company?.name || booking.companyName || 'Company'
                );
              } catch (err) {
                console.error(`Failed to send delayed email for booking ${booking.id}:`, err);
              }
            }
          })
        );
      }

      // Send emails for DELIVERED status (when slot tracking is delivered, bookings are bulk updated)
      if (dto.trackingStatus === 'DELIVERED') {
        // Get all bookings that were just updated to DELIVERED
        // We need to get bookings that were IN_TRANSIT before the bulk update
        const bookings = await prisma.booking.findMany({
          where: {
            shipmentSlotId: id,
            status: 'DELIVERED',
          },
          include: {
            customer: {
              select: {
                id: true,
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

        // Send delivered email to each customer
        const { queueBookingDeliveredEmail } = await import('../email/queue');
        await Promise.all(
          bookings.map(async (booking) => {
            if (booking.customer.notificationEmail) {
              try {
                await queueBookingDeliveredEmail({
                  customerEmail: booking.customer.email,
                  customerName: booking.customer.fullName,
                  bookingId: booking.id,
                  companyName: booking.shipmentSlot.company?.name || booking.company?.name || 'Company',
                });
              } catch (err) {
                console.error(`Failed to send delivered email for booking ${booking.id}:`, err);
              }
            }
          })
        );
      }
    }

    return updatedShipment;
  },

  async searchShipments(query: SearchShipmentsDto) {
    const pagination = parsePagination(query);

    const filters: SearchFilters = {};
    if (query.originCountry) filters.originCountry = query.originCountry;
    if (query.originCity) filters.originCity = query.originCity;
    if (query.destinationCountry) filters.destinationCountry = query.destinationCountry;
    if (query.destinationCity) filters.destinationCity = query.destinationCity;
    if (query.mode) filters.mode = query.mode as any;
    
    // Handle departure date filtering - default to today if only dateTo is provided
    if (query.dateFrom) {
      filters.departureFrom = new Date(query.dateFrom);
    } else if (query.dateTo) {
      // Default to today at midnight if only dateTo is provided
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filters.departureFrom = today;
    }
    if (query.dateTo) filters.departureTo = new Date(query.dateTo);
    
    // Handle arrival date filtering - default to today if only arrivalTo is provided
    if (query.arrivalFrom) {
      filters.arrivalFrom = new Date(query.arrivalFrom);
    } else if (query.arrivalTo) {
      // Default to today at midnight if only arrivalTo is provided
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filters.arrivalFrom = today;
    }
    if (query.arrivalTo) filters.arrivalTo = new Date(query.arrivalTo);
    
    if (query.minPrice) filters.minPrice = parseFloat(query.minPrice);
    if (query.maxPrice) filters.maxPrice = parseFloat(query.maxPrice);

    const { shipments, total } = await shipmentRepository.search(filters, pagination);
    return createPaginatedResponse(shipments, total, pagination);
  },

  async getShipmentById(id: string, req?: AuthRequest) {
    const shipment = await prisma.shipmentSlot.findUnique({
      where: { id },
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
    });
    
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }
    
    // If user is authenticated and is a company user (admin/staff), skip verification check
    // This endpoint is used by companies to view their own shipments
    const isCompanyUser = req?.user?.companyId === shipment.companyId && 
                         req?.user?.role && 
                         ['COMPANY_ADMIN', 'COMPANY_STAFF', 'SUPER_ADMIN'].includes(req.user.role);
    
    // Company users can always view their own shipments (no verification check)
    // Public/customers can only view verified company shipments
    if (!isCompanyUser && !shipment.company.isVerified) {
      throw new NotFoundError('Shipment not found');
    }
    
    return shipment;
  },

  async trackShipmentByBooking(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Get shipment slot with tracking information
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            contactPhone: true,
            contactEmail: true,
          },
        },
      },
    });

    if (!shipmentSlot) {
      throw new NotFoundError('Shipment slot not found');
    }

    return {
      booking: {
        id: booking.id,
        status: booking.status,
        requestedWeightKg: booking.requestedWeightKg,
        requestedItemsCount: booking.requestedItemsCount,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      shipment: {
        id: shipmentSlot.id,
        originCountry: shipmentSlot.originCountry,
        originCity: shipmentSlot.originCity,
        destinationCountry: shipmentSlot.destinationCountry,
        destinationCity: shipmentSlot.destinationCity,
        departureTime: shipmentSlot.departureTime,
        arrivalTime: shipmentSlot.arrivalTime,
        mode: shipmentSlot.mode,
        trackingStatus: shipmentSlot.trackingStatus,
        status: shipmentSlot.status,
        cutoffTimeForReceivingItems: shipmentSlot.cutoffTimeForReceivingItems,
      },
      company: shipmentSlot.company,
    };
  },

  async deleteShipment(req: AuthRequest, id: string) {
    // Check staff permission
    await checkStaffPermission(req, 'deleteShipment');

    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to delete this shipment');
    }

    if (shipment.status !== 'DRAFT') {
      throw new BadRequestError('Only DRAFT shipments can be deleted');
    }

    // Check if there are any bookings
    const bookingsCount = await prisma.booking.count({
      where: { shipmentSlotId: id },
    });

    if (bookingsCount > 0) {
      throw new BadRequestError('Cannot delete shipment with existing bookings');
    }

    await prisma.shipmentSlot.delete({
      where: { id },
    });

    return { message: 'Shipment deleted successfully' };
  },

  async getShipmentBookings(req: AuthRequest, shipmentId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const shipment = await shipmentRepository.findById(shipmentId);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to view this shipment');
    }

    const bookings = await prisma.booking.findMany({
      where: { shipmentSlotId: shipmentId },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
          },
        },
        payment: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      customer: {
        id: booking.customer.id,
        name: booking.customer.fullName,
      },
      requestedWeightKg: booking.requestedWeightKg,
      requestedItemsCount: booking.requestedItemsCount,
      price: Number(booking.calculatedPrice),
      status: booking.status,
      createdAt: booking.createdAt,
    }));
  },
};

