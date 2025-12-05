import Stripe from 'stripe';
import { config } from '../../config/env';
import { paymentRepository, CreatePaymentData } from './repository';
import { CreateCheckoutSessionDto, ListCompanyPaymentsDto, GetPaymentStatsDto, ProcessRefundDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { createNotification, createCompanyNotification } from '../../utils/notifications';
import { emailService } from '../../config/email';
import { generatePaymentId } from '../../utils/paymentId';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export const paymentService = {
  async createCheckoutSession(req: AuthRequest, dto: CreateCheckoutSessionDto) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can create checkout sessions');
    }

    // Get booking
    const booking = await prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        shipmentSlot: {
          include: {
            company: true,
          },
        },
        customer: true,
      },
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership
    if (booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to pay for this booking');
    }

    // Check if already paid
    if (booking.paymentStatus === 'PAID') {
      throw new BadRequestError('Booking is already paid');
    }

    // Check if payment already exists
    const existingPayment = await paymentRepository.findByBookingId(dto.bookingId);
    if (existingPayment && existingPayment.status === 'SUCCEEDED') {
      throw new BadRequestError('Payment already completed');
    }

    const amountInCents = Math.round(Number(booking.calculatedPrice) * 100);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Shipment Booking - ${booking.shipmentSlot.originCity} to ${booking.shipmentSlot.destinationCity}`,
              description: `Booking ID: ${booking.id}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.frontendUrl}/bookings/${booking.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontendUrl}/bookings/${booking.id}?payment=cancelled`,
      metadata: {
        bookingId: booking.id,
        customerId: booking.customerId,
      },
      client_reference_id: booking.id,
      // Add metadata to payment intent for better tracking
      payment_intent_data: {
        metadata: {
          bookingId: booking.id,
          customerId: booking.customerId,
        },
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  },

  /**
   * Helper function to process a successful payment
   */
  async processSuccessfulPayment(bookingId: string, paymentIntentId: string) {
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Get booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Skip if already paid
    if (booking.paymentStatus === 'PAID') {
      return { message: 'Booking already paid', bookingId };
    }

    // Check payment intent status
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestError(`Payment intent status is ${paymentIntent.status}, not succeeded`);
    }

    // Create or update payment record
    const existingPayment = await paymentRepository.findByBookingId(bookingId);
    if (existingPayment) {
      // Update existing payment record
      await paymentRepository.updateStatus(existingPayment.id, 'SUCCEEDED');
      await paymentRepository.updateBookingPaymentStatus(bookingId, 'PAID');
    } else {
      // Generate custom payment ID
      const paymentId = await generatePaymentId();
      
      // Create new payment record
      const paymentData: CreatePaymentData = {
        id: paymentId,
        bookingId,
        stripePaymentIntentId: paymentIntentId,
        amount: Number(paymentIntent.amount) / 100,
        currency: paymentIntent.currency,
        status: 'SUCCEEDED',
      };
      await paymentRepository.create(paymentData);
      await paymentRepository.updateBookingPaymentStatus(bookingId, 'PAID');
    }

    // Get booking details for notifications and email
    const bookingWithDetails = await prisma.booking.findUnique({
      where: { id: bookingId },
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
            id: true,
            name: true,
          },
        },
      },
    });

    if (bookingWithDetails) {
      // Notify customer
      await createNotification({
        userId: bookingWithDetails.customerId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Successful',
        body: `Your payment of £${(Number(paymentIntent.amount) / 100).toFixed(2)} for booking from ${bookingWithDetails.shipmentSlot.originCity} to ${bookingWithDetails.shipmentSlot.destinationCity} has been processed successfully`,
        metadata: {
          bookingId,
          paymentIntentId,
          amount: Number(paymentIntent.amount) / 100,
        },
      }).catch((err) => {
        console.error('Failed to create customer payment notification:', err);
      });

      // Notify company
      await createCompanyNotification(
        bookingWithDetails.companyId,
        'PAYMENT_SUCCESS',
        'Payment Received',
        `Payment of £${(Number(paymentIntent.amount) / 100).toFixed(2)} received for booking ${bookingId}`,
        {
          bookingId,
          paymentIntentId,
          amount: Number(paymentIntent.amount) / 100,
        }
      ).catch((err) => {
        console.error('Failed to create company payment notification:', err);
      });

      // Send payment receipt email if customer has email notifications enabled
      if (bookingWithDetails.customer.notificationEmail) {
        await emailService.sendPaymentReceiptEmail(
          bookingWithDetails.customer.email,
          bookingWithDetails.customer.fullName,
          bookingId,
          Number(paymentIntent.amount) / 100,
          paymentIntent.currency,
          paymentIntentId,
          {
            originCity: bookingWithDetails.shipmentSlot.originCity,
            originCountry: bookingWithDetails.shipmentSlot.originCountry,
            destinationCity: bookingWithDetails.shipmentSlot.destinationCity,
            destinationCountry: bookingWithDetails.shipmentSlot.destinationCountry,
            departureTime: bookingWithDetails.shipmentSlot.departureTime,
            arrivalTime: bookingWithDetails.shipmentSlot.arrivalTime,
            mode: bookingWithDetails.shipmentSlot.mode,
          },
          bookingWithDetails.company.name
        ).catch((err) => {
          console.error('Failed to send payment receipt email:', err);
        });
      }
    }

    return { message: 'Payment processed successfully', bookingId };
  },

  /**
   * Manually sync payment status from Stripe
   * Useful if webhook failed or payment status needs to be checked
   */
  async syncPaymentStatus(req: AuthRequest, bookingId: string, sessionId?: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Get booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: true,
      },
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Verify ownership (customer can only sync their own bookings)
    if (req.user.role === 'CUSTOMER' && booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to sync this booking');
    }

    // If already paid, return early
    if (booking.paymentStatus === 'PAID') {
      return {
        message: 'Booking is already marked as paid',
        bookingId,
        paymentStatus: booking.paymentStatus,
      };
    }

    // If session_id is provided (from Stripe redirect), check it first - this is the fastest path
    const sessionIdToCheck = sessionId || ((req as any).query?.session_id as string);
    if (sessionIdToCheck) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionIdToCheck);
        
        // Verify this session is for the correct booking
        const sessionBookingId = session.metadata?.bookingId || session.client_reference_id;
        if (sessionBookingId === bookingId && session.payment_intent) {
          const paymentIntentId = typeof session.payment_intent === 'string' 
            ? session.payment_intent 
            : session.payment_intent.id;
          
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (paymentIntent.status === 'succeeded') {
            // Process the payment
            await this.processSuccessfulPayment(bookingId, paymentIntentId);
            return {
              message: 'Payment found and synced successfully via session',
              bookingId,
              paymentStatus: 'PAID' as const,
              stripeStatus: paymentIntent.status,
            };
          }

          return {
            message: `Payment intent found but status is ${paymentIntent.status}`,
            bookingId,
            paymentStatus: booking.paymentStatus,
            stripeStatus: paymentIntent.status,
          };
        }
      } catch (error: any) {
        console.error('Error retrieving checkout session:', error);
        // Continue to other checks if session retrieval fails
      }
    }

    // If payment record exists, check Stripe status
    if (booking.payment) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          booking.payment.stripePaymentIntentId
        );

        if (paymentIntent.status === 'succeeded') {
          // Payment succeeded in Stripe but not updated in our DB
          await paymentRepository.updateStatus(booking.payment.id, 'SUCCEEDED');
          await paymentRepository.updateBookingPaymentStatus(bookingId, 'PAID');
          
          // Trigger notifications and email
          const bookingWithDetails = await prisma.booking.findUnique({
            where: { id: bookingId },
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
                  id: true,
                  name: true,
                },
              },
            },
          });

          if (bookingWithDetails) {
            await createNotification({
              userId: bookingWithDetails.customerId,
              type: 'PAYMENT_SUCCESS',
              title: 'Payment Successful',
              body: `Your payment for booking from ${bookingWithDetails.shipmentSlot.originCity} to ${bookingWithDetails.shipmentSlot.destinationCity} has been processed successfully`,
              metadata: {
                bookingId,
                paymentIntentId: paymentIntent.id,
                amount: Number(booking.payment.amount),
              },
            }).catch((err) => {
              console.error('Failed to create customer payment notification:', err);
            });

            if (bookingWithDetails.customer.notificationEmail) {
              await emailService.sendPaymentReceiptEmail(
                bookingWithDetails.customer.email,
                bookingWithDetails.customer.fullName,
                bookingId,
                Number(booking.payment.amount),
                booking.payment.currency,
                paymentIntent.id,
                {
                  originCity: bookingWithDetails.shipmentSlot.originCity,
                  originCountry: bookingWithDetails.shipmentSlot.originCountry,
                  destinationCity: bookingWithDetails.shipmentSlot.destinationCity,
                  destinationCountry: bookingWithDetails.shipmentSlot.destinationCountry,
                  departureTime: bookingWithDetails.shipmentSlot.departureTime,
                  arrivalTime: bookingWithDetails.shipmentSlot.arrivalTime,
                  mode: bookingWithDetails.shipmentSlot.mode,
                },
                bookingWithDetails.company.name
              ).catch((err) => {
                console.error('Failed to send payment receipt email:', err);
              });
            }
          }

          return {
            message: 'Payment status synced - payment is confirmed',
            bookingId,
            paymentStatus: 'PAID' as const,
            stripeStatus: paymentIntent.status,
          };
        }

        return {
          message: `Payment status in Stripe: ${paymentIntent.status}`,
          bookingId,
          paymentStatus: booking.paymentStatus,
          stripeStatus: paymentIntent.status,
        };
      } catch (error: any) {
        throw new BadRequestError(`Failed to retrieve payment intent: ${error.message}`);
      }
    }

    // No payment record exists - check if there are any checkout sessions for this booking
    // This is a fallback - normally payment record should exist if checkout was created
    try {
      // First, try to find by bookingId in metadata or client_reference_id
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
      });

      const relevantSession = sessions.data.find(
        (session) =>
          (session.metadata?.bookingId === bookingId ||
            session.client_reference_id === bookingId) &&
          session.payment_intent
      );

      if (relevantSession && relevantSession.payment_intent) {
        const paymentIntentId = typeof relevantSession.payment_intent === 'string'
          ? relevantSession.payment_intent
          : relevantSession.payment_intent.id;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
          // Process the payment
          await this.processSuccessfulPayment(bookingId, paymentIntentId);
          return {
            message: 'Payment found and synced successfully',
            bookingId,
            paymentStatus: 'PAID' as const,
            stripeStatus: paymentIntent.status,
          };
        }

        return {
          message: `Payment intent found but status is ${paymentIntent.status}`,
          bookingId,
          paymentStatus: booking.paymentStatus,
          stripeStatus: paymentIntent.status,
        };
      }
    } catch (error: any) {
      console.error('Error checking checkout sessions:', error);
    }

    return {
      message: 'No payment record or checkout session found for this booking',
      bookingId,
      paymentStatus: booking.paymentStatus,
    };
  },

  async handleStripeWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
    } catch (err: any) {
      throw new BadRequestError(`Webhook signature verification failed: ${err.message}`);
    }

    console.log(`[Payment Webhook] Received event: ${event.type}, ID: ${event.id}`);

    // Handle payment success via checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log(`[Payment Webhook] checkout.session.completed - Session ID: ${session.id}`);
      console.log(`[Payment Webhook] Has subscription: ${!!session.subscription}, Has payment_intent: ${!!session.payment_intent}`);
      
      // Check if this is a subscription checkout
      const subscriptionId = session.subscription as string;
      if (subscriptionId) {
        // This is a subscription checkout - handle it here since it was sent to payment webhook
        console.log(`[Payment Webhook] Detected subscription checkout, processing in payment webhook`);
        try {
          const companyId = session.metadata?.companyId || session.client_reference_id;
          const planId = session.metadata?.planId;

          if (!companyId || !planId) {
            console.error(`[Payment Webhook] Company ID or Plan ID not found in subscription checkout metadata`);
            return { received: true, message: 'Subscription checkout received but Company ID or Plan ID not found', eventType: event.type };
          }

          // Import subscription service to handle the subscription creation
          const { subscriptionRepository } = await import('../subscriptions/repository');
          const { onboardingRepository } = await import('../onboarding/repository');
          
          // Check if subscription already exists
          const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
          if (existingSubscription) {
            console.log(`[Payment Webhook] Subscription ${subscriptionId} already exists, updating onboarding if needed`);
            // Update onboarding even if subscription exists (in case it wasn't updated before)
            try {
              await onboardingRepository.updateCompanyOnboardingStep(companyId, 'payment_setup', true);
              console.log(`[Payment Webhook] Updated onboarding step for company ${companyId}`);
            } catch (onboardingErr: any) {
              console.error(`[Payment Webhook] Failed to update onboarding:`, onboardingErr.message);
            }
            return { received: true, message: 'Subscription already exists', eventType: event.type, subscriptionId };
          }

          // Retrieve subscription from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId = subscription.customer as string;

          // Get plan
          const plan = await prisma.companyPlan.findUnique({
            where: { id: planId },
          });

          if (!plan) {
            console.error(`[Payment Webhook] Plan ${planId} not found`);
            return { received: true, message: 'Plan not found', eventType: event.type };
          }

          // Create subscription record
          const subscriptionData = {
            companyId,
            companyPlanId: planId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: 'ACTIVE' as const,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          };

          const created = await subscriptionRepository.create(subscriptionData);
          await subscriptionRepository.updateCompanyPlan(
            companyId,
            planId,
            new Date(subscription.current_period_end * 1000)
          );

          // Mark payment_setup onboarding step as complete
          let onboardingUpdated = false;
          try {
            console.log(`[Payment Webhook] Updating onboarding step 'payment_setup' for company ${companyId}`);
            await onboardingRepository.updateCompanyOnboardingStep(companyId, 'payment_setup', true);
            onboardingUpdated = true;
            console.log(`[Payment Webhook] Successfully updated onboarding step for company ${companyId}`);
          } catch (err: any) {
            console.error(`[Payment Webhook] Failed to update onboarding step:`, {
              error: err.message,
              stack: err.stack,
              companyId,
            });
            // Retry once
            try {
              await new Promise(resolve => setTimeout(resolve, 1000));
              await onboardingRepository.updateCompanyOnboardingStep(companyId, 'payment_setup', true);
              onboardingUpdated = true;
              console.log(`[Payment Webhook] Successfully updated onboarding step on retry for company ${companyId}`);
            } catch (retryErr: any) {
              console.error(`[Payment Webhook] Retry also failed:`, retryErr.message);
            }
          }

          // Trigger user onboarding recalculation
          const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { adminId: true },
          });

          if (company?.adminId) {
            try {
              await onboardingRepository.updateUserOnboardingStep(company.adminId, 'profile_completion', true);
              console.log(`[Payment Webhook] Successfully updated user onboarding for admin ${company.adminId}`);
            } catch (err: any) {
              console.error(`[Payment Webhook] Failed to update user onboarding:`, err.message);
            }
          }

          console.log(`[Payment Webhook] Subscription created successfully: ${created.id}`);
          return { 
            received: true, 
            message: 'Subscription checkout processed successfully',
            eventType: event.type,
            subscriptionId: created.id,
            onboardingUpdated
          };
        } catch (err: any) {
          console.error(`[Payment Webhook] Error processing subscription checkout:`, {
            error: err.message,
            stack: err.stack,
            sessionId: session.id,
          });
          // Don't throw - return success to prevent Stripe retries
          // The subscription webhook should handle it if configured
          return { 
            received: true, 
            message: `Subscription checkout received but processing failed: ${err.message}`,
            eventType: event.type,
            error: err.message
          };
        }
      }

      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      console.log(`[Payment Webhook] Booking ID from metadata: ${bookingId}`);

      if (!bookingId) {
        console.error(`[Payment Webhook] Booking ID not found in session metadata or client_reference_id`);
        throw new BadRequestError('Booking ID not found in session metadata');
      }

      // Get payment intent
      const paymentIntentId = session.payment_intent as string;
      if (!paymentIntentId) {
        console.error(`[Payment Webhook] Payment intent ID not found in session`);
        throw new BadRequestError('Payment intent ID not found');
      }

      console.log(`[Payment Webhook] Processing payment - Booking: ${bookingId}, PaymentIntent: ${paymentIntentId}`);
      try {
        const result = await this.processSuccessfulPayment(bookingId, paymentIntentId);
        console.log(`[Payment Webhook] Payment processed successfully for booking ${bookingId}`);
        return { received: true, message: 'Payment processed successfully', eventType: event.type, bookingId, result };
      } catch (error: any) {
        // Log detailed error
        console.error(`[Payment Webhook] Error processing checkout.session.completed:`, {
          error: error.message,
          stack: error.stack,
          bookingId,
          paymentIntentId,
        });
        // Re-throw so Stripe knows to retry
        throw error;
      }
    }

    // Handle payment success via payment_intent.succeeded (backup/reliable event)
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      console.log(`[Payment Webhook] payment_intent.succeeded - PaymentIntent ID: ${paymentIntent.id}`);
      console.log(`[Payment Webhook] PaymentIntent metadata:`, paymentIntent.metadata);
      
      // Try to find booking by payment intent ID
      const existingPayment = await paymentRepository.findByStripePaymentIntentId(paymentIntent.id);
      
      if (existingPayment) {
        console.log(`[Payment Webhook] Found existing payment record for booking ${existingPayment.bookingId}`);
        // Payment record exists, ensure both payment and booking status are correct
        let needsUpdate = false;
        
        if (existingPayment.status !== 'SUCCEEDED') {
          await paymentRepository.updateStatus(existingPayment.id, 'SUCCEEDED');
          needsUpdate = true;
          console.log(`[Payment Webhook] Updated payment status to SUCCEEDED`);
        }
        
        // Always check and update booking paymentStatus to ensure consistency
        const booking = await prisma.booking.findUnique({
          where: { id: existingPayment.bookingId },
          select: { paymentStatus: true },
        });
        
        if (booking && booking.paymentStatus !== 'PAID') {
          await paymentRepository.updateBookingPaymentStatus(existingPayment.bookingId, 'PAID');
          needsUpdate = true;
          console.log(`[Payment Webhook] Updated booking payment status to PAID`);
        }
        
        // If we updated something, trigger notifications and email
        if (needsUpdate) {
          // Get booking details for notifications and email
          const bookingWithDetails = await prisma.booking.findUnique({
            where: { id: existingPayment.bookingId },
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
                  id: true,
                  name: true,
                },
              },
            },
          });

          if (bookingWithDetails) {
            // Send notifications and email
            await createNotification({
              userId: bookingWithDetails.customerId,
              type: 'PAYMENT_SUCCESS',
              title: 'Payment Successful',
              body: `Your payment for booking from ${bookingWithDetails.shipmentSlot.originCity} to ${bookingWithDetails.shipmentSlot.destinationCity} has been processed successfully`,
              metadata: {
                bookingId: existingPayment.bookingId,
                paymentIntentId: paymentIntent.id,
                amount: Number(existingPayment.amount),
              },
            }).catch((err) => {
              console.error('Failed to create customer payment notification:', err);
            });

            // Send payment receipt email if customer has email notifications enabled
            if (bookingWithDetails.customer.notificationEmail) {
              await emailService.sendPaymentReceiptEmail(
                bookingWithDetails.customer.email,
                bookingWithDetails.customer.fullName,
                existingPayment.bookingId,
                Number(existingPayment.amount),
                existingPayment.currency,
                paymentIntent.id,
                {
                  originCity: bookingWithDetails.shipmentSlot.originCity,
                  originCountry: bookingWithDetails.shipmentSlot.originCountry,
                  destinationCity: bookingWithDetails.shipmentSlot.destinationCity,
                  destinationCountry: bookingWithDetails.shipmentSlot.destinationCountry,
                  departureTime: bookingWithDetails.shipmentSlot.departureTime,
                  arrivalTime: bookingWithDetails.shipmentSlot.arrivalTime,
                  mode: bookingWithDetails.shipmentSlot.mode,
                },
                bookingWithDetails.company.name
              ).catch((err) => {
                console.error('Failed to send payment receipt email:', err);
              });
            }
          }
        }
        
        return { received: true, message: 'Payment intent succeeded - status updated', eventType: event.type, bookingId: existingPayment.bookingId };
      }

      // If no payment record exists, try to find booking from metadata
      // Note: This is a fallback - ideally checkout.session.completed should have created the record
      const bookingId = paymentIntent.metadata?.bookingId;
      console.log(`[Payment Webhook] No existing payment record, trying bookingId from metadata: ${bookingId}`);
      
      if (bookingId) {
        try {
          await this.processSuccessfulPayment(bookingId, paymentIntent.id);
          console.log(`[Payment Webhook] Payment processed from payment_intent.succeeded for booking ${bookingId}`);
          return { received: true, message: 'Payment processed from payment_intent.succeeded', eventType: event.type, bookingId };
        } catch (error: any) {
          console.error(`[Payment Webhook] Error processing payment_intent.succeeded:`, error);
          // Don't throw - this is a backup event, main event should have handled it
          return { received: true, message: 'Payment intent succeeded but booking processing failed', eventType: event.type, error: error.message };
        }
      }

      console.log(`[Payment Webhook] Payment intent succeeded but no booking ID in metadata`);
      return { received: true, message: 'Payment intent succeeded but no booking ID in metadata', eventType: event.type };
    }

    // Handle charge.succeeded (another backup event)
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;
      
      console.log(`[Payment Webhook] charge.succeeded - Charge ID: ${charge.id}, PaymentIntent: ${paymentIntentId}`);
      
      if (!paymentIntentId) {
        return { received: true, message: 'Charge succeeded but no payment intent ID', eventType: event.type };
      }

      // Try to find payment by payment intent ID
      const existingPayment = await paymentRepository.findByStripePaymentIntentId(paymentIntentId);
      
      if (existingPayment) {
        if (existingPayment.status !== 'SUCCEEDED') {
          await paymentRepository.updateStatus(existingPayment.id, 'SUCCEEDED');
          await paymentRepository.updateBookingPaymentStatus(existingPayment.bookingId, 'PAID');
          console.log(`[Payment Webhook] Updated payment status from charge.succeeded`);
        } else {
          // Payment status is already SUCCEEDED, but check if booking paymentStatus needs updating
          const booking = await prisma.booking.findUnique({
            where: { id: existingPayment.bookingId },
            select: { paymentStatus: true },
          });
          if (booking && booking.paymentStatus !== 'PAID') {
            await paymentRepository.updateBookingPaymentStatus(existingPayment.bookingId, 'PAID');
            console.log(`[Payment Webhook] Updated booking payment status to PAID from charge.succeeded`);
          }
        }
        return { received: true, message: 'Charge succeeded - payment status updated', eventType: event.type, bookingId: existingPayment.bookingId };
      }

      // Try to get booking from payment intent metadata
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const bookingId = paymentIntent.metadata?.bookingId;
        
        if (bookingId) {
          await this.processSuccessfulPayment(bookingId, paymentIntentId);
          console.log(`[Payment Webhook] Payment processed from charge.succeeded for booking ${bookingId}`);
          return { received: true, message: 'Payment processed from charge.succeeded', eventType: event.type, bookingId };
        }
      } catch (error: any) {
        console.error(`[Payment Webhook] Error processing charge.succeeded:`, error);
      }

      return { received: true, message: 'Charge succeeded but no payment record or booking found', eventType: event.type };
    }

    // Handle payment failed
    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const payment = await paymentRepository.findByStripePaymentIntentId(paymentIntent.id);

      if (payment) {
        await paymentRepository.updateStatus(payment.id, 'FAILED');

        // Notify customer about payment failure
        const booking = await prisma.booking.findUnique({
          where: { id: payment.bookingId },
          include: {
            shipmentSlot: {
              select: {
                originCity: true,
                destinationCity: true,
              },
            },
          },
        });

        if (booking) {
          await createNotification({
            userId: booking.customerId,
            type: 'PAYMENT_FAILED',
            title: 'Payment Failed',
            body: `Your payment for booking from ${booking.shipmentSlot.originCity} to ${booking.shipmentSlot.destinationCity} has failed. Please try again.`,
            metadata: {
              bookingId: payment.bookingId,
              paymentIntentId: paymentIntent.id,
            },
          }).catch((err) => {
            console.error('Failed to create payment failure notification:', err);
          });
        }

        return { received: true, message: 'Payment failed - status updated', eventType: event.type };
      }

      return { received: true, message: 'Payment failed but no payment record found', eventType: event.type };
    }

    // Handle refunds - check event type as string to avoid type narrowing issues
    const eventType = event.type as string;
    if (eventType === 'charge.refunded' || eventType === 'payment_intent.refunded') {
      let paymentIntentId: string;
      
      if (eventType === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        paymentIntentId = charge.payment_intent as string;
      } else {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        paymentIntentId = paymentIntent.id;
      }

      if (paymentIntentId) {
        const payment = await paymentRepository.findByStripePaymentIntentId(paymentIntentId);
        if (payment) {
          await paymentRepository.updateStatus(payment.id, 'REFUNDED');
          await paymentRepository.updateBookingPaymentStatus(payment.bookingId, 'REFUNDED');

          // Notify customer about refund
          const booking = await prisma.booking.findUnique({
            where: { id: payment.bookingId },
            include: {
              shipmentSlot: {
                select: {
                  originCity: true,
                  destinationCity: true,
                },
              },
            },
          });

          if (booking) {
            await createNotification({
              userId: booking.customerId,
              type: 'PAYMENT_REFUNDED',
              title: 'Payment Refunded',
              body: `Your payment of £${Number(payment.amount).toFixed(2)} for booking from ${booking.shipmentSlot.originCity} to ${booking.shipmentSlot.destinationCity} has been refunded`,
              metadata: {
                bookingId: payment.bookingId,
                paymentId: payment.id,
                refundedAmount: Number(payment.refundedAmount || 0),
              },
            }).catch((err) => {
              console.error('Failed to create refund notification:', err);
            });
          }

          return { received: true, message: 'Refund processed', eventType: event.type };
        }
      }

      return { received: true, message: 'Refund event received but payment not found', eventType: event.type };
    }

    // Handle payment_intent.created (just acknowledge, don't process)
    if (event.type === 'payment_intent.created') {
      console.log(`[Payment Webhook] payment_intent.created - PaymentIntent ID: ${(event.data.object as Stripe.PaymentIntent).id}`);
      return { received: true, message: 'Payment intent created - no action needed', eventType: event.type };
    }

    // Handle subscription-related events that are sent to payment webhook
    // This handles cases where Stripe sends subscription events to the payment webhook endpoint
    const subscriptionEventTypes = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ];
    
    if (subscriptionEventTypes.includes(event.type)) {
      console.log(`[Payment Webhook] Detected subscription event ${event.type}, handling in payment webhook`);
      try {
        // Process the subscription event directly
        // Since the event is already verified with payment secret, we'll process it
        if (event.type === 'customer.subscription.updated') {
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`[Payment Webhook] Processing customer.subscription.updated for subscription ${subscription.id}`);
          
          // Import subscription repository to handle the update
          const { subscriptionRepository } = await import('../subscriptions/repository');
          const { onboardingRepository } = await import('../onboarding/repository');
          
          const dbSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscription.id);
          
          if (dbSubscription) {
            await subscriptionRepository.updateStatus(
              dbSubscription.id,
              subscription.status === 'active' ? 'ACTIVE' : subscription.status === 'past_due' ? 'PAST_DUE' : 'CANCELLED',
              new Date(subscription.current_period_start * 1000),
              new Date(subscription.current_period_end * 1000)
            );

            if (subscription.status === 'active') {
              await subscriptionRepository.updateCompanyPlan(
                dbSubscription.companyId,
                dbSubscription.companyPlanId,
                new Date(subscription.current_period_end * 1000)
              );
              
              // Update onboarding if subscription becomes active
              try {
                await onboardingRepository.updateCompanyOnboardingStep(
                  dbSubscription.companyId,
                  'payment_setup',
                  true
                );
                console.log(`[Payment Webhook] Updated onboarding step for company ${dbSubscription.companyId}`);
              } catch (onboardingErr: any) {
                console.error(`[Payment Webhook] Failed to update onboarding:`, onboardingErr.message);
                // Retry once
                try {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await onboardingRepository.updateCompanyOnboardingStep(
                    dbSubscription.companyId,
                    'payment_setup',
                    true
                  );
                  console.log(`[Payment Webhook] Successfully updated onboarding on retry for company ${dbSubscription.companyId}`);
                } catch (retryErr: any) {
                  console.error(`[Payment Webhook] Retry also failed:`, retryErr.message);
                }
              }
            }

            console.log(`[Payment Webhook] Subscription updated successfully: ${dbSubscription.id}`);
            return { 
              received: true, 
              message: 'Subscription updated successfully',
              eventType: event.type,
              subscriptionId: dbSubscription.id
            };
          } else {
            console.warn(`[Payment Webhook] Subscription ${subscription.id} not found in database`);
            return { 
              received: true, 
              message: 'Subscription updated event received but subscription not found in database',
              eventType: event.type,
              subscriptionId: subscription.id
            };
          }
        }
        
        // For other subscription event types, just acknowledge
        return { 
          received: true, 
          message: `Subscription event ${event.type} received and acknowledged`,
          eventType: event.type
        };
      } catch (err: any) {
        console.error(`[Payment Webhook] Error handling subscription event:`, {
          error: err.message,
          stack: err.stack,
          eventType: event.type,
        });
        // Return success to prevent Stripe retries
        return { 
          received: true, 
          message: `Subscription event ${event.type} received but processing failed`,
          eventType: event.type,
          error: err.message
        };
      }
    }

    // Return success for unhandled events (Stripe will retry if we return error)
    // Only handle the events we care about, ignore others
    console.log(`[Payment Webhook] Unhandled event type: ${event.type}`);
    return { received: true, message: `Event ${event.type} received but not handled`, eventType: event.type };
  },

  // Company Payment Management Methods
  async getCompanyPayments(req: AuthRequest, query: ListCompanyPaymentsDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const pagination = parsePagination(query);
    const companyId = req.user.companyId;

    // Parse dates
    const dateFrom = query.dateFrom ? new Date(query.dateFrom + 'T00:00:00Z') : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo + 'T00:00:00Z') : undefined;

    const { payments, total } = await paymentRepository.findByCompanyId(companyId, {
      ...pagination,
      status: query.status as any,
      dateFrom,
      dateTo,
      bookingId: query.bookingId,
      search: query.search,
    });

    // Transform payments to match API response format
    const transformedPayments = payments.map((payment) => ({
      id: payment.id,
      bookingId: payment.bookingId,
      booking: {
        id: payment.booking.id,
        customer: {
          id: payment.booking.customer.id,
          fullName: payment.booking.customer.fullName,
          email: payment.booking.customer.email,
        },
        shipmentSlot: {
          id: payment.booking.shipmentSlot.id,
          originCity: payment.booking.shipmentSlot.originCity,
          originCountry: payment.booking.shipmentSlot.originCountry,
          destinationCity: payment.booking.shipmentSlot.destinationCity,
          destinationCountry: payment.booking.shipmentSlot.destinationCountry,
        },
      },
      amount: Number(payment.amount),
      currency: payment.currency.toUpperCase(),
      status: payment.status,
      paymentMethod: payment.paymentMethod || 'card',
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId || null,
      refundedAmount: Number(payment.refundedAmount || 0),
      refundReason: payment.refundReason || null,
      metadata: payment.metadata || {},
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() || null,
      refundedAt: payment.refundedAt?.toISOString() || null,
    }));

    return createPaginatedResponse(transformedPayments, total, pagination);
  },

  async getCompanyPaymentById(req: AuthRequest, paymentId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    // Verify the payment belongs to the company
    if (payment.booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to view this payment');
    }

    return {
      id: payment.id,
      bookingId: payment.bookingId,
      booking: {
        id: payment.booking.id,
        customer: {
          id: payment.booking.customer.id,
          fullName: payment.booking.customer.fullName,
          email: payment.booking.customer.email,
        },
        shipmentSlot: {
          id: payment.booking.shipmentSlot.id,
          originCity: payment.booking.shipmentSlot.originCity,
          originCountry: payment.booking.shipmentSlot.originCountry,
          destinationCity: payment.booking.shipmentSlot.destinationCity,
          destinationCountry: payment.booking.shipmentSlot.destinationCountry,
        },
      },
      amount: Number(payment.amount),
      currency: payment.currency.toUpperCase(),
      status: payment.status,
      paymentMethod: payment.paymentMethod || 'card',
      stripePaymentIntentId: payment.stripePaymentIntentId,
      stripeChargeId: payment.stripeChargeId || null,
      refundedAmount: Number(payment.refundedAmount || 0),
      refundReason: payment.refundReason || null,
      metadata: payment.metadata || {},
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() || null,
      refundedAt: payment.refundedAt?.toISOString() || null,
    };
  },

  async getCompanyPaymentStats(req: AuthRequest, query: GetPaymentStatsDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const companyId = req.user.companyId;

    // Parse dates
    const dateFrom = query.dateFrom ? new Date(query.dateFrom + 'T00:00:00Z') : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo + 'T23:59:59Z') : undefined;

    const where: any = {
      booking: {
        companyId,
      },
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = dateFrom;
      }
      if (dateTo) {
        where.createdAt.lte = dateTo;
      }
    }

    // Get all payments for stats
    const payments = await prisma.payment.findMany({
      where,
      include: {
        booking: true,
      },
    });

    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const paidPayments = payments.filter((p) => p.status === 'SUCCEEDED');
    const pendingPayments = payments.filter((p) => p.status === 'PENDING');
    const refundedPayments = payments.filter((p) => p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED');

    const paidAmount = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const refundedAmount = refundedPayments.reduce((sum, p) => sum + Number(p.refundedAmount || 0), 0);

    return {
      totalAmount,
      paidAmount,
      pendingAmount,
      refundedAmount,
      totalCount: payments.length,
      paidCount: paidPayments.length,
      pendingCount: pendingPayments.length,
      refundedCount: refundedPayments.length,
      averageAmount: payments.length > 0 ? totalAmount / payments.length : 0,
      period: {
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
    };
  },

  async processRefund(req: AuthRequest, paymentId: string, dto: ProcessRefundDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    const payment = await paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    // Verify the payment belongs to the company
    if (payment.booking.companyId !== req.user.companyId) {
      throw new ForbiddenError('You do not have permission to refund this payment');
    }

    // Check if refund is allowed
    if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestError('Only paid or partially refunded payments can be refunded');
    }

    const currentRefundedAmount = Number(payment.refundedAmount || 0);
    const remainingAmount = Number(payment.amount) - currentRefundedAmount;

    if (remainingAmount <= 0) {
      throw new BadRequestError('Payment has already been fully refunded');
    }

    // Determine refund amount
    const refundAmount = dto.amount || remainingAmount;

    if (refundAmount > remainingAmount) {
      throw new BadRequestError('Refund amount exceeds available amount');
    }

    if (refundAmount <= 0) {
      throw new BadRequestError('Refund amount must be greater than zero');
    }

    // Get Stripe charge ID (from payment intent)
    const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    const chargeId = paymentIntent.latest_charge as string;

    if (!chargeId) {
      throw new BadRequestError('No charge found for this payment');
    }

    // Process refund via Stripe
    const refundAmountInCents = Math.round(refundAmount * 100);
    await stripe.refunds.create({
      charge: chargeId,
      amount: refundAmountInCents,
      reason: dto.reason ? 'requested_by_customer' : undefined,
      metadata: {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        refundReason: dto.reason || '',
      },
    });

    // Update payment record
    const newRefundedAmount = currentRefundedAmount + refundAmount;
    const isFullRefund = newRefundedAmount >= Number(payment.amount);
    const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const updatedPayment = await paymentRepository.updateRefundInfo(payment.id, {
      status: newStatus,
      refundedAmount: newRefundedAmount,
      refundReason: dto.reason || payment.refundReason || undefined,
      refundedAt: new Date(),
    });

    // Update booking payment status if fully refunded
    if (isFullRefund) {
      await paymentRepository.updateBookingPaymentStatus(payment.bookingId, 'REFUNDED');
    }

    // Notify customer about refund
    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (booking) {
      await createNotification({
        userId: booking.customerId,
        type: 'PAYMENT_REFUNDED',
        title: 'Payment Refunded',
        body: `Your payment of £${refundAmount.toFixed(2)} for booking from ${booking.shipmentSlot.originCity} to ${booking.shipmentSlot.destinationCity} has been refunded${dto.reason ? `. Reason: ${dto.reason}` : ''}`,
        metadata: {
          bookingId: payment.bookingId,
          paymentId: payment.id,
          refundedAmount: refundAmount,
          reason: dto.reason,
        },
      }).catch((err) => {
        console.error('Failed to create refund notification:', err);
      });
    }

    return {
      id: updatedPayment.id,
      bookingId: updatedPayment.bookingId,
      booking: {
        id: updatedPayment.booking.id,
        customer: {
          id: updatedPayment.booking.customer.id,
          fullName: updatedPayment.booking.customer.fullName,
          email: updatedPayment.booking.customer.email,
        },
        shipmentSlot: {
          id: updatedPayment.booking.shipmentSlot.id,
          originCity: updatedPayment.booking.shipmentSlot.originCity,
          originCountry: updatedPayment.booking.shipmentSlot.originCountry,
          destinationCity: updatedPayment.booking.shipmentSlot.destinationCity,
          destinationCountry: updatedPayment.booking.shipmentSlot.destinationCountry,
        },
      },
      amount: Number(updatedPayment.amount),
      currency: updatedPayment.currency.toUpperCase(),
      status: updatedPayment.status,
      paymentMethod: updatedPayment.paymentMethod || 'card',
      stripePaymentIntentId: updatedPayment.stripePaymentIntentId,
      stripeChargeId: updatedPayment.stripeChargeId || null,
      refundedAmount: Number(updatedPayment.refundedAmount || 0),
      refundReason: updatedPayment.refundReason || null,
      metadata: updatedPayment.metadata || {},
      createdAt: updatedPayment.createdAt.toISOString(),
      updatedAt: updatedPayment.updatedAt.toISOString(),
      paidAt: updatedPayment.paidAt?.toISOString() || null,
      refundedAt: updatedPayment.refundedAt?.toISOString() || null,
    };
  },
};

