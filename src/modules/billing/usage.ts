/**
 * Usage Tracking Service
 * 
 * Handles monthly usage periods, credit allocation, and usage tracking
 */

import prisma from '../../config/database';
import { CreditTxnType, CreditWalletType } from '@prisma/client';
import { getPlanEntitlements } from './plans';

const WALLET_FIELDS: Record<
  CreditWalletType,
  { balance: 'whatsappPromoCreditsBalance' | 'whatsappStoryCreditsBalance' | 'marketingEmailCreditsBalance'; used: 'whatsappPromoCreditsUsed' | 'whatsappStoryCreditsUsed' | 'marketingEmailCreditsUsed' }
> = {
  WHATSAPP_PROMO: {
    balance: 'whatsappPromoCreditsBalance',
    used: 'whatsappPromoCreditsUsed',
  },
  WHATSAPP_STORY: {
    balance: 'whatsappStoryCreditsBalance',
    used: 'whatsappStoryCreditsUsed',
  },
  MARKETING_EMAIL: {
    balance: 'marketingEmailCreditsBalance',
    used: 'marketingEmailCreditsUsed',
  },
};

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
  const monthlyWalletCredits: Array<{ walletType: CreditWalletType; amount: number }> = [
    { walletType: 'WHATSAPP_PROMO', amount: entitlements.monthlyWhatsappPromoCreditsIncluded },
    { walletType: 'WHATSAPP_STORY', amount: entitlements.monthlyWhatsappStoryCreditsIncluded },
    { walletType: 'MARKETING_EMAIL', amount: entitlements.monthlyMarketingEmailCreditsIncluded },
  ];

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
        shipmentsCreated: 0,
        marketingEmailsSent: 0,
        whatsappPromoSent: 0,
        whatsappStoriesPosted: 0,
        whatsappPromoCreditsBalance: 0,
        whatsappPromoCreditsUsed: 0,
        whatsappStoryCreditsBalance: 0,
        whatsappStoryCreditsUsed: 0,
        marketingEmailCreditsBalance: 0,
        marketingEmailCreditsUsed: 0,
      },
    });

    // Allocate monthly credits if plan includes them
    for (const wallet of monthlyWalletCredits) {
      if (wallet.amount > 0 && wallet.amount !== Infinity) {
        await tx.companyCreditTransaction.create({
          data: {
            companyId,
            walletType: wallet.walletType,
            type: 'MONTHLY_ALLOCATION',
            amount: wallet.amount,
            reason: `Monthly allocation for ${plan} plan`,
            referenceId: usage.id,
          },
        });

        const fields = WALLET_FIELDS[wallet.walletType];
        await tx.companyUsage.update({
          where: { id: usage.id },
          data: {
            [fields.balance]: wallet.amount,
          },
        });
      }
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
 * Deduct credits for a specific wallet
 * Returns true if deduction was successful, false if insufficient credits
 */
export async function deductCredits(
  companyId: string,
  walletType: CreditWalletType,
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

  const fields = WALLET_FIELDS[walletType];
  const currentBalance = usage[fields.balance as keyof typeof usage] as number;

  if (currentBalance < amount) {
    return false; // Insufficient credits
  }

  // Deduct in transaction
  await prisma.$transaction(async (tx) => {
    // Create credit transaction
    await tx.companyCreditTransaction.create({
      data: {
        companyId,
        walletType,
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
        [fields.balance]: {
          decrement: amount,
        },
        [fields.used]: {
          increment: amount,
        },
      },
    });
  });

  return true;
}

/**
 * Add credits to a specific wallet (topup or grant)
 */
export async function addCredits(
  companyId: string,
  walletType: CreditWalletType,
  amount: number,
  type: 'TOPUP' | 'GRANT' = 'TOPUP',
  reason?: string,
  referenceId?: string
): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);

  const fields = WALLET_FIELDS[walletType];

  await prisma.$transaction(async (tx) => {
    // Create credit transaction
    await tx.companyCreditTransaction.create({
      data: {
        companyId,
        walletType,
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
        [fields.balance]: {
          increment: amount,
        },
      },
    });
  });
}

/**
 * Backward-compatible promo credit helpers (WhatsApp promo)
 */
export async function deductPromoCredits(
  companyId: string,
  amount: number,
  referenceId?: string,
  reason?: string
): Promise<boolean> {
  return deductCredits(companyId, 'WHATSAPP_PROMO', amount, referenceId, reason);
}

export async function addPromoCredits(
  companyId: string,
  amount: number,
  type: 'TOPUP' | 'GRANT' = 'TOPUP',
  reason?: string,
  referenceId?: string
): Promise<void> {
  return addCredits(companyId, 'WHATSAPP_PROMO', amount, type, reason, referenceId);
}

/**
 * Increment shipments created count
 */
export async function incrementShipmentsCreated(companyId: string, count: number = 1): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);
  
  await prisma.companyUsage.update({
    where: { companyId },
    data: {
      shipmentsCreated: {
        increment: count,
      },
    },
  });
}

/**
 * Increment WhatsApp promo messages sent count
 */
export async function incrementWhatsappPromoSent(companyId: string, count: number = 1): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);
  
  await prisma.companyUsage.update({
    where: { companyId },
    data: {
      whatsappPromoSent: {
        increment: count,
      },
    },
  });
}

/**
 * Increment WhatsApp stories posted count
 */
export async function incrementWhatsappStoriesPosted(companyId: string, count: number = 1): Promise<void> {
  await ensureCurrentUsagePeriod(companyId);
  
  await prisma.companyUsage.update({
    where: { companyId },
    data: {
      whatsappStoriesPosted: {
        increment: count,
      },
    },
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

