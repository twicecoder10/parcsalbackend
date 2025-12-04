import { shipmentRepository, CreateShipmentData, UpdateShipmentData, SearchFilters } from './repository';
import { CreateShipmentDto, UpdateShipmentDto, UpdateShipmentStatusDto, UpdateShipmentTrackingStatusDto, SearchShipmentsDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import prisma from '../../config/database';
import { onboardingRepository } from '../onboarding/repository';
import { bookingRepository } from '../bookings/repository';
import { BookingStatus } from '@prisma/client';
import { createShipmentCustomerNotifications } from '../../utils/notifications';

export const shipmentService = {
  async createShipment(req: AuthRequest, dto: CreateShipmentDto) {
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

    if (company.activePlan) {
      const activeCount = await shipmentRepository.countActiveByCompany(req.user.companyId);
      const maxSlots = company.activePlan.maxActiveShipmentSlots;

      if (maxSlots !== null && activeCount >= maxSlots) {
        throw new BadRequestError(
          `Plan limit reached. Maximum ${maxSlots} active shipment slots allowed.`
        );
      }
    }

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
      status: dto.status || 'DRAFT',
    };

    // Check if this is the company's first shipment slot (before creating)
    const existingCount = await shipmentRepository.countActiveByCompany(req.user.companyId);
    const isFirstShipment = existingCount === 0;

    const shipment = await shipmentRepository.create(createData);

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
    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
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
    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
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
    // Verify ownership
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
      throw new NotFoundError('Shipment not found');
    }

    if (!req.user || shipment.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to update this shipment');
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
        const updateResult = await bookingRepository.updateStatusBySlot(id, bookingStatusUpdate, filterStatuses);
        console.log(`Updated ${updateResult.count} bookings for slot ${id} to status ${bookingStatusUpdate} (filtered by: ${filterStatuses?.join(', ') || 'all'})`);
        if (updateResult.count === 0) {
          console.warn(`No bookings were updated for slot ${id}. This might indicate bookings are in a different status than expected.`);
        }
      } catch (error) {
        console.error(`Failed to update bookings for slot ${id}:`, error);
        // Don't throw - allow the tracking status update to succeed even if booking update fails
      }
    }

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
    if (query.dateFrom) filters.departureFrom = new Date(query.dateFrom);
    if (query.dateTo) filters.departureTo = new Date(query.dateTo);
    if (query.minPrice) filters.minPrice = parseFloat(query.minPrice);
    if (query.maxPrice) filters.maxPrice = parseFloat(query.maxPrice);

    const { shipments, total } = await shipmentRepository.search(filters, pagination);
    return createPaginatedResponse(shipments, total, pagination);
  },

  async getShipmentById(id: string) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) {
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
            email: true,
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
        email: booking.customer.email,
      },
      requestedWeightKg: booking.requestedWeightKg,
      requestedItemsCount: booking.requestedItemsCount,
      price: Number(booking.calculatedPrice),
      status: booking.status,
      createdAt: booking.createdAt,
    }));
  },
};

