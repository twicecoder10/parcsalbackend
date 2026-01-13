import { config } from '../../config/env';
import { CarrierPlan } from '@prisma/client';

/**
 * Maps Stripe Price ID to internal CompanyPlan enum
 * @param priceId - Stripe price ID (e.g., "price_...")
 * @returns CompanyPlan enum value or null if not found
 */
export function planFromPriceId(priceId: string): CarrierPlan | null {
  if (!priceId || typeof priceId !== 'string') {
    return null;
  }

  // Guard: throw if env vars missing in production
  if (config.nodeEnv === 'production') {
    if (!config.stripe.priceStarterId || !config.stripe.priceProfessionalId) {
      throw new Error(
        'Stripe price IDs are required in production. Please set STRIPE_PRICE_STARTER_ID and STRIPE_PRICE_PROFESSIONAL_ID'
      );
    }
  }

  // Map price IDs to plans
  if (config.stripe.priceStarterId && priceId === config.stripe.priceStarterId) {
    return 'STARTER';
  }

  if (config.stripe.priceProfessionalId && priceId === config.stripe.priceProfessionalId) {
    return 'PROFESSIONAL';
  }

  if (config.stripe.priceEnterpriseId && priceId === config.stripe.priceEnterpriseId) {
    return 'ENTERPRISE';
  }

  // No match found
  return null;
}

/**
 * Get all configured price IDs
 */
export function getAllPriceIds(): string[] {
  const priceIds: string[] = [];
  
  if (config.stripe.priceStarterId) {
    priceIds.push(config.stripe.priceStarterId);
  }
  
  if (config.stripe.priceProfessionalId) {
    priceIds.push(config.stripe.priceProfessionalId);
  }
  
  if (config.stripe.priceEnterpriseId) {
    priceIds.push(config.stripe.priceEnterpriseId);
  }
  
  return priceIds;
}

