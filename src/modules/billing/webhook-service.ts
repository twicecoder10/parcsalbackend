import Stripe from 'stripe';
import { config } from '../../config/env';
import prisma from '../../config/database';
import { planFromPriceId } from './stripePriceMap';
import { BadRequestError } from '../../utils/errors';
import { getPlanEntitlements } from './plans';
import { CarrierPlan, SubscriptionStatus } from '@prisma/client';
import { subscriptionRepository } from '../subscriptions/repository';

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
  // Only active and trialing subscriptions are considered active
  // past_due, unpaid, canceled, incomplete, incomplete_expired are all inactive
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
    select: { planStartedAt: true, rankingTier: true },
  });

  if (!company?.planStartedAt && active) {
    updateData.planStartedAt = new Date();
  }

  // Auto-set ranking tier based on plan (unless Enterprise with custom override)
  // Enterprise can have custom ranking, so only auto-set if not already CUSTOM
  if (plan !== 'ENTERPRISE') {
    const entitlements = getPlanEntitlements(plan as CarrierPlan);
    updateData.rankingTier = entitlements.rankingTier;
  } else if (plan === 'ENTERPRISE' && company?.rankingTier !== 'CUSTOM') {
    // Enterprise defaults to CUSTOM if not already set
    const entitlements = getPlanEntitlements('ENTERPRISE');
    updateData.rankingTier = entitlements.rankingTier;
  }
  // If Enterprise already has CUSTOM, leave it as is (admin override)

  // If subscription is canceled (immediate) or unpaid, downgrade to FREE
  // Note: canceled with cancel_at_period_end=true keeps plan until period ends
  if (subscription.status === 'canceled' && !subscription.cancel_at_period_end) {
    updateData.plan = 'FREE';
    updateData.planActive = false;
    // Reset ranking tier to STANDARD for FREE plan
    const freeEntitlements = getPlanEntitlements('FREE');
    updateData.rankingTier = freeEntitlements.rankingTier;
  } else if (subscription.status === 'unpaid') {
    // Unpaid status means payment failed after grace period - downgrade to FREE
    updateData.plan = 'FREE';
    updateData.planActive = false;
    // Reset ranking tier to STANDARD for FREE plan
    const freeEntitlements = getPlanEntitlements('FREE');
    updateData.rankingTier = freeEntitlements.rankingTier;
    console.log(`[Billing Webhook] Subscription ${subscription.id} is unpaid - downgrading company ${companyId} to FREE plan`);
  }

  // Update company
  await prisma.company.update({
    where: { id: companyId },
    data: updateData,
  });

  // Also update the Subscription table to keep it in sync
  const stripeCustomerId = updateData.stripeCustomerId;
  const stripeSubscriptionId = updateData.stripeSubscriptionId;
  
  if (stripeSubscriptionId && stripeCustomerId) {
    try {
      // Find the CompanyPlan by matching the plan name
      const companyPlan = await prisma.companyPlan.findFirst({
        where: {
          carrierPlan: plan,
        },
      });

      if (companyPlan) {
        // Check if subscription already exists
        const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId);
        
        // Map Stripe subscription status to our SubscriptionStatus enum
        let subscriptionStatus: SubscriptionStatus = 'ACTIVE';
        if (subscription.status === 'canceled') {
          subscriptionStatus = 'CANCELLED';
        } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
          subscriptionStatus = 'PAST_DUE';
        } else if (subscription.status === 'active' || subscription.status === 'trialing') {
          subscriptionStatus = 'ACTIVE';
        }

        const currentPeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : new Date();
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : new Date();

        if (existingSubscription) {
          // Update existing subscription
          await subscriptionRepository.updatePlan(existingSubscription.id, companyPlan.id);
          await subscriptionRepository.updateStatus(
            existingSubscription.id,
            subscriptionStatus,
            currentPeriodStart,
            currentPeriodEnd
          );
          console.log(`[Billing Webhook] Updated subscription record ${existingSubscription.id} for company ${companyId}`);
        } else {
          // Create new subscription record
          await subscriptionRepository.create({
            companyId,
            companyPlanId: companyPlan.id,
            stripeCustomerId,
            stripeSubscriptionId,
            status: subscriptionStatus,
            currentPeriodStart,
            currentPeriodEnd,
          });
          console.log(`[Billing Webhook] Created subscription record for company ${companyId}`);
        }
      } else {
        console.warn(`[Billing Webhook] CompanyPlan not found for plan ${plan}, skipping Subscription table update`);
      }
    } catch (error: any) {
      // Log error but don't fail the webhook - Company table update already succeeded
      console.error(`[Billing Webhook] Failed to update Subscription table for company ${companyId}:`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  console.log(`[Billing Webhook] Updated company ${companyId}: plan=${plan}, active=${active}, stripeCustomerId=${updateData.stripeCustomerId || 'not set'}, stripeSubscriptionId=${updateData.stripeSubscriptionId || 'not set'}`);
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
      // In production, this is a serious issue - company should exist
      // In development/test, this is common with Stripe CLI test events
      const isProduction = config.nodeEnv === 'production';
      if (isProduction) {
        console.error(`[Billing Webhook] CRITICAL: Company not found for customer ${customerId} in PRODUCTION. Subscription ${subscriptionId} cannot be processed.`);
        // In production, we should still return (not throw) to prevent webhook retries
        // but log it as an error for monitoring/alerting
        return;
      } else {
        console.warn(`[Billing Webhook] Company not found for customer ${customerId}. This may be a test event. Skipping subscription update.`);
        return;
      }
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
    // In production, this is a serious issue - company should exist
    const isProduction = config.nodeEnv === 'production';
    if (isProduction) {
      console.error(`[Billing Webhook] CRITICAL: Company not found for customer ${customerId} in PRODUCTION. Subscription update cannot be processed.`);
    } else {
      console.warn(`[Billing Webhook] Company not found for customer ${customerId}. This may be a test event.`);
    }
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
    // In production, this is a serious issue - company should exist
    const isProduction = config.nodeEnv === 'production';
    if (isProduction) {
      console.error(`[Billing Webhook] CRITICAL: Company not found for customer ${customerId} in PRODUCTION. Subscription update cannot be processed.`);
    } else {
      console.warn(`[Billing Webhook] Company not found for customer ${customerId}. This may be a test event.`);
    }
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

  // Also update the Subscription table - mark as CANCELLED
  if (subscription.id) {
    try {
      const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscription.id);
      if (existingSubscription) {
        await subscriptionRepository.updateStatus(existingSubscription.id, 'CANCELLED');
        console.log(`[Billing Webhook] Updated subscription record ${existingSubscription.id} to CANCELLED`);
      }
    } catch (error: any) {
      // Log error but don't fail the webhook
      console.error(`[Billing Webhook] Failed to update Subscription table for deleted subscription ${subscription.id}:`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

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
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await prisma.company.update({
    where: { id: company.id },
    data: {
      planRenewsAt: currentPeriodEnd,
      stripeCurrentPeriodEnd: currentPeriodEnd,
    },
  });

  // Also update the Subscription table
  try {
    const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
    if (existingSubscription && currentPeriodEnd) {
      await subscriptionRepository.updateStatus(
        existingSubscription.id,
        'ACTIVE',
        subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : undefined,
        currentPeriodEnd
      );
    }
  } catch (error: any) {
    // Log error but don't fail the webhook
    console.error(`[Billing Webhook] Failed to update Subscription table for invoice payment:`, {
      error: error.message,
      subscriptionId,
    });
  }

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

  // Also update the Subscription table
  try {
    const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
    if (existingSubscription) {
      await subscriptionRepository.updateStatus(existingSubscription.id, 'PAST_DUE');
    }
  } catch (error: any) {
    // Log error but don't fail the webhook
    console.error(`[Billing Webhook] Failed to update Subscription table for payment failure:`, {
      error: error.message,
      subscriptionId,
    });
  }

  console.log(`[Billing Webhook] Marked plan inactive for company ${company.id} due to payment failure`);
}

/**
 * Main webhook handler
 */
export async function handleBillingWebhook(payload: Buffer, signature: string): Promise<{ received: boolean; message: string; eventType?: string; companyId?: string; error?: string; warning?: string; critical?: boolean }> {
  let event: Stripe.Event;

  try {
    // Use billing-specific webhook secret if provided, otherwise fall back to main webhook secret
    const webhookSecret = config.stripe.webhookBillingSecret || config.stripe.webhookSecret;
    
    if (!webhookSecret) {
      throw new BadRequestError('Webhook secret not configured. Please set STRIPE_WEBHOOK_BILLING_SECRET or STRIPE_WEBHOOK_SECRET');
    }
    
    // Log which secret is being used (without exposing the full secret)
    const secretPreview = webhookSecret.substring(0, 10) + '...';
    console.log(`[Billing Webhook] Using webhook secret: ${secretPreview} (from ${config.stripe.webhookBillingSecret ? 'STRIPE_WEBHOOK_BILLING_SECRET' : 'STRIPE_WEBHOOK_SECRET'})`);
    
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    // Provide more helpful error message for signature verification failures
    const errorMessage = err.message || 'Unknown error';
    if (errorMessage.includes('signature') || errorMessage.includes('signing')) {
      console.error(`[Billing Webhook] Signature verification failed. Make sure your webhook secret matches the one from Stripe CLI.`);
      console.error(`[Billing Webhook] Current secret preview: ${(config.stripe.webhookBillingSecret || config.stripe.webhookSecret || '').substring(0, 10)}...`);
      console.error(`[Billing Webhook] If using Stripe CLI, copy the webhook signing secret from the CLI output and set it in .env as STRIPE_WEBHOOK_BILLING_SECRET`);
    }
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
    // Handle NotFoundError - in production this is critical, in development it's common with test events
    if (error.name === 'NotFoundError' && error.message?.includes('Company not found')) {
      const isProduction = config.nodeEnv === 'production';
      if (isProduction) {
        console.error(`[Billing Webhook] CRITICAL: ${error.message} in PRODUCTION. Event ${event.type} cannot be processed.`);
        return {
          received: true,
          message: `Event ${event.type} received but company not found in PRODUCTION`,
          eventType: event.type,
          error: error.message,
          critical: true,
        };
      } else {
        console.warn(`[Billing Webhook] ${error.message}. This may be a test event. Skipping.`);
        return {
          received: true,
          message: `Event ${event.type} received but company not found (likely a test event)`,
          eventType: event.type,
          warning: error.message,
        };
      }
    }
    
    console.error(`[Billing Webhook] Error processing event ${event.id}:`, {
      error: error.message,
      stack: error.stack,
      eventType: event.type,
    });
    throw error;
  }
}

