/**
 * Plan Configuration - Single Source of Truth
 * 
 * This file exports plan entitlements and helper functions for plan checking.
 * All feature enforcement should reference this configuration.
 */

import { CarrierPlan, CompanyRankingTier } from '@prisma/client';
import { getPlanEntitlements, PlanEntitlements, AnalyticsLevel, PayoutSpeed } from './plans';

export type { PlanEntitlements, AnalyticsLevel, PayoutSpeed };

/**
 * Get the company's plan (defaults to FREE if not set)
 */
export function getCompanyPlan(company: { plan?: CarrierPlan | null }): CarrierPlan {
  return company.plan || 'FREE';
}

/**
 * Get plan limits/entitlements for a company
 */
export function getPlanLimits(company: { plan?: CarrierPlan | null }): PlanEntitlements {
  const plan = getCompanyPlan(company);
  return getPlanEntitlements(plan);
}

/**
 * Check if company has a specific plan feature
 */
export function hasPlanFeature(
  company: { plan?: CarrierPlan | null },
  featureKey: keyof PlanEntitlements
): boolean {
  const limits = getPlanLimits(company);
  const value = limits[featureKey];
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  // For numeric/string values, check if truthy
  return Boolean(value);
}

/**
 * Get effective ranking tier for a company
 * Enterprise companies can have custom ranking overridden
 */
export function getEffectiveRankingTier(company: {
  plan?: CarrierPlan | null;
  rankingTier?: CompanyRankingTier | null;
}): CompanyRankingTier {
  const plan = getCompanyPlan(company);
  
  // Enterprise can have custom ranking override
  if (plan === 'ENTERPRISE' && company.rankingTier) {
    return company.rankingTier;
  }
  
  // Otherwise, derive from plan
  const limits = getPlanLimits(company);
  return limits.rankingTier;
}

/**
 * Get effective payout speed for a company
 * Enterprise companies can have SLA/custom payout speed
 */
export function getEffectivePayoutSpeed(company: {
  plan?: CarrierPlan | null;
}): PayoutSpeed {
  const limits = getPlanLimits(company);
  return limits.payoutSpeed;
}

/**
 * Get effective analytics level for a company
 * Enterprise companies can have custom analytics
 */
export function getEffectiveAnalyticsLevel(company: {
  plan?: CarrierPlan | null;
}): AnalyticsLevel {
  const limits = getPlanLimits(company);
  return limits.analyticsLevel;
}

/**
 * Check if company can use slot templates
 */
export function canUseSlotTemplates(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canUseSlotTemplates');
}

/**
 * Check if company can use advanced slot rules
 */
export function canUseAdvancedSlotRules(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canUseAdvancedSlotRules');
}

/**
 * Check if company can access scan module
 */
export function canAccessScanModule(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canAccessScanWarehouses');
}

/**
 * Check if company can access warehouses module
 */
export function canAccessWarehousesModule(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canAccessScanWarehouses');
}

/**
 * Get maximum team members for a company
 */
export function getMaxTeamMembers(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.maxTeamMembers;
}

/**
 * Get monthly marketing email limit
 */
export function getMarketingEmailLimit(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.marketingEmailMonthlyLimit;
}

/**
 * Get monthly promo credits included
 */
export function getMonthlyPromoCredits(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.monthlyPromoCreditsIncluded;
}

/**
 * Get maximum shipments per month
 */
export function getMaxShipmentsPerMonth(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.maxShipmentsPerMonth;
}

/**
 * Get WhatsApp promo message limit per month
 */
export function getWhatsappPromoLimit(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.whatsappPromoLimit;
}

/**
 * Get WhatsApp story post limit per month
 */
export function getWhatsappStoryLimit(company: { plan?: CarrierPlan | null }): number {
  const limits = getPlanLimits(company);
  return limits.whatsappStoryLimit;
}

/**
 * Check if company can run email campaigns
 */
export function canRunEmailCampaigns(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canRunEmailCampaigns');
}

/**
 * Check if company can access Scan module
 */
export function canUseScan(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canAccessScanWarehouses');
}

/**
 * Check if company can access Warehouses module
 */
export function canUseWarehouses(company: { plan?: CarrierPlan | null }): boolean {
  return hasPlanFeature(company, 'canAccessScanWarehouses');
}

