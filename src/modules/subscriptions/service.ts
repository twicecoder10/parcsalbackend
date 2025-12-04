import Stripe from 'stripe';
import { config } from '../../config/env';
import { subscriptionRepository, CreateSubscriptionData } from './repository';
import { CreateSubscriptionCheckoutDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { onboardingRepository } from '../onboarding/repository';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export const subscriptionService = {
  async createCheckoutSession(req: AuthRequest, dto: CreateSubscriptionCheckoutDto) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can create subscriptions');
    }

    // Get plan
    const plan = await prisma.companyPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundError('Plan not found');
    }

    // Get company
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      include: {
        admin: true,
      },
    });

    if (!company || !company.admin) {
      throw new NotFoundError('Company not found');
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId: string;
    const existingSubscription = await subscriptionRepository.findByCompanyId(req.user.companyId);

    if (existingSubscription) {
      stripeCustomerId = existingSubscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: company.admin.email,
        name: company.name,
        metadata: {
          companyId: company.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    // Handle returnUrl - if it's a full URL, use it directly; otherwise prepend frontendUrl
    const getRedirectUrl = (returnUrl: string | undefined, defaultPath: string) => {
      if (!returnUrl) {
        return `${config.frontendUrl}${defaultPath}`;
      }
      // Check if returnUrl is already a full URL
      if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
        return returnUrl;
      }
      // Otherwise, it's a path, prepend frontendUrl
      return `${config.frontendUrl}${returnUrl}`;
    };

    const baseSuccessUrl = getRedirectUrl(dto.returnUrl, '/company/subscription');
    const baseCancelUrl = getRedirectUrl(dto.returnUrl, '/company/subscription');

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `${plan.name} Plan`,
              description: `Subscription for ${company.name}`,
            },
            recurring: {
              interval: 'month',
            },
            unit_amount: Math.round(Number(plan.priceMonthly) * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${baseSuccessUrl}${baseSuccessUrl.includes('?') ? '&' : '?'}success=true${dto.fromOnboarding ? '&fromOnboarding=true' : ''}`,
      cancel_url: `${baseCancelUrl}${baseCancelUrl.includes('?') ? '&' : '?'}cancelled=true${dto.fromOnboarding ? '&fromOnboarding=true' : ''}`,
      metadata: {
        companyId: company.id,
        planId: plan.id,
      },
      client_reference_id: company.id,
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  },

  async handleStripeWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSubscriptionSecret
      );
    } catch (err: any) {
      throw new BadRequestError(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle subscription created
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Only process if this is a subscription checkout (has subscription ID)
      const subscriptionId = session.subscription as string;
      if (!subscriptionId) {
        // This is a payment checkout, not a subscription - ignore it
        return { received: true, message: 'Not a subscription checkout' };
      }

      const companyId = session.metadata?.companyId || session.client_reference_id;
      const planId = session.metadata?.planId;

      if (!companyId || !planId) {
        throw new BadRequestError('Company ID or Plan ID not found in session metadata');
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = subscription.customer as string;

      // Get plan
      const plan = await prisma.companyPlan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        throw new NotFoundError('Plan not found');
      }

      // Create subscription record
      const subscriptionData: CreateSubscriptionData = {
        companyId,
        companyPlanId: planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: 'ACTIVE',
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
      await onboardingRepository.updateCompanyOnboardingStep(
        companyId,
        'payment_setup',
        true
      ).catch((err) => {
        // Don't fail the subscription creation if onboarding update fails
        console.error('Failed to update onboarding step:', err);
      });

      // Trigger user onboarding recalculation to update onboardingCompleted flag
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { adminId: true },
      });

      if (company?.adminId) {
        // Trigger recalculation by updating a user step (idempotent)
        await onboardingRepository.updateUserOnboardingStep(
          company.adminId,
          'profile_completion',
          true
        ).catch((err) => {
          console.error('Failed to update user onboarding:', err);
        });
      }

      return { subscription: created };
    }

    // Handle subscription updated
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
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
        }

        return { 
          received: true, 
          message: 'Subscription updated successfully',
          eventType: event.type,
          subscriptionId: dbSubscription.id
        };
      } else {
        console.warn(`[Subscription Webhook] customer.subscription.updated: Subscription ${subscription.id} not found in database`);
        return { 
          received: true, 
          message: 'Subscription updated event received but subscription not found in database',
          eventType: event.type
        };
      }
    }

    // Handle subscription cancelled
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const dbSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscription.id);

      if (dbSubscription) {
        await subscriptionRepository.updateStatus(dbSubscription.id, 'CANCELLED');
        await subscriptionRepository.updateCompanyPlan(dbSubscription.companyId, dbSubscription.companyPlanId, null);
        
        return { 
          received: true, 
          message: 'Subscription cancelled successfully',
          eventType: event.type,
          subscriptionId: dbSubscription.id
        };
      } else {
        console.warn(`[Subscription Webhook] customer.subscription.deleted: Subscription ${subscription.id} not found in database`);
        return { 
          received: true, 
          message: 'Subscription deleted event received but subscription not found in database',
          eventType: event.type
        };
      }
    }

    // Return success for unhandled events (Stripe will retry if we return error)
    // Only handle the events we care about, ignore others
    return { received: true, message: `Event ${event.type} received but not handled` };
  },

  async getMySubscription(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin (subscription details should only be visible to admins)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view subscription details');
    }

    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    
    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    return subscription;
  },

  async syncSubscriptionFromStripe(req: AuthRequest, sessionId: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can sync subscriptions');
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Only process subscription checkouts
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      throw new BadRequestError('This is not a subscription checkout session');
    }

    const companyId = session.metadata?.companyId || session.client_reference_id;
    if (!companyId) {
      throw new BadRequestError('Company ID not found in session metadata');
    }

    // Check if subscription already exists
    const existingSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
    if (existingSubscription) {
      // Still trigger user onboarding recalculation in case it wasn't done before
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { adminId: true },
      });

      if (company?.adminId) {
        await onboardingRepository.updateUserOnboardingStep(
          company.adminId,
          'profile_completion',
          true
        ).catch((err) => {
          console.error('Failed to update user onboarding:', err);
        });
      }

      return {
        message: 'Subscription already exists in database',
        subscription: existingSubscription,
      };
    }
    const planId = session.metadata?.planId;

    if (!companyId || !planId) {
      throw new BadRequestError('Company ID or Plan ID not found in session metadata');
    }

    // Verify company matches
    if (companyId !== req.user.companyId) {
      throw new ForbiddenError('This subscription does not belong to your company');
    }

    // Retrieve subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = subscription.customer as string;

    // Get plan
    const plan = await prisma.companyPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundError('Plan not found');
    }

    // Create subscription record
    const subscriptionData: CreateSubscriptionData = {
      companyId,
      companyPlanId: planId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: subscription.status === 'active' ? 'ACTIVE' : subscription.status === 'past_due' ? 'PAST_DUE' : 'CANCELLED',
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
    await onboardingRepository.updateCompanyOnboardingStep(
      companyId,
      'payment_setup',
      true
    ).catch((err) => {
      console.error('Failed to update onboarding step:', err);
    });

    // Trigger user onboarding recalculation to update onboardingCompleted flag
    // Get the company admin user to update their onboarding status
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { adminId: true },
    });

    if (company?.adminId) {
      // Trigger recalculation by updating a user step (idempotent - won't change if already complete)
      // This will check both user steps AND company onboarding, then set onboardingCompleted accordingly
      await onboardingRepository.updateUserOnboardingStep(
        company.adminId,
        'profile_completion',
        true
      ).catch((err) => {
        console.error('Failed to update user onboarding:', err);
      });
    }

    return {
      message: 'Subscription synced successfully',
      subscription: created,
    };
  },

  async cancelSubscription(req: AuthRequest, _reason?: string) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can cancel subscriptions');
    }

    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    // Cancel subscription in Stripe
    const cancelledSubscription = await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

    // Update subscription status in database
    await subscriptionRepository.updateStatus(
      subscription.id,
      'CANCELLED',
      new Date(cancelledSubscription.current_period_start * 1000),
      new Date(cancelledSubscription.current_period_end * 1000)
    );

    // Remove active plan from company
    await subscriptionRepository.updateCompanyPlan(req.user.companyId, subscription.companyPlanId, null);

    return {
      message: 'Subscription cancelled successfully',
      subscription: {
        ...subscription,
        status: 'CANCELLED' as const,
      },
    };
  },

  async updatePaymentMethod(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can update payment methods');
    }

    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    // Create Stripe billing portal session for payment method update
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${config.frontendUrl}/company/subscription`,
    });

    return {
      url: session.url,
    };
  },
};

