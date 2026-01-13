import Stripe from 'stripe';
import { config } from '../../config/env';
import prisma from '../../config/database';
import { planFromPriceId } from './stripePriceMap';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

/**
 * Check if event has already been processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await prisma.stripeEvent.findUnique({
    where: { id: eventId },
  }).catch(() => null);
  return !!existing;
}

/**
 * Store event for idempotency
 */
async function storeEvent(event: Stripe.Event): Promise<void> {
  try {
    await prisma.stripeEvent.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        type: event.type,
        payload: event as any,
      },
      update: {
        type: event.type,
        payload: event as any,
      },
    });
  } catch (error: any) {
    // If table doesn't exist yet, log and continue (migration may not have run)
    console.warn(`[Billing Webhook] Failed to store event ${event.id}:`, error.message);
  }
}

/**
 * Determine plan active status from Stripe subscription status
 */
function isPlanActive(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Update company plan fields from Stripe subscription
 */
async function updateCompanyFromSubscription(
  companyId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  // Get price ID from subscription
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) {
    console.warn(`[Billing Webhook] No price ID found in subscription ${subscription.id}`);
    return;
  }

  // Map price ID to plan
  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn(`[Billing Webhook] No plan mapping found for price ID ${priceId}`);
    return;
  }

  // Determine active status
  const active = isPlanActive(subscription.status);

  // Prepare update data
  const updateData: any = {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' 
      ? subscription.customer 
      : subscription.customer?.id || null,
    plan,
    planActive: active,
    stripeCurrentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    stripeCurrentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    planRenewsAt: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  };

  // Set planStartedAt only if not already set (first subscription)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { planStartedAt: true },
  });

  if (!company?.planStartedAt && active) {
    updateData.planStartedAt = new Date();
  }

  // If subscription is canceled and not at period end, set plan to FREE
  if (subscription.status === 'canceled' && !subscription.cancel_at_period_end) {
    updateData.plan = 'FREE';
    updateData.planActive = false;
  }

  // Update company
  await prisma.company.update({
    where: { id: companyId },
    data: updateData,
  });

  console.log(`[Billing Webhook] Updated company ${companyId}: plan=${plan}, active=${active}`);
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // Only process subscription checkouts
  if (session.mode !== 'subscription') {
    console.log(`[Billing Webhook] Ignoring non-subscription checkout session ${session.id}`);
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    console.warn(`[Billing Webhook] No subscription ID in checkout session ${session.id}`);
    return;
  }

  // Get company ID from metadata (REQUIRED)
  const companyId = session.metadata?.companyId;
  if (!companyId) {
    // Fallback: try to find by stripeCustomerId if already stored
    const customerId = session.customer as string;
      if (customerId) {
        const company = await prisma.company.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (company) {
          console.log(`[Billing Webhook] Found company ${company.id} by stripeCustomerId`);
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await updateCompanyFromSubscription(company.id, subscription);
          return;
        }
      }
    throw new BadRequestError('Company ID not found in session metadata and could not be determined');
  }

  // Fetch subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update company
  await updateCompanyFromSubscription(companyId, subscription);
}

/**
 * Handle customer.subscription.created event
 */
async function handleSubscriptionCreated(
  subscriptionId: string,
  companyId?: string
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Find company by stripeCustomerId if companyId not provided
  if (!companyId) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    
    if (!customerId) {
      throw new BadRequestError('No customer ID in subscription');
    }

    const company = await prisma.company.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (!company) {
      throw new NotFoundError(`Company not found for customer ${customerId}`);
    }

    companyId = company.id;
  }

  await updateCompanyFromSubscription(companyId, subscription);
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    throw new BadRequestError('No customer ID in subscription');
  }

  const company = await prisma.company.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!company) {
    console.warn(`[Billing Webhook] Company not found for customer ${customerId}`);
    return;
  }

  await updateCompanyFromSubscription(company.id, subscription);
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    throw new BadRequestError('No customer ID in subscription');
  }

  const company = await prisma.company.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!company) {
    console.warn(`[Billing Webhook] Company not found for customer ${customerId}`);
    return;
  }

  // Update company: set planActive=false, optionally set plan=FREE
  await prisma.company.update({
    where: { id: company.id },
    data: {
      planActive: false,
      plan: 'FREE', // Set to FREE when subscription is deleted
      stripeSubscriptionId: null,
      stripeCancelAtPeriodEnd: false,
    },
  });

  console.log(`[Billing Webhook] Deactivated subscription for company ${company.id}`);
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  
  if (!invoice.subscription) {
    // Not a subscription invoice
    return;
  }

  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    return;
  }

  const company = await prisma.company.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!company) {
    return;
  }

  // Update renewal date
  await prisma.company.update({
    where: { id: company.id },
    data: {
      planRenewsAt: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      stripeCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    },
  });

  console.log(`[Billing Webhook] Updated renewal date for company ${company.id}`);
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  
  if (!invoice.subscription) {
    // Not a subscription invoice
    return;
  }

  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    return;
  }

  const company = await prisma.company.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!company) {
    return;
  }

  // Mark plan as inactive
  await prisma.company.update({
    where: { id: company.id },
    data: {
      planActive: false,
    },
  });

  console.log(`[Billing Webhook] Marked plan inactive for company ${company.id} due to payment failure`);
}

/**
 * Main webhook handler
 */
export async function handleBillingWebhook(payload: Buffer, signature: string): Promise<{ received: boolean; message: string; eventType?: string; companyId?: string }> {
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

  // Check idempotency
  if (await isEventProcessed(event.id)) {
    console.log(`[Billing Webhook] Event ${event.id} already processed, skipping`);
    return {
      received: true,
      message: 'Event already processed',
      eventType: event.type,
    };
  }

  // Store event for idempotency
  await storeEvent(event);

  let companyId: string | undefined;

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        const session = event.data.object as Stripe.Checkout.Session;
        companyId = session.metadata?.companyId;
        break;

      case 'customer.subscription.created':
        const createdSub = event.data.object as Stripe.Subscription;
        const createdCustomerId = typeof createdSub.customer === 'string'
          ? createdSub.customer
          : createdSub.customer?.id;
        if (createdCustomerId) {
          const company = await prisma.company.findUnique({
            where: { stripeCustomerId: createdCustomerId },
          });
          companyId = company?.id;
        }
        await handleSubscriptionCreated(createdSub.id, companyId);
        break;

      case 'customer.subscription.updated':
        const updatedSub = event.data.object as Stripe.Subscription;
        const updatedCustomerId = typeof updatedSub.customer === 'string'
          ? updatedSub.customer
          : updatedSub.customer?.id;
        if (updatedCustomerId) {
          const company = await prisma.company.findUnique({
            where: { stripeCustomerId: updatedCustomerId },
          });
          companyId = company?.id;
        }
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        const deletedSub = event.data.object as Stripe.Subscription;
        const deletedCustomerId = typeof deletedSub.customer === 'string'
          ? deletedSub.customer
          : deletedSub.customer?.id;
        if (deletedCustomerId) {
          const company = await prisma.company.findUnique({
            where: { stripeCustomerId: deletedCustomerId },
          });
          companyId = company?.id;
        }
        await handleSubscriptionDeleted(event);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      default:
        console.log(`[Billing Webhook] Unhandled event type: ${event.type}`);
        return {
          received: true,
          message: `Event ${event.type} received but not handled`,
          eventType: event.type,
        };
    }

    return {
      received: true,
      message: `Successfully processed ${event.type}`,
      eventType: event.type,
      companyId,
    };
  } catch (error: any) {
    console.error(`[Billing Webhook] Error processing event ${event.id}:`, {
      error: error.message,
      stack: error.stack,
      eventType: event.type,
    });
    throw error;
  }
}

