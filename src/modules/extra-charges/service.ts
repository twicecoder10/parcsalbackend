import { extraChargeRepository, CreateExtraChargeData } from './repository';
import { CreateExtraChargeDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { calculateBookingCharges } from '../../utils/paymentCalculator';
import Stripe from 'stripe';
import { config } from '../../config/env';
import { createNotification, createCompanyNotification } from '../../utils/notifications';
import { checkStaffPermission } from '../../utils/permissions';
import { emailService } from '../../config/email';
import { generateExtraChargeId } from '../../utils/extraChargeId';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export const extraChargeService = {
  async createExtraCharge(req: AuthRequest, bookingId: string, dto: CreateExtraChargeDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Only company users can create extra charges
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'COMPANY_STAFF') {
      throw new ForbiddenError('Only company users can create extra charges');
    }

    if (!req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check staff permission
    await checkStaffPermission(req, 'createExtraCharge');

    // Get booking and verify it belongs to the company
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        shipmentSlot: {
          include: {
            company: true,
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

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify company owns the booking/shipment slot
    if (booking.companyId !== req.user.companyId || booking.shipmentSlot.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to create extra charges for this booking');
    }

    // Get company for plan check
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { plan: true, commissionRateBps: true },
    });

    // Calculate charges - adminFeeAmount is ALWAYS 15% (charged to customer)
    // This is separate from commission (which is only deducted from FREE plan companies)
    const ADMIN_FEE_BPS = 1500; // Always 15% admin fee charged to customer
    const charges = calculateBookingCharges(dto.baseAmountMinor, ADMIN_FEE_BPS);

    // Calculate commission amount deducted from company payout
    // For FREE plan: commissionAmount = adminFeeAmount (15% deducted from company)
    // For other plans: commissionAmount = 0 (no commission, company gets full base amount)
    const companyPlan = company?.plan || 'FREE';
    const commissionAmount = companyPlan === 'FREE' ? charges.adminFeeAmount : 0;

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (dto.expiresInHours || 48));

    // Generate custom extra charge ID
    const extraChargeId = await generateExtraChargeId();

    // Create extra charge
    const extraChargeData: CreateExtraChargeData = {
      id: extraChargeId,
      bookingId,
      companyId: req.user.companyId,
      createdByUserId: req.user.id,
      reason: dto.reason,
      description: dto.description || null,
      evidenceUrls: dto.evidenceUrls || [],
      baseAmount: charges.baseAmount,
      adminFeeAmount: charges.adminFeeAmount,
      processingFeeAmount: charges.processingFeeAmount,
      commissionAmount,
      totalAmount: charges.totalAmount,
      expiresAt,
      status: 'PENDING',
    };

    const extraCharge = await extraChargeRepository.create(extraChargeData);

    // Notify customer about the extra charge (in-app)
    await createNotification({
      userId: booking.customerId,
      type: 'EXTRA_CHARGE_REQUESTED',
      title: 'Additional Charge Requested',
      body: `A new additional charge of £${(charges.totalAmount / 100).toFixed(2)} has been requested for your booking ${bookingId}`,
      metadata: {
        bookingId,
        extraChargeId: extraCharge.id,
        reason: dto.reason,
        totalAmount: charges.totalAmount,
      },
    } as any).catch((err) => {
      console.error('Failed to create customer notification:', err);
    });

    // Send email notification to customer
    if (booking.customer.email) {
      await emailService.sendExtraChargeRequestEmail(
        booking.customer.email,
        booking.customer.fullName || 'Customer',
        bookingId,
        extraCharge.id,
        charges.totalAmount,
        'gbp',
        dto.reason,
        dto.description || null,
        expiresAt,
        {
          originCity: booking.shipmentSlot.originCity,
          originCountry: booking.shipmentSlot.originCountry,
          destinationCity: booking.shipmentSlot.destinationCity,
          destinationCountry: booking.shipmentSlot.destinationCountry,
          mode: booking.shipmentSlot.mode,
        },
        booking.shipmentSlot.company.name
      ).catch((err) => {
        console.error('Failed to send extra charge request email:', err);
      });
    }

    return extraCharge;
  },

  async listExtraCharges(req: AuthRequest, bookingId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Get booking to verify access
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        customerId: true,
        companyId: true,
      },
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify access: customer can view their own bookings, company can view their bookings
    const isCustomer = req.user.role === 'CUSTOMER' && booking.customerId === req.user.id;
    const isCompanyOwner = req.user.companyId && booking.companyId === req.user.companyId;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    if (!isCustomer && !isCompanyOwner && !isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to view extra charges for this booking');
    }

    // Expire old pending charges before returning list
    await extraChargeRepository.expireOldPendingCharges().catch((err) => {
      console.error('Failed to expire old pending charges:', err);
    });

    const extraCharges = await extraChargeRepository.findByBookingId(bookingId);
    return extraCharges;
  },

  async payExtraCharge(req: AuthRequest, bookingId: string, extraChargeId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    if (req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can pay extra charges');
    }

    // Get extra charge with booking and company details
    const extraCharge = await extraChargeRepository.findById(extraChargeId);

    if (!extraCharge) {
      throw new NotFoundError('Extra charge not found');
    }

    if (extraCharge.bookingId !== bookingId) {
      throw new BadRequestError('Extra charge does not belong to this booking');
    }

    // Verify booking belongs to customer
    if (extraCharge.booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to pay this extra charge');
    }

    // Validate status and expiration
    if (extraCharge.status !== 'PENDING') {
      throw new BadRequestError(`Cannot pay extra charge with status: ${extraCharge.status}`);
    }

    if (new Date() >= extraCharge.expiresAt) {
      throw new BadRequestError('Extra charge has expired');
    }

    // Verify company has Stripe Connect set up
    if (!extraCharge.company.stripeAccountId || !extraCharge.company.chargesEnabled) {
      throw new BadRequestError('Company payment setup is not complete. Please contact the company.');
    }

    // Calculate transfer amount: baseAmount minus commission for FREE plan
    // For FREE plan: commissionAmount is deducted from company payout
    // For other plans: company receives full baseAmount (commissionAmount = 0)
    // TypeScript note: commissionAmount field exists in schema - using bracket notation until types refresh
    const commissionAmount = (extraCharge as any)['commissionAmount'] ?? 0;
    const transferAmount = commissionAmount 
      ? extraCharge.baseAmount - commissionAmount 
      : extraCharge.baseAmount;

    // Create Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Additional Charge - ${extraCharge.reason}`,
              description: extraCharge.description || `Additional charge for booking ${bookingId}`,
            },
            unit_amount: extraCharge.totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.frontendUrl}/bookings/${bookingId}?extraCharge=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/bookings/${bookingId}?extraCharge=cancelled`,
      metadata: {
        bookingId,
        extraChargeId: extraCharge.id,
        type: 'EXTRA_CHARGE',
        reason: extraCharge.reason,
      },
      client_reference_id: extraCharge.id,
      payment_intent_data: {
        transfer_data: {
          destination: extraCharge.company.stripeAccountId,
          amount: transferAmount, // Company receives baseAmount minus commission (for FREE plan)
        },
        metadata: {
          bookingId,
          extraChargeId: extraCharge.id,
          type: 'EXTRA_CHARGE',
          reason: extraCharge.reason,
          companyId: extraCharge.companyId,
          baseAmount: extraCharge.baseAmount.toString(),
          adminFeeAmount: extraCharge.adminFeeAmount.toString(),
          processingFeeAmount: extraCharge.processingFeeAmount.toString(),
          commissionAmount: commissionAmount.toString(),
          totalAmount: extraCharge.totalAmount.toString(),
          transferAmount: transferAmount.toString(),
          commissionDeducted: commissionAmount.toString(),
        },
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update extra charge with session ID
    await extraChargeRepository.updateStatus(extraChargeId, 'PENDING', {
      stripeSessionId: session.id,
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  },

  async declineExtraCharge(req: AuthRequest, bookingId: string, extraChargeId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    if (req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can decline extra charges');
    }

    // Get extra charge
    const extraCharge = await extraChargeRepository.findById(extraChargeId);

    if (!extraCharge) {
      throw new NotFoundError('Extra charge not found');
    }

    if (extraCharge.bookingId !== bookingId) {
      throw new BadRequestError('Extra charge does not belong to this booking');
    }

    // Verify booking belongs to customer
    if (extraCharge.booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to decline this extra charge');
    }

    // Validate status
    if (extraCharge.status !== 'PENDING') {
      throw new BadRequestError(`Cannot decline extra charge with status: ${extraCharge.status}`);
    }

    // Update status
    const updated = await extraChargeRepository.updateStatus(extraChargeId, 'DECLINED', {
      declinedAt: new Date(),
    });

    // Notify company
    if (extraCharge.companyId) {
      await createCompanyNotification(
        extraCharge.companyId,
        'EXTRA_CHARGE_DECLINED' as any,
        'Extra Charge Declined',
        `Customer declined an extra charge of £${(extraCharge.totalAmount / 100).toFixed(2)} for booking ${bookingId}`,
        {
          bookingId,
          extraChargeId: extraCharge.id,
          reason: extraCharge.reason,
        }
      ).catch((err) => {
        console.error('Failed to create company notification:', err);
      });
    }

    return updated;
  },

  async cancelExtraCharge(req: AuthRequest, bookingId: string, extraChargeId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Only company users can cancel extra charges
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'COMPANY_STAFF') {
      throw new ForbiddenError('Only company users can cancel extra charges');
    }

    if (!req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check staff permission
    await checkStaffPermission(req, 'cancelExtraCharge');

    // Get extra charge
    const extraCharge = await extraChargeRepository.findById(extraChargeId);

    if (!extraCharge) {
      throw new NotFoundError('Extra charge not found');
    }

    if (extraCharge.bookingId !== bookingId) {
      throw new BadRequestError('Extra charge does not belong to this booking');
    }

    // Verify company owns the extra charge
    if (extraCharge.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to cancel this extra charge');
    }

    // Validate status - only PENDING and unpaid charges can be cancelled
    if (extraCharge.status !== 'PENDING') {
      throw new BadRequestError(`Cannot cancel extra charge with status: ${extraCharge.status}`);
    }

    // Update status
    const updated = await extraChargeRepository.updateStatus(extraChargeId, 'CANCELLED', {
      cancelledAt: new Date(),
    });

    // Notify customer
    await createNotification({
      userId: extraCharge.booking.customerId,
      type: 'EXTRA_CHARGE_CANCELLED' as any,
      title: 'Extra Charge Cancelled',
      body: `An extra charge of £${(extraCharge.totalAmount / 100).toFixed(2)} has been cancelled for your booking ${bookingId}`,
      metadata: {
        bookingId,
        extraChargeId: extraCharge.id,
      },
    }).catch((err) => {
      console.error('Failed to create customer notification:', err);
    });

    return updated;
  },
};

