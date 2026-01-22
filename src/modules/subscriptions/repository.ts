import prisma from '../../config/database';
import { Subscription, SubscriptionStatus } from '@prisma/client';

export interface CreateSubscriptionData {
  companyId: string;
  companyPlanId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export const subscriptionRepository = {
  async create(data: CreateSubscriptionData): Promise<Subscription> {
    return prisma.subscription.create({
      data,
      include: {
        companyPlan: true,
        company: true,
      },
    });
  },

  async upsertByStripeSubscriptionId(data: CreateSubscriptionData): Promise<Subscription> {
    return prisma.subscription.upsert({
      where: { stripeSubscriptionId: data.stripeSubscriptionId },
      create: data,
      update: {
        companyId: data.companyId,
        companyPlanId: data.companyPlanId,
        stripeCustomerId: data.stripeCustomerId,
        status: data.status,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
      },
      include: {
        companyPlan: true,
        company: true,
      },
    });
  },

  async findByCompanyId(companyId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
      },
      include: {
        companyPlan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: {
        companyPlan: true,
        company: true,
      },
    });
  },

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    currentPeriodStart?: Date,
    currentPeriodEnd?: Date
  ): Promise<Subscription> {
    const updateData: any = { status };
    if (currentPeriodStart) updateData.currentPeriodStart = currentPeriodStart;
    if (currentPeriodEnd) updateData.currentPeriodEnd = currentPeriodEnd;

    return prisma.subscription.update({
      where: { id },
      data: updateData,
      include: {
        companyPlan: true,
        company: true,
      },
    });
  },

  async updatePlan(
    id: string,
    companyPlanId: string
  ): Promise<Subscription> {
    return prisma.subscription.update({
      where: { id },
      data: { companyPlanId },
      include: {
        companyPlan: true,
        company: true,
      },
    });
  },

  async updateCompanyPlan(companyId: string, planId: string, planExpiresAt: Date | null): Promise<void> {
    // Get the plan to determine CarrierPlan enum value
    const plan = await prisma.companyPlan.findUnique({
      where: { id: planId },
      select: { carrierPlan: true },
    });

    if (!plan || !plan.carrierPlan) {
      throw new Error(`Plan not found or carrierPlan not set for planId: ${planId}`);
    }

    // Get current company to check if planStartedAt is already set
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { planStartedAt: true },
    });

    const updateData: any = {
      activePlanId: planId,
      planExpiresAt,
      plan: plan.carrierPlan, // Update the CarrierPlan enum field
      planActive: true, // Mark plan as active
    };

    // Only set planStartedAt if not already set (first subscription)
    if (!company?.planStartedAt) {
      updateData.planStartedAt = new Date();
    }

    // Update ranking tier based on plan (unless Enterprise with custom override)
    const { getPlanEntitlements } = await import('../billing/plans');
    const entitlements = getPlanEntitlements(plan.carrierPlan);
    if (plan.carrierPlan !== 'ENTERPRISE') {
      updateData.rankingTier = entitlements.rankingTier;
    } else {
      // For Enterprise, only set to CUSTOM if not already set
      const currentCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: { rankingTier: true },
      });
      if (currentCompany?.rankingTier !== 'CUSTOM') {
        updateData.rankingTier = entitlements.rankingTier;
      }
    }

    await prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });
  },
};

