/**
 * Usage Tracking Service
 * 
 * Handles monthly usage periods, credit allocation, and usage tracking
 */

import prisma from '../../config/database';
import { CreditTxnType } from '@prisma/client';
import { getPlanEntitlements } from './plans';

/**
 * Get the start of the current month period
 */
function getCurrentPeriodStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Get the end of the current month period (start of next month)
 */
function getCurrentPeriodEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/**
 * Ensure a company has a current usage period record
 * Creates one if missing and allocates monthly included credits
 */
export async function ensureCurrentUsagePeriod(companyId: string): Promise<void> {
  const periodStart = getCurrentPeriodStart();
  const periodEnd = getCurrentPeriodEnd();

  // Check if usage record exists for current period
  const existingUsage = await prisma.companyUsage.findUnique({
    where: { companyId },
  });

  // If exists and is for current period, return
  if (existingUsage) {
    const existingStart = new Date(existingUsage.periodStart);
    const currentStart = new Date(periodStart);
    
    // Same month and year
    if (
      existingStart.getFullYear() === currentStart.getFullYear() &&
      existingStart.getMonth() === currentStart.getMonth()
    ) {
      return; // Already have current period
    }
  }

  // Get company to determine plan
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true },
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const plan = company.plan;
  const entitlements = getPlanEntitlements(plan);
  const monthlyCredits = entitlements.monthlyPromoCreditsIncluded;

  // Create or update usage record in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete old usage if exists (shouldn't happen, but be safe)
    if (existingUsage) {
      await tx.companyUsage.delete({
        where: { id: existingUsage.id },
      });
    }

    // Create new usage record
    const usage = await tx.companyUsage.create({
      data: {
        companyId,
        periodStart,
        periodEnd,
        marketingEmailsSent: 0,
        promoCreditsBalance: 0,
        promoCreditsUsed: 0,
      },
    });

    // Allocate monthly credits if plan includes them
    if (monthlyCredits > 0) {
      // Create credit transaction
      await tx.companyCreditTransaction.create({
        data: {
          companyId,
          type: 'MONTHLY_ALLOCATION',
          amount: monthlyCredits,
          reason: `Monthly allocation for ${plan} plan`,
          referenceId: usage.id,
        },
      });

      // Update usage balance
      await tx.companyUsage.update({
        where: { id: usage.id },
        data: {
          promoCreditsBalance: monthlyCredits,
        },
      });
    }
  });
}

/**
 * Increment marketing emails sent count
 */
export async function incrementMarketingEmailsSent(companyId: string, count: number = 1): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);
  
  await prisma.companyUsage.update({
    where: { companyId },
    data: {
      marketingEmailsSent: {
        increment: count,
      },
    },
  });
}

/**
 * Deduct promo credits (SMS/WhatsApp)
 * Returns true if deduction was successful, false if insufficient credits
 */
export async function deductPromoCredits(
  companyId: string,
  amount: number,
  referenceId?: string,
  reason?: string
): Promise<boolean> {
  await ensureCurrentUsagePeriod(companyId);

  const usage = await prisma.companyUsage.findUnique({
    where: { companyId },
  });

  if (!usage) {
    throw new Error(`Usage record not found for company: ${companyId}`);
  }

  if (usage.promoCreditsBalance < amount) {
    return false; // Insufficient credits
  }

  // Deduct in transaction
  await prisma.$transaction(async (tx) => {
    // Create credit transaction
    await tx.companyCreditTransaction.create({
      data: {
        companyId,
        type: 'SPEND',
        amount: -amount,
        reason: reason || 'Promo campaign send',
        referenceId,
      },
    });

    // Update usage
    await tx.companyUsage.update({
      where: { companyId },
      data: {
        promoCreditsBalance: {
          decrement: amount,
        },
        promoCreditsUsed: {
          increment: amount,
        },
      },
    });
  });

  return true;
}

/**
 * Add promo credits (topup or grant)
 */
export async function addPromoCredits(
  companyId: string,
  amount: number,
  type: 'TOPUP' | 'GRANT' = 'TOPUP',
  reason?: string,
  referenceId?: string
): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);

  await prisma.$transaction(async (tx) => {
    // Create credit transaction
    await tx.companyCreditTransaction.create({
      data: {
        companyId,
        type: type === 'TOPUP' ? CreditTxnType.TOPUP : CreditTxnType.GRANT,
        amount,
        reason,
        referenceId,
      },
    });

    // Update usage balance
    await tx.companyUsage.update({
      where: { companyId },
      data: {
        promoCreditsBalance: {
          increment: amount,
        },
      },
    });
  });
}

/**
 * Get current usage for a company
 */
export async function getCompanyUsage(companyId: string) {
  await ensureCurrentUsagePeriod(companyId);
  
  return prisma.companyUsage.findUnique({
    where: { companyId },
    include: {
      company: {
        select: {
          plan: true,
        },
      },
    },
  });
}

