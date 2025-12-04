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

  async updateCompanyPlan(companyId: string, planId: string, planExpiresAt: Date | null): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        activePlanId: planId,
        planExpiresAt,
      },
    });
  },
};

