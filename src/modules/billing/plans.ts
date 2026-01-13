/**
 * Plan Entitlements Configuration
 * 
 * This is the single source of truth for plan features and limits.
 * All feature gating should reference this configuration.
 */

import { CarrierPlan, CompanyRankingTier } from '@prisma/client';

export type AnalyticsLevel = 'BASIC' | 'ENHANCED' | 'FULL' | 'CUSTOM';
export type PayoutSpeed = '48H' | '24_48H' | 'NEXT_DAY' | 'SLA';

export interface PlanEntitlements {
  maxTeamMembers: number; // Infinity for unlimited
  rankingTier: CompanyRankingTier;
  payoutSpeed: PayoutSpeed;
  canUseSlotTemplates: boolean;
  canUseAdvancedSlotRules: boolean;
  canAccessScanWarehouses: boolean;
  analyticsLevel: AnalyticsLevel;
  marketingEmailMonthlyLimit: number; // 0 means no included, but pay-as-you-go allowed for FREE
  monthlyPromoCreditsIncluded: number;
  canRunCarrierPromoCampaigns: boolean; // FREE can only if they have PAYG credits
}

const PLAN_ENTITLEMENTS: Record<CarrierPlan, PlanEntitlements> = {
  FREE: {
    maxTeamMembers: 1,
    rankingTier: 'STANDARD',
    payoutSpeed: '48H',
    canUseSlotTemplates: false,
    canUseAdvancedSlotRules: false,
    canAccessScanWarehouses: false,
    analyticsLevel: 'BASIC',
    marketingEmailMonthlyLimit: 0, // No included, but PAYG credits allowed
    monthlyPromoCreditsIncluded: 0,
    canRunCarrierPromoCampaigns: false, // Only via PAYG credits (checked separately)
  },
  STARTER: {
    maxTeamMembers: 3,
    rankingTier: 'PRIORITY',
    payoutSpeed: '24_48H',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: false,
    canAccessScanWarehouses: false,
    analyticsLevel: 'ENHANCED',
    marketingEmailMonthlyLimit: 5000,
    monthlyPromoCreditsIncluded: 100,
    canRunCarrierPromoCampaigns: true,
  },
  PROFESSIONAL: {
    maxTeamMembers: 10,
    rankingTier: 'HIGHEST',
    payoutSpeed: 'NEXT_DAY',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: true,
    canAccessScanWarehouses: true,
    analyticsLevel: 'FULL',
    marketingEmailMonthlyLimit: 20000,
    monthlyPromoCreditsIncluded: 500,
    canRunCarrierPromoCampaigns: true,
  },
  ENTERPRISE: {
    maxTeamMembers: Infinity,
    rankingTier: 'CUSTOM',
    payoutSpeed: 'SLA',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: true,
    canAccessScanWarehouses: true,
    analyticsLevel: 'CUSTOM',
    marketingEmailMonthlyLimit: Infinity, // Custom limit per company
    monthlyPromoCreditsIncluded: Infinity, // Custom allocation per company
    canRunCarrierPromoCampaigns: true,
  },
};

/**
 * Get entitlements for a plan
 */
export function getPlanEntitlements(plan: CarrierPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

/**
 * Get effective commission rate in basis points
 * 
 * @param company - Company with optional commissionRateBps override
 * @returns Commission rate in basis points (e.g., 1500 = 15.00%)
 */
export function getEffectiveCommissionBps(company: { commissionRateBps?: number | null }): number {
  // If company has a custom commission rate override, use it
  if (company.commissionRateBps != null) {
    return company.commissionRateBps;
  }
  
  // Default: 15% (1500 basis points)
  return 1500;
}

/**
 * Convert basis points to percentage
 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/**
 * Convert percentage to basis points
 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

