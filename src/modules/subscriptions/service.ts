import Stripe from 'stripe';
import { config } from '../../config/env';
import { subscriptionRepository, CreateSubscriptionData } from './repository';
import { CreateSubscriptionCheckoutDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { onboardingRepository } from '../onboarding/repository';
import { CarrierPlan, CreditWalletType } from '@prisma/client';
import { getPlanEntitlements } from '../billing/plans';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

const PLAN_RANK: Record<CarrierPlan, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function isUpgrade(fromPlan: CarrierPlan, toPlan: CarrierPlan): boolean {
  return PLAN_RANK[toPlan] > PLAN_RANK[fromPlan];
}

function getWalletMonthlyCredits(plan: CarrierPlan) {
  const entitlements = getPlanEntitlements(plan);
  return {
    WHATSAPP_PROMO: entitlements.monthlyWhatsappPromoCreditsIncluded,
    WHATSAPP_STORY: entitlements.monthlyWhatsappStoryCreditsIncluded,
    MARKETING_EMAIL: entitlements.monthlyMarketingEmailCreditsIncluded,
  } as Record<CreditWalletType, number>;
}

async function ensureStripeCustomerId(params: {
  companyId: string;
  plan: CarrierPlan;
  existingStripeCustomerId?: string | null;
}) {
  if (params.existingStripeCustomerId) {
    return params.existingStripeCustomerId;
  }

  const companyWithAdmin = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      name: true,
      admin: {
        select: {
          email: true,
          fullName: true,
        },
      },
    },
  });

  if (!companyWithAdmin || !companyWithAdmin.admin) {
    throw new NotFoundError('Company admin not found');
  }

  const customer = await stripe.customers.create({
    email: companyWithAdmin.admin.email,
    name: companyWithAdmin.admin.fullName || companyWithAdmin.name,
    metadata: {
      companyId: params.companyId,
      plan: params.plan,
    },
  });

  await prisma.company.update({
    where: { id: params.companyId },
    data: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

async function grantProratedUpgradeCredits(params: {
  companyId: string;
  fromPlan: CarrierPlan;
  toPlan: CarrierPlan;
  periodStart: Date;
  periodEnd: Date;
  subscriptionId: string;
}) {
  if (!isUpgrade(params.fromPlan, params.toPlan)) {
    return;
  }

  const now = new Date();
  const totalMs = params.periodEnd.getTime() - params.periodStart.getTime();
  const remainingMs = Math.max(0, params.periodEnd.getTime() - now.getTime());
  const ratio = totalMs > 0 ? remainingMs / totalMs : 0;

  if (ratio <= 0) {
    return;
  }

  const fromCredits = getWalletMonthlyCredits(params.fromPlan);
  const toCredits = getWalletMonthlyCredits(params.toPlan);
  const { addCredits } = await import('../billing/usage');

  for (const walletType of Object.keys(toCredits) as CreditWalletType[]) {
    const fromAmount = fromCredits[walletType];
    const toAmount = toCredits[walletType];

    if (!Number.isFinite(fromAmount) || !Number.isFinite(toAmount)) {
      continue;
    }

    const diff = Math.max(0, toAmount - fromAmount);
    if (diff <= 0) {
      continue;
    }

    const proratedAmount = Math.round(diff * ratio);
    if (proratedAmount <= 0) {
      continue;
    }

    const referenceId = `${params.subscriptionId}:${walletType}:${params.periodEnd.toISOString()}`;
    const existing = await prisma.companyCreditTransaction.findFirst({
      where: {
        companyId: params.companyId,
        walletType,
        type: 'GRANT',
        referenceId,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await addCredits(
      params.companyId,
      walletType,
      proratedAmount,
      'GRANT',
      `Prorated upgrade credits (${params.fromPlan} -> ${params.toPlan})`,
      referenceId
    );
  }
}

/**
 * Helper function to find a CompanyPlan by matching the monthly price from Stripe subscription
 */
async function findPlanByStripePrice(stripePriceAmount: number): Promise<string | null> {
  // Convert from cents to pounds (Stripe stores prices in the smallest currency unit)
  const monthlyPrice = stripePriceAmount / 100;
  
  // Find the plan with matching monthly price (allowing for small rounding differences)
  const plans = await prisma.companyPlan.findMany();
  
  // Find exact match first
  const exactMatch = plans.find(
    plan => Math.abs(Number(plan.priceMonthly) - monthlyPrice) < 0.01
  );
  
  if (exactMatch) {
    return exactMatch.id;
  }
  
  // Log warning if no match found
  console.warn(`[Subscription Webhook] No plan found matching price: £${monthlyPrice.toFixed(2)}`);
  return null;
}

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

    const planName = plan.name.toUpperCase();
    const isFreePlan = planName === 'FREE' || Number(plan.priceMonthly) === 0;

    // Handle FREE plans - directly assign without Stripe checkout
    if (isFreePlan) {
      // Directly assign the FREE plan to the company
      await subscriptionRepository.updateCompanyPlan(
        req.user.companyId,
        dto.planId,
        null // FREE plans don't expire
      );

      // Update onboarding step if this is from onboarding flow
      if (dto.fromOnboarding) {
        try {
          await onboardingRepository.updateCompanyOnboardingStep(
            req.user.companyId,
            'payment_setup',
            true
          );

          // Trigger user onboarding recalculation
          if (company.adminId) {
            await onboardingRepository.updateUserOnboardingStep(
              company.adminId,
              'profile_completion',
              true
            ).catch((err) => {
              console.error('Failed to update user onboarding:', err);
            });
          }
        } catch (err: any) {
          console.error(`[Free Plan Assignment] Failed to update onboarding step:`, {
            error: err.message,
            stack: err.stack,
            companyId: req.user.companyId,
          });
        }
      }

      // Return success response with redirect URL
      const successUrl = getRedirectUrl(dto.returnUrl, '/company/subscription');
      const redirectUrl = `${successUrl}${successUrl.includes('?') ? '&' : '?'}success=true&plan=free${dto.fromOnboarding ? '&fromOnboarding=true' : ''}`;

      return {
        sessionId: null,
        url: redirectUrl,
        isFreePlan: true,
      };
    }

    // For paid plans, create Stripe checkout session
    // Check if this is a FREE plan user upgrading for the first time
    const isFreePlanUpgrade = company.plan === 'FREE';
    const existingSubscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    const isFirstTimeUpgrade = !existingSubscription && isFreePlanUpgrade;

    // Create or retrieve Stripe customer
    let stripeCustomerId: string;

    if (existingSubscription) {
      stripeCustomerId = existingSubscription.stripeCustomerId;
    } else {
      // Check if company already has a stripeCustomerId
      if (company.stripeCustomerId) {
        stripeCustomerId = company.stripeCustomerId;
      } else {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: company.admin.email,
          name: company.name,
          metadata: {
            companyId: company.id,
            isFirstTimeUpgrade: String(isFirstTimeUpgrade),
          },
        });
        stripeCustomerId = customer.id;
        
        // Save stripeCustomerId to Company immediately
        await prisma.company.update({
          where: { id: company.id },
          data: { stripeCustomerId },
        });
      }
    }

    // For first-time upgrades from FREE plan, redirect to subscription page after success
    // Otherwise, use the provided returnUrl
    const baseSuccessUrl = isFirstTimeUpgrade 
      ? `${config.frontendUrl}/company/subscription?success=true&upgraded=true`
      : getRedirectUrl(dto.returnUrl, '/company/subscription');
    const baseCancelUrl = getRedirectUrl(dto.returnUrl, '/company/subscription');

    // Map plan name to Stripe price ID
    let priceId: string | undefined;
    if (planName === 'STARTER' && config.stripe.priceStarterId) {
      priceId = config.stripe.priceStarterId;
    } else if (planName === 'PROFESSIONAL' && config.stripe.priceProfessionalId) {
      priceId = config.stripe.priceProfessionalId;
    } else if (planName === 'ENTERPRISE' && config.stripe.priceEnterpriseId) {
      priceId = config.stripe.priceEnterpriseId;
    }

    if (!priceId) {
      throw new BadRequestError(`No Stripe price ID configured for plan ${plan.name}. Please configure STRIPE_PRICE_${planName}_ID`);
    }

    // Create Stripe checkout session using price ID
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseSuccessUrl}${baseSuccessUrl.includes('?') ? '&' : '?'}success=true${dto.fromOnboarding ? '&fromOnboarding=true' : ''}`,
      cancel_url: `${baseCancelUrl}${baseCancelUrl.includes('?') ? '&' : '?'}cancelled=true${dto.fromOnboarding ? '&fromOnboarding=true' : ''}`,
      metadata: {
        companyId: company.id,
        planId: dto.planId, // Include plan ID for webhook processing
        plan: planName, // Include plan name for reference
        isFirstTimeUpgrade: String(isFirstTimeUpgrade), // Track first-time upgrades
      },
      client_reference_id: company.id,
    });

    return {
      sessionId: session.id,
      url: session.url, // This is the Stripe checkout URL - frontend should redirect to this
      isFirstTimeUpgrade, // Return flag so frontend can handle accordingly
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
        select: { id: true, carrierPlan: true },
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

      const created = await subscriptionRepository.upsertByStripeSubscriptionId(subscriptionData);
      
      // Ensure stripeCustomerId is saved to Company (if not already set)
      await prisma.company.update({
        where: { id: companyId },
        data: { 
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });
      
      const currentCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true },
      });

      await subscriptionRepository.updateCompanyPlan(
        companyId,
        planId,
        new Date(subscription.current_period_end * 1000)
      );

      if (currentCompany?.plan && plan.carrierPlan) {
        await grantProratedUpgradeCredits({
          companyId,
          fromPlan: currentCompany.plan,
          toPlan: plan.carrierPlan,
          periodStart: new Date(subscription.current_period_start * 1000),
          periodEnd: new Date(subscription.current_period_end * 1000),
          subscriptionId: subscriptionId,
        });
      }

      // Mark payment_setup onboarding step as complete
      let onboardingUpdated = false;
      try {
        await onboardingRepository.updateCompanyOnboardingStep(
          companyId,
          'payment_setup',
          true
        );
        onboardingUpdated = true;
      } catch (err: any) {
        // Don't fail the subscription creation if onboarding update fails, but log it clearly
        console.error(`[Subscription Webhook] CRITICAL: Failed to update onboarding step 'payment_setup' for company ${companyId}:`, {
          error: err.message,
          stack: err.stack,
          companyId,
          subscriptionId: created.id,
        });
        // Try one more time after a short delay
        try {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          await onboardingRepository.updateCompanyOnboardingStep(
            companyId,
            'payment_setup',
            true
          );
          onboardingUpdated = true;
        } catch (retryErr: any) {
          console.error(`[Subscription Webhook] CRITICAL: Retry also failed for onboarding update:`, {
            error: retryErr.message,
            stack: retryErr.stack,
            companyId,
          });
        }
      }

      // Trigger user onboarding recalculation to update onboardingCompleted flag
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { adminId: true },
      });

      if (company?.adminId) {
        try {
          // Trigger recalculation by updating a user step (idempotent)
          await onboardingRepository.updateUserOnboardingStep(
            company.adminId,
            'profile_completion',
            true
          );
        } catch (err: any) {
          console.error(`[Subscription Webhook] Failed to update user onboarding:`, {
            error: err.message,
            stack: err.stack,
            adminId: company.adminId,
          });
        }
      }

      return { 
        subscription: created,
        onboardingUpdated,
        message: onboardingUpdated 
          ? 'Subscription created and onboarding updated successfully' 
          : 'Subscription created but onboarding update failed - check logs'
      };
    }

    // Handle subscription updated
    if (event.type === 'customer.subscription.updated') {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        
        const dbSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscription.id);

        if (dbSubscription) {
          const newStatus = subscription.status === 'active' ? 'ACTIVE' : subscription.status === 'past_due' ? 'PAST_DUE' : 'CANCELLED';
          
          // Detect plan changes by checking the subscription item price
          let newPlanId: string | null = dbSubscription.companyPlanId;
          let planChanged = false;
          
          if (subscription.items?.data && subscription.items.data.length > 0) {
            const subscriptionItem = subscription.items.data[0];
            let priceAmount: number | null = null;
            
            // Handle expanded price object (common in webhooks)
            if (subscriptionItem.price && typeof subscriptionItem.price === 'object' && 'unit_amount' in subscriptionItem.price) {
              const priceObj = subscriptionItem.price as Stripe.Price;
              priceAmount = priceObj.unit_amount; // Can be null for usage-based pricing
            } else if (subscriptionItem.price && typeof subscriptionItem.price === 'string') {
              // Price is just an ID, need to fetch it
              try {
                const price = await stripe.prices.retrieve(subscriptionItem.price);
                priceAmount = price.unit_amount;
              } catch (err: any) {
                console.warn(`[Subscription Webhook] Failed to retrieve price ${subscriptionItem.price}:`, err.message);
              }
            }
            
            if (priceAmount !== null) {
              const detectedPlanId = await findPlanByStripePrice(priceAmount);
              
              if (detectedPlanId && detectedPlanId !== dbSubscription.companyPlanId) {
                newPlanId = detectedPlanId;
                planChanged = true;
                
                // Update the subscription's planId
                await subscriptionRepository.updatePlan(dbSubscription.id, detectedPlanId);
              }
            }
          }
          
          // Update subscription status and period dates
          // Validate and convert period dates - Stripe timestamps are in seconds
          // Check if timestamps exist and are valid numbers before converting
          let validPeriodStart: Date | undefined;
          let validPeriodEnd: Date | undefined;

          if (subscription.current_period_start != null && typeof subscription.current_period_start === 'number') {
            const periodStart = new Date(subscription.current_period_start * 1000);
            if (!isNaN(periodStart.getTime())) {
              validPeriodStart = periodStart;
            }
          }

          if (subscription.current_period_end != null && typeof subscription.current_period_end === 'number') {
            const periodEnd = new Date(subscription.current_period_end * 1000);
            if (!isNaN(periodEnd.getTime())) {
              validPeriodEnd = periodEnd;
            }
          }

          await subscriptionRepository.updateStatus(
            dbSubscription.id,
            newStatus,
            validPeriodStart,
            validPeriodEnd
          );

          // Update company's active plan and expiration date
          // Only update company plan if subscription is active
          // For past_due, unpaid, or canceled, the billing webhook handles the downgrade
          if (subscription.status === 'active') {
            await subscriptionRepository.updateCompanyPlan(
              dbSubscription.companyId,
              newPlanId || dbSubscription.companyPlanId,
              validPeriodEnd || null
            );

            if (planChanged && newPlanId && validPeriodStart && validPeriodEnd) {
              const [oldPlan, newPlan] = await Promise.all([
                prisma.companyPlan.findUnique({
                  where: { id: dbSubscription.companyPlanId },
                  select: { carrierPlan: true },
                }),
                prisma.companyPlan.findUnique({
                  where: { id: newPlanId },
                  select: { carrierPlan: true },
                }),
              ]);

              if (oldPlan?.carrierPlan && newPlan?.carrierPlan) {
                await grantProratedUpgradeCredits({
                  companyId: dbSubscription.companyId,
                  fromPlan: oldPlan.carrierPlan,
                  toPlan: newPlan.carrierPlan,
                  periodStart: validPeriodStart,
                  periodEnd: validPeriodEnd,
                  subscriptionId: subscription.id,
                });
              }
            }
          } else if (subscription.status === 'unpaid' || (subscription.status === 'canceled' && !subscription.cancel_at_period_end)) {
            // Explicitly handle unpaid or immediate cancellation - downgrade to FREE
            await prisma.company.update({
              where: { id: dbSubscription.companyId },
              data: {
                plan: 'FREE',
                planActive: false,
                activePlanId: null,
                planExpiresAt: null,
                rankingTier: 'STANDARD', // Reset to FREE plan's ranking tier
              },
            });
          }

          return { 
            received: true, 
            message: planChanged 
              ? 'Subscription updated successfully with plan change' 
              : 'Subscription updated successfully',
            eventType: event.type,
            subscriptionId: dbSubscription.id,
            planChanged,
            ...(planChanged && newPlanId ? { newPlanId } : {})
          };
        } else {
          console.warn(`[Subscription Webhook] customer.subscription.updated: Subscription ${subscription.id} not found in database`);
          // If subscription doesn't exist, it might be because checkout.session.completed hasn't been processed yet
          // In this case, we should try to create it from the subscription data if we can find the company
          // For now, return a message indicating it wasn't found
          return { 
            received: true, 
            message: 'Subscription updated event received but subscription not found in database. It may be created when checkout.session.completed is processed.',
            eventType: event.type,
            subscriptionId: subscription.id
          };
        }
      } catch (error: any) {
        console.error(`[Subscription Webhook] Error processing customer.subscription.updated:`, {
          error: error.message,
          stack: error.stack,
          eventId: event.id,
          subscriptionId: (event.data.object as Stripe.Subscription)?.id,
        });
        return {
          received: true,
          message: 'Subscription event customer.subscription.updated received but processing failed',
          eventType: event.type,
          error: error.message,
        };
      }
    }

    // Handle subscription cancelled
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const dbSubscription = await subscriptionRepository.findByStripeSubscriptionId(subscription.id);

      if (dbSubscription) {
        await subscriptionRepository.updateStatus(dbSubscription.id, 'CANCELLED');
        // Set company back to FREE plan when subscription is deleted
        await prisma.company.update({
          where: { id: dbSubscription.companyId },
          data: {
            activePlanId: null,
            planExpiresAt: null,
            plan: 'FREE',
            planActive: false,
            rankingTier: 'STANDARD', // Reset to FREE plan's ranking tier
          },
        });
        
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
    // Unhandled event type - log as warning for monitoring
    console.warn(`[Subscription Webhook] Unhandled event type: ${event.type}, Event ID: ${event.id}`);
    return { received: true, message: `Event ${event.type} received but not handled`, eventType: event.type };
  },

  async getMySubscription(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    // Check if user is company admin (subscription details should only be visible to admins)
    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can view subscription details');
    }

    // Get company to check plan
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        plan: true,
        planActive: true,
        planStartedAt: true,
        planRenewsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Check for active subscription
    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    
    // If no subscription but company is on FREE plan, return FREE plan info
    if (!subscription) {
      if (company.plan === 'FREE') {
        // Get FREE plan details from CompanyPlan table if it exists
        const freePlan = await prisma.companyPlan.findFirst({
          where: {
            carrierPlan: 'FREE',
          },
        });

        // Return FREE plan information in a format compatible with subscription response
        return {
          id: null as any,
          companyId: req.user.companyId,
          companyPlanId: freePlan?.id || null,
          companyPlan: freePlan || {
            id: 'free-plan',
            name: 'FREE',
            carrierPlan: 'FREE' as const,
            priceMonthly: 0,
            maxActiveShipmentSlots: null,
            maxTeamMembers: 1,
            isDefault: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          stripeCustomerId: company.stripeCustomerId || null,
          stripeSubscriptionId: null as any,
          status: 'FREE' as any, // FREE is not a SubscriptionStatus enum value, but we'll use it for FREE plan
          currentPeriodStart: company.planStartedAt,
          currentPeriodEnd: company.planRenewsAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      
      // For non-FREE plans without subscription, still return plan info but indicate no active subscription
      throw new NotFoundError('No active subscription found');
    }

    return subscription;
  },

  async syncSubscriptionFromStripe(req: AuthRequest, sessionId: string, updateOnboarding: boolean = true) {
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
      let onboardingUpdated = false;
      
      // Update onboarding step if requested and not already completed
      if (updateOnboarding) {
        try {
          const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { onboardingSteps: true, adminId: true },
          });

          if (company) {
            const steps = (company.onboardingSteps as any) || {};
            if (!steps.payment_setup?.completed) {
              await onboardingRepository.updateCompanyOnboardingStep(
                companyId,
                'payment_setup',
                true
              );
              onboardingUpdated = true;
            }

            // Trigger user onboarding recalculation
            if (company.adminId) {
              await onboardingRepository.updateUserOnboardingStep(
                company.adminId,
                'profile_completion',
                true
              ).catch((err) => {
                console.error('Failed to update user onboarding:', err);
              });
            }
          }
        } catch (err: any) {
          console.error(`[Sync Subscription] Failed to update onboarding:`, {
            error: err.message,
            stack: err.stack,
            companyId,
          });
        }
      }

      return {
        message: 'Subscription already exists in database',
        subscription: existingSubscription,
        onboardingUpdated,
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

    const created = await subscriptionRepository.upsertByStripeSubscriptionId(subscriptionData);
    await subscriptionRepository.updateCompanyPlan(
      companyId,
      planId,
      new Date(subscription.current_period_end * 1000)
    );

    // Mark payment_setup onboarding step as complete
    let onboardingUpdated = false;
    if (updateOnboarding) {
      try {
        await onboardingRepository.updateCompanyOnboardingStep(
          companyId,
          'payment_setup',
          true
        );
        onboardingUpdated = true;
      } catch (err: any) {
        console.error(`[Sync Subscription] Failed to update onboarding step:`, {
          error: err.message,
          stack: err.stack,
          companyId,
        });
        // Try one more time after a short delay
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await onboardingRepository.updateCompanyOnboardingStep(
            companyId,
            'payment_setup',
            true
          );
          onboardingUpdated = true;
        } catch (retryErr: any) {
          console.error(`[Sync Subscription] Retry also failed:`, retryErr.message);
        }
      }
    }

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
        onboardingUpdated,
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

    // Set company back to FREE plan
    await prisma.company.update({
      where: { id: req.user.companyId },
      data: {
        activePlanId: null,
        planExpiresAt: null,
        plan: 'FREE',
        planActive: false,
      },
    });
    
    // Update ranking tier to STANDARD for FREE plan
    const { getPlanEntitlements } = await import('../billing/plans');
    const freeEntitlements = getPlanEntitlements('FREE');
    await prisma.company.update({
      where: { id: req.user.companyId },
      data: {
        rankingTier: freeEntitlements.rankingTier,
      },
    });

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

    // Get company to check for Stripe customer ID
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { stripeCustomerId: true, plan: true },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Try to get active subscription first
    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    
    // Determine Stripe customer ID - use from subscription if available, otherwise from company
    let stripeCustomerId: string | null = null;
    
    if (subscription) {
      stripeCustomerId = subscription.stripeCustomerId;
    } else if (company.stripeCustomerId) {
      stripeCustomerId = company.stripeCustomerId;
    }

    stripeCustomerId = await ensureStripeCustomerId({
      companyId: req.user.companyId,
      plan: company.plan,
      existingStripeCustomerId: stripeCustomerId,
    });

    // Create Stripe billing portal session for payment method update
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${config.frontendUrl}/company/subscription`,
    });

    return {
      url: session.url,
    };
  },

  async createSubscriptionPortalSession(req: AuthRequest) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only company admins can manage subscriptions');
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { stripeCustomerId: true, plan: true },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const subscription = await subscriptionRepository.findByCompanyId(req.user.companyId);
    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new NotFoundError('Stripe subscription not found');
    }

    const stripeCustomerId = await ensureStripeCustomerId({
      companyId: req.user.companyId,
      plan: company.plan,
      existingStripeCustomerId: subscription.stripeCustomerId || company.stripeCustomerId,
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${config.frontendUrl}/company/subscription`,
      flow_data: {
        type: 'subscription_update',
        subscription_update: {
          subscription: subscription.stripeSubscriptionId,
        },
      },
    });

    return {
      url: session.url,
    };
  },
};

