import Stripe from 'stripe';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { AuthRequest } from '../../middleware/auth';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../utils/errors';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { calculateBookingCharges } from '../../utils/paymentCalculator';
import { createNotification, createSuperAdminNotification } from '../../utils/notifications';
import { scanTravelCourierItemRisk } from '../../utils/travelItemRiskScanner';
import { generateTravelCourierBookingId } from '../../utils/bookingId';
import {
  CreateListingDto,
  UpdateListingDto,
  CreateBookingDto,
  CreateReviewDto,
  CreateDisputeDto,
  DisputeResponseDto,
  AdminUpdateDisputeDto,
  AdminReviewFlightProofDto,
} from './dto';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

async function requireVerifiedTraveller(userId: string) {
  const profile = await prisma.travellerProfile.findUnique({
    where: { userId },
  });
  if (!profile || profile.verificationStatus !== 'VERIFIED') {
    throw new ForbiddenError(
      'Traveller verification is required before you can perform this action'
    );
  }
  return profile;
}

export const travelCourierService = {
  // ─── Listing Management ──────────────────────────────────

  async createListing(req: AuthRequest, dto: CreateListingDto) {
    if (!req.user) throw new ForbiddenError();
    await requireVerifiedTraveller(req.user.id);

    const listing = await prisma.travelCourierListing.create({
      data: {
        userId: req.user.id,
        originCity: dto.originCity,
        originCountry: dto.originCountry,
        destinationCity: dto.destinationCity,
        destinationCountry: dto.destinationCountry,
        departureDate: dto.departureDate,
        arrivalDate: dto.arrivalDate,
        airlineName: dto.airlineName,
        flightReference: dto.flightReference,
        availableWeightKg: dto.availableWeightKg,
        remainingWeightKg: dto.availableWeightKg,
        pricePerKgMinor: dto.pricePerKgMinor,
        currency: dto.currency,
        notes: dto.notes,
        baggagePolicyNotes: dto.baggagePolicyNotes,
        cutoffDate: dto.cutoffDate,
        flightProofUrl: dto.flightProofUrl,
        status: 'DRAFT',
      },
    });

    await createNotification({
      userId: req.user.id,
      type: 'TRAVEL_LISTING_CREATED' as any,
      title: 'Listing Created',
      body: `Your listing for ${dto.originCity} → ${dto.destinationCity} has been created as a draft.${dto.flightProofUrl ? ' Flight proof is pending admin review.' : ' Please upload your flight proof to proceed.'}`,
      metadata: { listingId: listing.id },
    });

    if (dto.flightProofUrl) {
      await createSuperAdminNotification(
        'TRAVEL_FLIGHT_PROOF_SUBMITTED' as any,
        'New Flight Proof Submitted',
        `A traveller has submitted a new listing (${dto.originCity} → ${dto.destinationCity}) with flight proof awaiting review.`,
        { listingId: listing.id, userId: req.user.id },
      );
    }

    return listing;
  },

  async getMyListings(req: AuthRequest, query: any) {
    if (!req.user) throw new ForbiddenError();

    const pagination = parsePagination(query || {});

    const [listings, total] = await Promise.all([
      prisma.travelCourierListing.findMany({
        where: { userId: req.user.id },
        include: {
          _count: { select: { bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierListing.count({
        where: { userId: req.user.id },
      }),
    ]);

    return createPaginatedResponse(listings, total, pagination);
  },

  async getMyListingById(req: AuthRequest, listingId: string) {
    if (!req.user) throw new ForbiddenError();

    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
      include: {
        bookings: {
          include: {
            customer: {
              select: { id: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.userId !== req.user.id) throw new ForbiddenError();

    return listing;
  },

  async updateListing(req: AuthRequest, listingId: string, dto: UpdateListingDto) {
    if (!req.user) throw new ForbiddenError();

    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.userId !== req.user.id) throw new ForbiddenError();
    if (listing.status !== 'DRAFT') {
      throw new BadRequestError('Only DRAFT listings can be edited');
    }

    const updateData: any = { ...dto };

    if (dto.availableWeightKg !== undefined) {
      updateData.remainingWeightKg = dto.availableWeightKg;
    }

    const isNewFlightProof = dto.flightProofUrl && dto.flightProofUrl !== listing.flightProofUrl;

    if (isNewFlightProof) {
      updateData.flightProofVerified = false;
      updateData.flightProofVerifiedAt = null;
      updateData.flightProofReviewedByAdminId = null;
      updateData.flightProofRejectionReason = null;
    }

    const updated = await prisma.travelCourierListing.update({
      where: { id: listingId },
      data: updateData,
    });

    if (isNewFlightProof) {
      await createNotification({
        userId: req.user.id,
        type: 'TRAVEL_FLIGHT_PROOF_SUBMITTED' as any,
        title: 'Flight Proof Submitted',
        body: `Your updated flight proof for ${listing.originCity} → ${listing.destinationCity} is pending admin review.`,
        metadata: { listingId },
      });

      await createSuperAdminNotification(
        'TRAVEL_FLIGHT_PROOF_SUBMITTED' as any,
        'Flight Proof Re-submitted',
        `A traveller has re-submitted flight proof for listing ${listing.originCity} → ${listing.destinationCity}. Please review.`,
        { listingId, userId: req.user.id },
      );
    }

    return updated;
  },

  async _publishListingInternal(listingId: string) {
    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.status !== 'DRAFT') {
      throw new BadRequestError('Only DRAFT listings can be published');
    }

    const updated = await prisma.travelCourierListing.update({
      where: { id: listingId },
      data: { status: 'PUBLISHED' },
    });

    await createNotification({
      userId: listing.userId,
      type: 'TRAVEL_LISTING_PUBLISHED' as any,
      title: 'Listing Published',
      body: `Your listing for ${listing.originCity} → ${listing.destinationCity} is now live and visible to customers.`,
      metadata: { listingId },
    });

    return updated;
  },

  async publishListing(req: AuthRequest, listingId: string) {
    if (!req.user) throw new ForbiddenError();
    await requireVerifiedTraveller(req.user.id);

    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.userId !== req.user.id) throw new ForbiddenError();
    if (!listing.flightProofUrl) {
      throw new BadRequestError('Flight proof document is required before publishing');
    }
    if (!listing.flightProofVerified) {
      throw new BadRequestError('Flight proof must be verified by admin before publishing');
    }

    return this._publishListingInternal(listingId);
  },

  async closeListing(req: AuthRequest, listingId: string) {
    if (!req.user) throw new ForbiddenError();

    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.userId !== req.user.id) throw new ForbiddenError();
    if (listing.status !== 'PUBLISHED') {
      throw new BadRequestError('Only PUBLISHED listings can be closed');
    }

    const updated = await prisma.travelCourierListing.update({
      where: { id: listingId },
      data: { status: 'CLOSED' },
    });

    await createNotification({
      userId: req.user.id,
      type: 'TRAVEL_LISTING_CLOSED' as any,
      title: 'Listing Closed',
      body: `Your listing for ${listing.originCity} → ${listing.destinationCity} has been closed and is no longer visible to customers.`,
      metadata: { listingId },
    });

    return updated;
  },

  // ─── Public Search ───────────────────────────────────────

  async searchListings(query: any) {
    const pagination = parsePagination(query || {});
    const where: any = {
      status: 'PUBLISHED',
      remainingWeightKg: { gt: 0 },
      departureDate: { gt: new Date() },
    };

    if (query?.originCountry) where.originCountry = query.originCountry;
    if (query?.destinationCountry) where.destinationCountry = query.destinationCountry;
    if (query?.originCity) where.originCity = { contains: query.originCity, mode: 'insensitive' };
    if (query?.destinationCity) where.destinationCity = { contains: query.destinationCity, mode: 'insensitive' };

    if (query?.departureDateFrom || query?.departureDateTo) {
      where.departureDate = {
        ...where.departureDate,
        ...(query.departureDateFrom && { gte: new Date(query.departureDateFrom) }),
        ...(query.departureDateTo && { lte: new Date(query.departureDateTo) }),
      };
    }

    if (query?.maxPricePerKg) {
      where.pricePerKgMinor = { lte: parseInt(query.maxPricePerKg, 10) };
    }

    const [listings, total] = await Promise.all([
      prisma.travelCourierListing.findMany({
        where,
        select: {
          id: true,
          originCity: true,
          originCountry: true,
          destinationCity: true,
          destinationCountry: true,
          departureDate: true,
          arrivalDate: true,
          airlineName: true,
          availableWeightKg: true,
          remainingWeightKg: true,
          pricePerKgMinor: true,
          currency: true,
          notes: true,
          baggagePolicyNotes: true,
          cutoffDate: true,
          createdAt: true,
          user: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { departureDate: 'asc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierListing.count({ where }),
    ]);

    return createPaginatedResponse(listings, total, pagination);
  },

  async getPublicListingById(id: string) {
    const listing = await prisma.travelCourierListing.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
        remainingWeightKg: { gt: 0 },
        departureDate: { gt: new Date() },
      },
      select: {
        id: true,
        originCity: true,
        originCountry: true,
        destinationCity: true,
        destinationCountry: true,
        departureDate: true,
        arrivalDate: true,
        airlineName: true,
        availableWeightKg: true,
        remainingWeightKg: true,
        pricePerKgMinor: true,
        currency: true,
        notes: true,
        baggagePolicyNotes: true,
        cutoffDate: true,
        createdAt: true,
        user: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    return listing;
  },

  // ─── Booking Request Flow ────────────────────────────────

  async createBooking(req: AuthRequest, listingId: string, dto: CreateBookingDto) {
    if (!req.user) throw new ForbiddenError();

    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.status !== 'PUBLISHED') {
      throw new BadRequestError('Listing is not available for booking');
    }
    if (listing.userId === req.user.id) {
      throw new BadRequestError('You cannot book your own listing');
    }
    if (dto.requestedWeightKg > listing.remainingWeightKg) {
      throw new BadRequestError(
        `Only ${listing.remainingWeightKg} kg remaining on this listing`
      );
    }
    if (listing.departureDate <= new Date()) {
      throw new BadRequestError('This listing has already departed');
    }

    const riskScan = scanTravelCourierItemRisk(dto.declaredContents);

    if (riskScan.riskLevel === 'BLOCKED') {
      throw new BadRequestError(
        'Your declared contents include prohibited items that cannot be transported. Please remove them and try again.'
      );
    }

    const baseAmountMinor = Math.round(dto.requestedWeightKg * listing.pricePerKgMinor);
    const charges = calculateBookingCharges(baseAmountMinor);

    const bookingId = await generateTravelCourierBookingId();

    const booking = await prisma.travelCourierBooking.create({
      data: {
        id: bookingId,
        listingId,
        customerId: req.user.id,
        requestedWeightKg: dto.requestedWeightKg,
        itemDescription: dto.itemDescription,
        declaredContents: dto.declaredContents,
        restrictedItemsAccepted: dto.restrictedItemsAccepted,
        itemRiskLevel: riskScan.riskLevel,
        riskFlags: riskScan.flags.length > 0 ? riskScan.flags : undefined,
        pickupNotes: dto.pickupNotes,
        deliveryNotes: dto.deliveryNotes,
        baseAmountMinor: charges.baseAmount,
        adminFeeAmountMinor: charges.adminFeeAmount,
        processingFeeMinor: charges.processingFeeAmount,
        totalAmountMinor: charges.totalAmount,
        status: 'PENDING_APPROVAL',
      },
    });

    await createNotification({
      userId: listing.userId,
      type: 'TRAVEL_BOOKING_REQUESTED' as any,
      title: 'New Booking Request',
      body: `A customer requested ${dto.requestedWeightKg} kg on your ${listing.originCity} → ${listing.destinationCity} trip.`,
      metadata: { bookingId: booking.id, listingId },
    });

    if (riskScan.riskLevel === 'REVIEW') {
      await createNotification({
        userId: listing.userId,
        type: 'TRAVEL_BOOKING_RISK_FLAGGED' as any,
        title: 'Booking Flagged for Review',
        body: `A booking on your ${listing.originCity} → ${listing.destinationCity} trip contains items flagged for review: ${riskScan.flags.join(', ')}.`,
        metadata: { bookingId: booking.id, listingId, riskFlags: riskScan.flags },
      });
    }

    return booking;
  },

  async getMyBookingsAsCustomer(req: AuthRequest, query: any) {
    if (!req.user) throw new ForbiddenError();
    const pagination = parsePagination(query || {});
    const where: any = { customerId: req.user.id };

    if (query?.status) where.status = query.status;

    const [bookings, total] = await Promise.all([
      prisma.travelCourierBooking.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              originCity: true,
              originCountry: true,
              destinationCity: true,
              destinationCountry: true,
              departureDate: true,
              pricePerKgMinor: true,
              currency: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierBooking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, pagination);
  },

  async getMyBookingById(req: AuthRequest, id: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findFirst({
      where: { id, customerId: req.user.id },
      include: {
        listing: {
          select: {
            id: true,
            originCity: true,
            originCountry: true,
            destinationCity: true,
            destinationCountry: true,
            departureDate: true,
            arrivalDate: true,
            airlineName: true,
            pricePerKgMinor: true,
            currency: true,
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!booking) throw new NotFoundError('Booking not found');

    return booking;
  },

  async getBookingsForMyListings(req: AuthRequest, query: any) {
    if (!req.user) throw new ForbiddenError();
    const pagination = parsePagination(query || {});

    const where: any = {
      listing: { userId: req.user.id },
    };
    if (query?.status) where.status = query.status;

    const [bookings, total] = await Promise.all([
      prisma.travelCourierBooking.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              originCity: true,
              destinationCity: true,
              departureDate: true,
            },
          },
          customer: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierBooking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, pagination);
  },

  async approveBooking(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.listing.userId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'PENDING_APPROVAL') {
      throw new BadRequestError('Booking is not pending approval');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: booking.listing.currency.toLowerCase(),
            product_data: {
              name: `Travel Courier - ${booking.listing.originCity} → ${booking.listing.destinationCity}`,
              description: `${booking.requestedWeightKg} kg | Booking ${booking.id}`,
            },
            unit_amount: booking.totalAmountMinor,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.frontendUrl}/parcsal-traveller/bookings/${booking.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/parcsal-traveller/bookings/${booking.id}?payment=cancelled`,
      metadata: {
        travelCourierBookingId: booking.id,
        listingId: booking.listingId,
        customerId: booking.customerId,
      },
      client_reference_id: booking.id,
    });

    const updated = await prisma.travelCourierBooking.update({
      where: { id: bookingId },
      data: {
        status: 'APPROVED_AWAITING_PAYMENT',
        stripeCheckoutSessionId: session.id,
      },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_BOOKING_APPROVED' as any,
      title: 'Booking Approved',
      body: `Your booking for ${booking.requestedWeightKg} kg on ${booking.listing.originCity} → ${booking.listing.destinationCity} has been approved. Please complete payment.`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    return { booking: updated, checkoutUrl: session.url };
  },

  async getPaymentUrl(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'APPROVED_AWAITING_PAYMENT') {
      throw new BadRequestError('Booking is not awaiting payment');
    }

    if (booking.stripeCheckoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(booking.stripeCheckoutSessionId);
        if (existing.status === 'open' && existing.url) {
          return { sessionId: existing.id, checkoutUrl: existing.url };
        }
      } catch {
        // Session expired or invalid — fall through to create a new one
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: booking.listing.currency.toLowerCase(),
            product_data: {
              name: `Travel Courier - ${booking.listing.originCity} → ${booking.listing.destinationCity}`,
              description: `${booking.requestedWeightKg} kg | Booking ${booking.id}`,
            },
            unit_amount: booking.totalAmountMinor,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.frontendUrl}/parcsal-traveller/bookings/${booking.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/parcsal-traveller/bookings/${booking.id}?payment=cancelled`,
      metadata: {
        travelCourierBookingId: booking.id,
        listingId: booking.listingId,
        customerId: booking.customerId,
      },
      client_reference_id: booking.id,
    });

    await prisma.travelCourierBooking.update({
      where: { id: bookingId },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { sessionId: session.id, checkoutUrl: session.url };
  },

  async rejectBooking(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.listing.userId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'PENDING_APPROVAL') {
      throw new BadRequestError('Booking is not pending approval');
    }

    const updated = await prisma.travelCourierBooking.update({
      where: { id: bookingId },
      data: { status: 'REJECTED' },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_BOOKING_REJECTED' as any,
      title: 'Booking Rejected',
      body: `Your booking for ${booking.requestedWeightKg} kg on ${booking.listing.originCity} → ${booking.listing.destinationCity} was rejected by the traveller.`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    return updated;
  },

  // ─── Payment Webhook Handler ─────────────────────────────

  async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const bookingId = session.metadata?.travelCourierBookingId;
    if (!bookingId) return null;

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });
    if (!booking) {
      console.error(`[TravelCourier] Booking not found for checkout: ${bookingId}`);
      return null;
    }
    if (booking.status === 'CONFIRMED') return booking;

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.travelCourierBooking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          stripePaymentIntentId: paymentIntentId || undefined,
        },
      });

      await tx.travelCourierListing.update({
        where: { id: booking.listingId },
        data: {
          remainingWeightKg: {
            decrement: booking.requestedWeightKg,
          },
        },
      });

      return updatedBooking;
    });

    await createNotification({
      userId: booking.listing.userId,
      type: 'TRAVEL_PAYMENT_COMPLETED' as any,
      title: 'Payment Received',
      body: `Payment confirmed for booking ${booking.id} (${booking.requestedWeightKg} kg).`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_PAYMENT_COMPLETED' as any,
      title: 'Payment Confirmed',
      body: `Your payment for ${booking.requestedWeightKg} kg on ${booking.listing.originCity} → ${booking.listing.destinationCity} is confirmed.`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    return updated;
  },

  // ─── Delivery Confirmation ───────────────────────────────

  async markDelivered(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.listing.userId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'CONFIRMED' && booking.status !== 'IN_TRANSIT') {
      throw new BadRequestError('Booking must be CONFIRMED or IN_TRANSIT to mark delivered');
    }

    const now = new Date();
    const autoReleaseAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const updated = await prisma.travelCourierBooking.update({
      where: { id: bookingId },
      data: {
        travellerConfirmedDelivered: true,
        status: 'DELIVERED_PENDING_CUSTOMER_CONFIRMATION',
        deliveredAt: now,
        autoReleaseAt,
      },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_DELIVERED' as any,
      title: 'Delivery Marked',
      body: `The traveller has marked your items as delivered. Please confirm receipt within 72 hours.`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    return updated;
  },

  async confirmDelivery(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'DELIVERED_PENDING_CUSTOMER_CONFIRMATION') {
      throw new BadRequestError('Booking is not pending delivery confirmation');
    }

    const updated = await prisma.travelCourierBooking.update({
      where: { id: bookingId },
      data: {
        customerConfirmedDelivered: true,
        payoutReleased: true,
        payoutReleasedAt: new Date(),
        status: 'COMPLETED',
      },
    });

    await createNotification({
      userId: booking.listing.userId,
      type: 'TRAVEL_PAYOUT_RELEASED' as any,
      title: 'Payout Released',
      body: `Customer confirmed delivery for booking ${booking.id}. Your payout has been released.`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_DELIVERY_CONFIRMED' as any,
      title: 'Delivery Confirmed',
      body: `You confirmed delivery for your booking. Thank you!`,
      metadata: { bookingId: booking.id, listingId: booking.listingId },
    });

    return updated;
  },

  // ─── Auto Release ────────────────────────────────────────

  async autoReleasePendingPayouts() {
    const now = new Date();

    const bookings = await prisma.travelCourierBooking.findMany({
      where: {
        status: 'DELIVERED_PENDING_CUSTOMER_CONFIRMATION',
        customerConfirmedDelivered: false,
        disputeOpened: false,
        autoReleaseAt: { lte: now },
        dispute: null,
      },
      include: { listing: true },
    });

    let releasedCount = 0;

    for (const booking of bookings) {
      try {
        await prisma.travelCourierBooking.update({
          where: { id: booking.id },
          data: {
            payoutReleased: true,
            payoutReleasedAt: now,
            status: 'COMPLETED',
          },
        });

        await createNotification({
          userId: booking.listing.userId,
          type: 'TRAVEL_PAYOUT_RELEASED' as any,
          title: 'Payout Auto-Released',
          body: `Payout for booking ${booking.id} has been automatically released after 72 hours.`,
          metadata: { bookingId: booking.id, listingId: booking.listingId },
        });

        releasedCount++;
      } catch (error) {
        console.error(
          `[TravelCourier AutoRelease] Failed for booking ${booking.id}:`,
          error
        );
      }
    }

    return { releasedCount };
  },

  // ─── Admin: Flight Proof Review ──────────────────────────

  async listPendingFlightProof(query: any) {
    const pagination = parsePagination(query || {});

    const where = {
      flightProofUrl: { not: null },
      flightProofVerified: false,
      status: 'DRAFT' as const,
    };

    const [listings, total] = await Promise.all([
      prisma.travelCourierListing.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierListing.count({ where }),
    ]);

    return createPaginatedResponse(listings, total, pagination);
  },

  async reviewFlightProof(adminId: string, listingId: string, dto: AdminReviewFlightProofDto) {
    const listing = await prisma.travelCourierListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    if (!listing.flightProofUrl) {
      throw new BadRequestError('No flight proof uploaded on this listing');
    }

    const shouldAutoPublish = dto.flightProofVerified;

    console.log('[reviewFlightProof] listingId=%s, currentStatus=%s, flightProofVerified=%s, shouldAutoPublish=%s',
      listingId, listing.status, dto.flightProofVerified, shouldAutoPublish);

    const updateData: Record<string, any> = {
      flightProofVerified: dto.flightProofVerified,
      flightProofVerifiedAt: dto.flightProofVerified ? new Date() : null,
      flightProofReviewedByAdminId: adminId,
      flightProofRejectionReason: dto.flightProofVerified ? null : dto.rejectionReason,
    };

    if (shouldAutoPublish) {
      this._publishListingInternal(listingId);
    }
    // if (shouldAutoPublish) {
    //   updateData.status = 'PUBLISHED';
    // }

    console.log('[reviewFlightProof] updateData=%j', updateData);

    const updated = await prisma.travelCourierListing.update({
      where: { id: listingId },
      data: updateData,
      include: { bookings: true },
    });

    console.log('[reviewFlightProof] updated.status=%s', updated.status);

    const title = dto.flightProofVerified
      ? 'Flight Proof Approved'
      : 'Flight Proof Rejected';
    const body = dto.flightProofVerified
      ? shouldAutoPublish
        ? 'Your flight proof has been verified and your listing is now live.'
        : 'Your flight proof has been verified. You can now publish the listing.'
      : `Your flight proof was rejected: ${dto.rejectionReason}`;

    await createNotification({
      userId: listing.userId,
      type: 'TRAVEL_FLIGHT_PROOF_REVIEWED' as any,
      title,
      body,
      metadata: { listingId: listing.id, autoPublished: shouldAutoPublish },
    });

    if (shouldAutoPublish) {
      await createNotification({
        userId: listing.userId,
        type: 'TRAVEL_LISTING_PUBLISHED' as any,
        title: 'Listing Published',
        body: `Your listing for ${listing.originCity} → ${listing.destinationCity} is now live and visible to customers.`,
        metadata: { listingId: listing.id },
      });
    }

    return updated;
  },

  // ─── Reviews ─────────────────────────────────────────────

  async createReview(req: AuthRequest, bookingId: string, dto: CreateReviewDto) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true, review: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id) throw new ForbiddenError();
    if (booking.status !== 'COMPLETED') {
      throw new BadRequestError('You can only review completed bookings');
    }
    if (booking.review) {
      throw new BadRequestError('You have already reviewed this booking');
    }

    const review = await prisma.travelCourierReview.create({
      data: {
        bookingId,
        reviewerId: req.user.id,
        travellerUserId: booking.listing.userId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    const agg = await prisma.travelCourierReview.aggregate({
      where: { travellerUserId: booking.listing.userId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.travellerProfile.updateMany({
      where: { userId: booking.listing.userId },
      data: {
        travellerRatingAvg: agg._avg.rating,
        travellerRatingCount: agg._count.rating,
      },
    });

    await createNotification({
      userId: booking.listing.userId,
      type: 'TRAVEL_REVIEW_SUBMITTED' as any,
      title: 'New Review',
      body: `A customer left a ${dto.rating}-star review on your courier service.`,
      metadata: { bookingId, reviewId: review.id },
    });

    return review;
  },

  async getBookingReview(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id && booking.listing.userId !== req.user.id) {
      throw new ForbiddenError();
    }

    const review = await prisma.travelCourierReview.findUnique({
      where: { bookingId },
    });

    return review;
  },

  async getTravellerReviews(travellerUserId: string, query: any) {
    const pagination = parsePagination(query || {});

    const [reviews, total, agg] = await Promise.all([
      prisma.travelCourierReview.findMany({
        where: { travellerUserId },
        include: {
          booking: {
            select: {
              listing: {
                select: { originCity: true, destinationCity: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierReview.count({ where: { travellerUserId } }),
      prisma.travelCourierReview.aggregate({
        where: { travellerUserId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      averageRating: agg._avg.rating,
      totalReviews: agg._count.rating,
      ...createPaginatedResponse(reviews, total, pagination),
    };
  },

  // ─── Disputes ────────────────────────────────────────────

  async openDispute(req: AuthRequest, bookingId: string, dto: CreateDisputeDto) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true, dispute: true },
    });

    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id) throw new ForbiddenError();
    if (booking.dispute) {
      throw new BadRequestError('A dispute has already been opened for this booking');
    }

    const allowedStatuses = [
      'CONFIRMED',
      'IN_TRANSIT',
      'DELIVERED_PENDING_CUSTOMER_CONFIRMATION',
    ];
    if (!allowedStatuses.includes(booking.status)) {
      throw new BadRequestError('Cannot open dispute for this booking status');
    }

    const [dispute] = await Promise.all([
      prisma.travelCourierDispute.create({
        data: {
          bookingId,
          openedByUserId: req.user.id,
          reason: dto.reason as any,
          description: dto.description,
          evidence: dto.evidence || undefined,
        },
      }),
      prisma.travelCourierBooking.update({
        where: { id: bookingId },
        data: {
          disputeOpened: true,
          status: 'DISPUTED',
        },
      }),
    ]);

    await createNotification({
      userId: booking.listing.userId,
      type: 'TRAVEL_DISPUTE_OPENED' as any,
      title: 'Dispute Opened',
      body: `A customer opened a dispute for booking ${booking.id}: ${dto.reason}.`,
      metadata: { bookingId, disputeId: dispute.id },
    });

    return dispute;
  },

  async getDisputeForCustomer(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.customerId !== req.user.id) throw new ForbiddenError();

    const dispute = await prisma.travelCourierDispute.findUnique({
      where: { bookingId },
    });

    return dispute;
  },

  async getDisputeForTraveller(req: AuthRequest, bookingId: string) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.listing.userId !== req.user.id) throw new ForbiddenError();

    const dispute = await prisma.travelCourierDispute.findUnique({
      where: { bookingId },
    });

    return dispute;
  },

  async respondToDispute(req: AuthRequest, bookingId: string, dto: DisputeResponseDto) {
    if (!req.user) throw new ForbiddenError();

    const booking = await prisma.travelCourierBooking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.listing.userId !== req.user.id) throw new ForbiddenError();

    const dispute = await prisma.travelCourierDispute.findUnique({
      where: { bookingId },
    });
    if (!dispute) throw new NotFoundError('No dispute found for this booking');
    if (!['OPEN', 'IN_REVIEW'].includes(dispute.status)) {
      throw new BadRequestError('Dispute is no longer open for responses');
    }

    const updated = await prisma.travelCourierDispute.update({
      where: { id: dispute.id },
      data: {
        travellerResponse: dto.responseText,
        travellerEvidence: dto.evidence || undefined,
      },
    });

    await createNotification({
      userId: booking.customerId,
      type: 'TRAVEL_DISPUTE_UPDATED' as any,
      title: 'Dispute Response',
      body: `The traveller has responded to your dispute for booking ${booking.id}.`,
      metadata: { bookingId, disputeId: dispute.id },
    });

    return updated;
  },

  // ─── Admin: Disputes ─────────────────────────────────────

  async listDisputes(query: any) {
    const pagination = parsePagination(query || {});
    const where: any = {};

    if (query?.status) where.status = query.status;

    const [disputes, total] = await Promise.all([
      prisma.travelCourierDispute.findMany({
        where,
        include: {
          booking: {
            include: {
              listing: {
                select: { id: true, originCity: true, destinationCity: true, userId: true },
              },
              customer: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travelCourierDispute.count({ where }),
    ]);

    return createPaginatedResponse(disputes, total, pagination);
  },

  async getDisputeById(disputeId: string) {
    const dispute = await prisma.travelCourierDispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            listing: {
              select: {
                id: true, originCity: true, destinationCity: true,
                userId: true, user: { select: { id: true, fullName: true, email: true } },
              },
            },
            customer: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundError('Dispute not found');
    return dispute;
  },

  async adminUpdateDispute(_adminId: string, disputeId: string, dto: AdminUpdateDisputeDto) {
    const dispute = await prisma.travelCourierDispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: { include: { listing: true } },
      },
    });
    if (!dispute) throw new NotFoundError('Dispute not found');

    const updated = await prisma.travelCourierDispute.update({
      where: { id: disputeId },
      data: {
        status: dto.status as any,
        adminNotes: dto.adminNotes,
        resolutionNotes: dto.resolutionNotes,
      },
    });

    if (dto.status === 'RESOLVED_FOR_TRAVELLER' && dto.releasePayout) {
      await prisma.travelCourierBooking.update({
        where: { id: dispute.bookingId },
        data: {
          payoutReleased: true,
          payoutReleasedAt: new Date(),
          status: 'COMPLETED',
        },
      });

      await createNotification({
        userId: dispute.booking.listing.userId,
        type: 'TRAVEL_PAYOUT_RELEASED' as any,
        title: 'Payout Released',
        body: `Dispute resolved in your favour. Payout for booking ${dispute.bookingId} has been released.`,
        metadata: { bookingId: dispute.bookingId, disputeId },
      });
    }

    if (dto.status === 'RESOLVED_FOR_CUSTOMER') {
      // TODO: Implement automated refund flow
      await prisma.travelCourierBooking.update({
        where: { id: dispute.bookingId },
        data: { status: 'CANCELLED' },
      });
    }

    await createNotification({
      userId: dispute.booking.customerId,
      type: 'TRAVEL_DISPUTE_UPDATED' as any,
      title: 'Dispute Updated',
      body: `Your dispute for booking ${dispute.bookingId} has been updated to: ${dto.status}.`,
      metadata: { bookingId: dispute.bookingId, disputeId },
    });

    await createNotification({
      userId: dispute.booking.listing.userId,
      type: 'TRAVEL_DISPUTE_UPDATED' as any,
      title: 'Dispute Updated',
      body: `A dispute for booking ${dispute.bookingId} has been updated to: ${dto.status}.`,
      metadata: { bookingId: dispute.bookingId, disputeId },
    });

    return updated;
  },
};
