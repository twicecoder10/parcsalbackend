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
  maxShipmentsPerMonth: number; // Infinity for unlimited
  maxTeamMembers: number; // Infinity for unlimited
  rankingTier: CompanyRankingTier;
  payoutSpeed: PayoutSpeed;
  canUseSlotTemplates: boolean;
  canUseAdvancedSlotRules: boolean;
  canAccessScanWarehouses: boolean;
  analyticsLevel: AnalyticsLevel;
  marketingEmailMonthlyLimit: number; // 0 means no included, but pay-as-you-go allowed for FREE
  monthlyWhatsappPromoCreditsIncluded: number;
  monthlyWhatsappStoryCreditsIncluded: number;
  monthlyMarketingEmailCreditsIncluded: number;
  whatsappPromoLimit: number; // Monthly included WhatsApp promo messages
  whatsappStoryLimit: number; // Monthly WhatsApp story posts
  canRunCarrierPromoCampaigns: boolean; // FREE can only if they have PAYG credits
  canRunEmailCampaigns: boolean; // FREE cannot run email campaigns (only PAYG promo credits)
  commissionRate: number; // Commission rate as decimal (0.15 = 15%)
}

const PLAN_ENTITLEMENTS: Record<CarrierPlan, PlanEntitlements> = {
  FREE: {
    maxShipmentsPerMonth: 3,
    maxTeamMembers: 1,
    rankingTier: 'STANDARD',
    payoutSpeed: '48H',
    canUseSlotTemplates: false,
    canUseAdvancedSlotRules: false,
    canAccessScanWarehouses: true, // Warehouses available to all plans (no enforcement)
    analyticsLevel: 'BASIC',
    marketingEmailMonthlyLimit: 0, // No email campaigns allowed
    monthlyWhatsappPromoCreditsIncluded: 0,
    monthlyWhatsappStoryCreditsIncluded: 0,
    monthlyMarketingEmailCreditsIncluded: 0,
    whatsappPromoLimit: 0,
    whatsappStoryLimit: 0,
    canRunCarrierPromoCampaigns: false, // Only via PAYG credits (checked separately)
    canRunEmailCampaigns: false, // No email campaigns on FREE plan
    commissionRate: 0.15, // 15% commission
  },
  STARTER: {
    maxShipmentsPerMonth: 20,
    maxTeamMembers: 3,
    rankingTier: 'STANDARD', // Changed from PRIORITY to STANDARD per requirements
    payoutSpeed: '24_48H',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: false,
    canAccessScanWarehouses: true, // Access to Scan and Warehouses modules
    analyticsLevel: 'ENHANCED',
    marketingEmailMonthlyLimit: 1000, // 1,000 emails / month
    monthlyWhatsappPromoCreditsIncluded: 100, // Match included promo limit
    monthlyWhatsappStoryCreditsIncluded: 20, // Match included story limit
    monthlyMarketingEmailCreditsIncluded: 1000, // Match included email limit
    whatsappPromoLimit: 100, // 100 promo WhatsApp messages / month
    whatsappStoryLimit: 20, // 20 story posts / month
    canRunCarrierPromoCampaigns: true,
    canRunEmailCampaigns: true,
    commissionRate: 0, // 0% commission
  },
  PROFESSIONAL: {
    maxShipmentsPerMonth: Infinity, // UNLIMITED
    maxTeamMembers: Infinity, // UNLIMITED
    rankingTier: 'PRIORITY', // Priority search ranking
    payoutSpeed: 'NEXT_DAY',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: true,
    canAccessScanWarehouses: true,
    analyticsLevel: 'FULL',
    marketingEmailMonthlyLimit: 5000, // 5,000 emails / month
    monthlyWhatsappPromoCreditsIncluded: 250,
    monthlyWhatsappStoryCreditsIncluded: 50,
    monthlyMarketingEmailCreditsIncluded: 5000,
    whatsappPromoLimit: 250, // 250 promo WhatsApp messages / month
    whatsappStoryLimit: 50, // 50 story posts / month
    canRunCarrierPromoCampaigns: true,
    canRunEmailCampaigns: true,
    commissionRate: 0, // 0% commission
  },
  ENTERPRISE: {
    maxShipmentsPerMonth: Infinity, // Custom limits via admin override
    maxTeamMembers: Infinity,
    rankingTier: 'CUSTOM',
    payoutSpeed: 'SLA',
    canUseSlotTemplates: true,
    canUseAdvancedSlotRules: true,
    canAccessScanWarehouses: true,
    analyticsLevel: 'CUSTOM',
    marketingEmailMonthlyLimit: Infinity, // Custom limit per company
    monthlyWhatsappPromoCreditsIncluded: Infinity,
    monthlyWhatsappStoryCreditsIncluded: Infinity,
    monthlyMarketingEmailCreditsIncluded: Infinity,
    whatsappPromoLimit: Infinity, // Custom limit
    whatsappStoryLimit: Infinity, // Custom limit
    canRunCarrierPromoCampaigns: true,
    canRunEmailCampaigns: true,
    commissionRate: 0, // Default 0%, but can be overridden via commissionRateBps
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
 * @param company - Company with plan and optional commissionRateBps override
 * @returns Commission rate in basis points (e.g., 1500 = 15.00%)
 */
export function getEffectiveCommissionBps(company: { 
  plan?: CarrierPlan | null;
  commissionRateBps?: number | null;
}): number {
  // If company has a custom commission rate override, use it (for Enterprise)
  if (company.commissionRateBps != null) {
    return company.commissionRateBps;
  }
  
  // Get commission rate from plan
  const plan = company.plan || 'FREE';
  const entitlements = getPlanEntitlements(plan);
  const commissionRate = entitlements.commissionRate;
  
  // Convert to basis points (0.15 -> 1500)
  return Math.round(commissionRate * 10000);
}

/**
 * Get effective commission rate as decimal
 * 
 * @param company - Company with plan and optional commissionRateBps override
 * @returns Commission rate as decimal (e.g., 0.15 = 15%)
 */
export function getEffectiveCommissionRate(company: { 
  plan?: CarrierPlan | null;
  commissionRateBps?: number | null;
}): number {
  // If company has a custom commission rate override, use it (for Enterprise)
  if (company.commissionRateBps != null) {
    return company.commissionRateBps / 10000; // Convert from basis points
  }
  
  // Get commission rate from plan
  const plan = company.plan || 'FREE';
  const entitlements = getPlanEntitlements(plan);
  return entitlements.commissionRate;
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

