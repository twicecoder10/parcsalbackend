import Stripe from 'stripe';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { createPaginatedResponse, parsePagination } from '../../utils/pagination';
import { calculateBookingCharges } from '../../utils/paymentCalculator';
import { createCompanyNotification, createNotification } from '../../utils/notifications';
import { CreateQuoteDto, CreateShipmentRequestDto } from './dto';
import { generateBookingId } from '../../utils/bookingId';
import { generatePaymentId } from '../../utils/paymentId';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function assertCustomer(req: AuthRequest) {
  if (!req.user || req.user.role !== 'CUSTOMER') {
    throw new ForbiddenError('Only customers can perform this action');
  }
}

function assertCompanyUser(req: AuthRequest) {
  if (!req.user || !req.user.companyId) {
    throw new ForbiddenError('Company access required');
  }
}

export const rfqService = {
  async createRequest(req: AuthRequest, dto: CreateShipmentRequestDto) {
    assertCustomer(req);
    const now = new Date();

    const created = await prisma.shipmentRequest.create({
      data: {
        customerId: req.user!.id,
        originCity: dto.originCity,
        originCountry: dto.originCountry,
        destinationCity: dto.destinationCity,
        destinationCountry: dto.destinationCountry,
        weightKg: dto.weightKg ?? null,
        itemsCount: dto.itemsCount ?? null,
        preferredMode: dto.preferredMode ?? null,
        description: dto.description ?? null,
        targetDate: dto.targetDate ?? null,
        expiresAt: dto.expiresAt ?? addDays(now, 7),
        status: 'OPEN',
      },
    });

    return {
      ...created,
      quoteCount: 0,
    };
  },

  async listMyRequests(req: AuthRequest, query: any) {
    assertCustomer(req);
    const pagination = parsePagination(query);
    const where: any = { customerId: req.user!.id };
    if (query.status) {
      where.status = query.status;
    }

    const [requests, total] = await Promise.all([
      prisma.shipmentRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          _count: {
            select: {
              quotes: true,
            },
          },
        },
      }),
      prisma.shipmentRequest.count({ where }),
    ]);

    const data = requests.map((request) => ({
      ...request,
      quoteCount: request._count.quotes,
      _count: undefined,
    }));

    return createPaginatedResponse(data, total, pagination);
  },

  async getMyRequestById(req: AuthRequest, requestId: string) {
    assertCustomer(req);

    const request = await prisma.shipmentRequest.findUnique({
      where: { id: requestId },
      include: {
        quotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            company: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.customerId !== req.user!.id) {
      throw new ForbiddenError('You do not have access to this request');
    }

    const companyIds = [...new Set(request.quotes.map((quote) => quote.companyId))];
    const ratings = companyIds.length
      ? await prisma.review.groupBy({
          by: ['companyId'],
          where: {
            companyId: { in: companyIds },
          },
          _avg: { rating: true },
        })
      : [];
    const ratingMap = new Map(
      ratings.map((rating) => [rating.companyId, rating._avg.rating !== null ? Number(Number(rating._avg.rating).toFixed(1)) : null])
    );

    const quotes = request.quotes.map((quote) => ({
      ...quote,
      company: {
        ...quote.company,
        rating: ratingMap.get(quote.companyId) ?? null,
      },
    }));

    return {
      ...request,
      quotes,
      quoteCount: quotes.length,
    };
  },

  async acceptQuote(req: AuthRequest, requestId: string, quoteId: string) {
    assertCustomer(req);
    const now = new Date();

    const request = await prisma.shipmentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundError('Request not found');
    }
    if (request.customerId !== req.user!.id) {
      throw new ForbiddenError('You do not have access to this request');
    }
    if (!['OPEN', 'QUOTED'].includes(request.status)) {
      throw new BadRequestError(`Cannot accept quote for request in ${request.status} status`);
    }
    if (request.expiresAt && request.expiresAt <= now) {
      throw new BadRequestError('Request is expired');
    }

    const quote = await prisma.requestQuote.findFirst({
      where: {
        id: quoteId,
        requestId,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            chargesEnabled: true,
            plan: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundError('Quote not found');
    }
    if (quote.status !== 'PENDING') {
      throw new BadRequestError('Only pending quotes can be accepted');
    }
    if (quote.validUntil <= now) {
      throw new BadRequestError('Quote has expired');
    }

    const ADMIN_FEE_BPS = 1500;
    const charges = calculateBookingCharges(quote.priceMinor, ADMIN_FEE_BPS);
    const commissionAmount = quote.company.plan === 'FREE' ? charges.adminFeeAmount : 0;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: quote.currency.toLowerCase(),
            product_data: {
              name: `RFQ Booking - ${request.originCity} to ${request.destinationCity}`,
              description: `Request ID: ${request.id}`,
            },
            unit_amount: charges.totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.frontendUrl}/requests/${request.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/requests/${request.id}?payment=cancelled`,
      metadata: {
        type: 'RFQ_QUOTE',
        requestId: request.id,
        quoteId: quote.id,
        customerId: request.customerId,
        companyId: quote.companyId,
        baseAmount: charges.baseAmount.toString(),
        adminFeeAmount: charges.adminFeeAmount.toString(),
        processingFeeAmount: charges.processingFeeAmount.toString(),
        totalAmount: charges.totalAmount.toString(),
        commissionAmount: commissionAmount.toString(),
      },
      client_reference_id: quote.id,
      payment_intent_data: {
        metadata: {
          type: 'RFQ_QUOTE',
          requestId: request.id,
          quoteId: quote.id,
          customerId: request.customerId,
          companyId: quote.companyId,
        },
      },
    };

    if (quote.company.stripeAccountId && quote.company.chargesEnabled) {
      let transferAmount = charges.baseAmount;
      if (quote.company.plan === 'FREE') {
        transferAmount = charges.baseAmount - charges.adminFeeAmount;
      }

      sessionParams.payment_intent_data = {
        ...sessionParams.payment_intent_data,
        transfer_data: {
          destination: quote.company.stripeAccountId,
          amount: transferAmount,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await prisma.requestQuote.update({
      where: { id: quote.id },
      data: {
        status: 'AWAITING_PAYMENT',
        stripeSessionId: session.id,
      },
    });

    return {
      quoteId: quote.id,
      requestId: request.id,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
      amount: {
        baseAmount: charges.baseAmount,
        adminFeeAmount: charges.adminFeeAmount,
        processingFeeAmount: charges.processingFeeAmount,
        totalAmount: charges.totalAmount,
      },
    };
  },

  async listMarketplaceRequests(req: AuthRequest, query: any) {
    assertCompanyUser(req);
    const pagination = parsePagination(query);
    const now = new Date();

    const where: any = {
      status: { in: ['OPEN', 'QUOTED'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const [requests, total] = await Promise.all([
      prisma.shipmentRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          _count: {
            select: {
              quotes: true,
            },
          },
        },
      }),
      prisma.shipmentRequest.count({ where }),
    ]);

    const data = requests.map((request) => ({
      id: request.id,
      originCity: request.originCity,
      originCountry: request.originCountry,
      destinationCity: request.destinationCity,
      destinationCountry: request.destinationCountry,
      weightKg: request.weightKg,
      itemsCount: request.itemsCount,
      preferredMode: request.preferredMode,
      description: request.description,
      targetDate: request.targetDate,
      status: request.status,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      quoteCount: request._count.quotes,
    }));

    return createPaginatedResponse(data, total, pagination);
  },

  async getMarketplaceRequestById(req: AuthRequest, requestId: string) {
    assertCompanyUser(req);
    const companyId = req.user!.companyId!;
    const now = new Date();

    const request = await prisma.shipmentRequest.findFirst({
      where: {
        id: requestId,
        status: { in: ['OPEN', 'QUOTED'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        quotes: {
          where: { companyId },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    const quoteCount = await prisma.requestQuote.count({
      where: { requestId: request.id },
    });

    return {
      id: request.id,
      originCity: request.originCity,
      originCountry: request.originCountry,
      destinationCity: request.destinationCity,
      destinationCountry: request.destinationCountry,
      weightKg: request.weightKg,
      itemsCount: request.itemsCount,
      preferredMode: request.preferredMode,
      description: request.description,
      targetDate: request.targetDate,
      status: request.status,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      quoteCount,
      myQuote: request.quotes[0] || null,
    };
  },

  async createQuote(req: AuthRequest, requestId: string, dto: CreateQuoteDto) {
    assertCompanyUser(req);
    const companyId = req.user!.companyId!;
    const now = new Date();

    if (dto.validUntil <= now) {
      throw new BadRequestError('Quote validUntil must be in the future');
    }

    const request = await prisma.shipmentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundError('Request not found');
    }
    if (!['OPEN', 'QUOTED'].includes(request.status)) {
      throw new BadRequestError(`Request is ${request.status} and cannot be quoted`);
    }
    if (request.expiresAt && request.expiresAt <= now) {
      throw new BadRequestError('Request is expired');
    }

    try {
      const quote = await prisma.requestQuote.create({
        data: {
          requestId,
          companyId,
          priceMinor: dto.priceMinor,
          currency: dto.currency.toUpperCase(),
          estimatedDays: dto.estimatedDays,
          note: dto.note ?? null,
          validUntil: dto.validUntil,
          status: 'PENDING',
        },
      });

      if (request.status === 'OPEN') {
        await prisma.shipmentRequest.update({
          where: { id: request.id },
          data: { status: 'QUOTED' },
        });
      }

      await createNotification({
        userId: request.customerId,
        type: 'BOOKING_CREATED',
        title: 'New quote received',
        body: `You received a new quote for ${request.originCity} to ${request.destinationCity}.`,
        metadata: {
          requestId: request.id,
          quoteId: quote.id,
        },
      }).catch((error) => {
        console.error('[RFQ] Failed to notify customer about new quote:', error);
      });

      return quote;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictError('Your company has already submitted a quote for this request');
      }
      throw error;
    }
  },

  async listCompanyQuotes(req: AuthRequest, query: any) {
    assertCompanyUser(req);
    const companyId = req.user!.companyId!;
    const pagination = parsePagination(query);

    const where: any = { companyId };
    if (query.status) {
      where.status = query.status;
    }

    const [quotes, total] = await Promise.all([
      prisma.requestQuote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          request: {
            select: {
              id: true,
              originCity: true,
              originCountry: true,
              destinationCity: true,
              destinationCountry: true,
              weightKg: true,
              itemsCount: true,
              preferredMode: true,
              description: true,
              targetDate: true,
              status: true,
              expiresAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.requestQuote.count({ where }),
    ]);

    return createPaginatedResponse(quotes, total, pagination);
  },

  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const quoteId = session.metadata?.quoteId;
    const requestId = session.metadata?.requestId;
    if (!quoteId || !requestId) {
      throw new BadRequestError('RFQ metadata missing in checkout session');
    }

    const quote = await prisma.requestQuote.findUnique({
      where: { id: quoteId },
      include: {
        request: true,
        company: {
          select: {
            id: true,
            name: true,
            plan: true,
          },
        },
      },
    });

    if (!quote || quote.requestId !== requestId) {
      throw new NotFoundError('RFQ quote not found for webhook session');
    }

    if (quote.status === 'ACCEPTED') {
      return { quoteId, requestId, message: 'Quote already accepted' };
    }
    if (quote.status !== 'AWAITING_PAYMENT') {
      return { quoteId, requestId, message: `Quote in ${quote.status} status, skipping` };
    }

    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : undefined;
    if (!paymentIntentId) {
      throw new BadRequestError('Payment intent is missing for RFQ checkout session');
    }

    const created = await prisma.$transaction(async (tx) => {
      const quoteForUpdate = await tx.requestQuote.findUnique({
        where: { id: quote.id },
        include: {
          request: true,
          company: {
            select: {
              id: true,
              name: true,
              plan: true,
            },
          },
        },
      });

      if (!quoteForUpdate) {
        throw new NotFoundError('Quote not found during webhook processing');
      }
      if (quoteForUpdate.status === 'ACCEPTED') {
        const existing = await tx.booking.findFirst({
          where: { requestQuoteId: quoteForUpdate.id },
        });
        return { bookingId: existing?.id || null, created: false };
      }
      if (quoteForUpdate.status !== 'AWAITING_PAYMENT') {
        return { bookingId: null, created: false };
      }

      const existingBooking = await tx.booking.findFirst({
        where: { requestQuoteId: quoteForUpdate.id },
      });
      if (existingBooking) {
        return { bookingId: existingBooking.id, created: false };
      }

      const baseAmount = quoteForUpdate.priceMinor;
      const ADMIN_FEE_BPS = 1500;
      const charges = calculateBookingCharges(baseAmount, ADMIN_FEE_BPS);
      const commissionAmount = quoteForUpdate.company.plan === 'FREE' ? charges.adminFeeAmount : 0;

      const departureTime = quoteForUpdate.request.targetDate || new Date();
      const arrivalTime = addDays(departureTime, Math.max(1, quoteForUpdate.estimatedDays));
      const slot = await tx.shipmentSlot.create({
        data: {
          companyId: quoteForUpdate.companyId,
          originCountry: quoteForUpdate.request.originCountry,
          originCity: quoteForUpdate.request.originCity,
          destinationCountry: quoteForUpdate.request.destinationCountry,
          destinationCity: quoteForUpdate.request.destinationCity,
          departureTime,
          arrivalTime,
          mode: quoteForUpdate.request.preferredMode || 'AIR_FREIGHT',
          pricingModel: 'FLAT',
          flatPrice: quoteForUpdate.priceMinor / 100,
          cutoffTimeForReceivingItems: departureTime,
          status: 'PUBLISHED',
        },
      });

      const bookingId = await generateBookingId(tx);
      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          shipmentSlotId: slot.id,
          customerId: quoteForUpdate.request.customerId,
          companyId: quoteForUpdate.companyId,
          companyName: quoteForUpdate.company.name,
          calculatedPrice: quoteForUpdate.priceMinor / 100,
          baseAmount: charges.baseAmount,
          adminFeeAmount: charges.adminFeeAmount,
          processingFeeAmount: charges.processingFeeAmount,
          totalAmount: charges.totalAmount,
          commissionAmount,
          status: 'ACCEPTED',
          paymentStatus: 'PAID',
          notes: quoteForUpdate.note ?? null,
          description: quoteForUpdate.request.description ?? null,
          pickupMethod: 'PICKUP_FROM_SENDER',
          deliveryMethod: 'DELIVERED_TO_RECEIVER',
          shipmentRequestId: quoteForUpdate.requestId,
          requestQuoteId: quoteForUpdate.id,
          trackingStatus: 'BOOKED',
          trackingUpdatedAt: new Date(),
        },
      });

      const paymentId = await generatePaymentId(tx);
      await tx.payment.create({
        data: {
          id: paymentId,
          bookingId: booking.id,
          stripePaymentIntentId: paymentIntentId,
          amount: charges.totalAmount / 100,
          currency: quoteForUpdate.currency.toLowerCase(),
          status: 'SUCCEEDED',
          paidAt: new Date(),
          baseAmount: charges.baseAmount,
          adminFeeAmount: charges.adminFeeAmount,
          processingFeeAmount: charges.processingFeeAmount,
          totalAmount: charges.totalAmount,
          commissionAmount,
          metadata: {
            type: 'RFQ_QUOTE',
            requestId: quoteForUpdate.requestId,
            quoteId: quoteForUpdate.id,
            stripeSessionId: session.id,
          },
        },
      });

      await tx.requestQuote.update({
        where: { id: quoteForUpdate.id },
        data: { status: 'ACCEPTED' },
      });

      await tx.shipmentRequest.update({
        where: { id: quoteForUpdate.requestId },
        data: { status: 'ACCEPTED' },
      });

      await tx.requestQuote.updateMany({
        where: {
          requestId: quoteForUpdate.requestId,
          id: { not: quoteForUpdate.id },
          status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
        },
        data: { status: 'REJECTED' },
      });

      return { bookingId: booking.id, created: true };
    });

    if (created.bookingId) {
      await createNotification({
        userId: quote.request.customerId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment successful',
        body: `Your payment was successful and booking ${created.bookingId} has been created.`,
        metadata: {
          bookingId: created.bookingId,
          requestId: quote.requestId,
          quoteId: quote.id,
        },
      }).catch((error) => {
        console.error('[RFQ] Failed to notify customer after payment success:', error);
      });

      await createCompanyNotification(
        quote.companyId,
        'BOOKING_CREATED',
        'New booking created',
        `A new booking ${created.bookingId} has been created from an accepted RFQ quote.`,
        {
          bookingId: created.bookingId,
          requestId: quote.requestId,
          quoteId: quote.id,
        }
      ).catch((error) => {
        console.error('[RFQ] Failed to notify company after payment success:', error);
      });
    }

    return {
      quoteId: quote.id,
      requestId: quote.requestId,
      bookingId: created.bookingId,
      created: created.created,
    };
  },

  async expireOpenRequestsAndQuotes() {
    const now = new Date();

    const [requestResult, quoteResult] = await Promise.all([
      prisma.shipmentRequest.updateMany({
        where: {
          status: { in: ['OPEN', 'QUOTED'] },
          expiresAt: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      }),
      prisma.requestQuote.updateMany({
        where: {
          status: 'PENDING',
          validUntil: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      }),
    ]);

    return {
      expiredRequests: requestResult.count,
      expiredQuotes: quoteResult.count,
    };
  },
};
