/**
 * Payment Calculator Utility
 * 
 * Calculates booking charges including:
 * - Base amount (shipment price)
 * - Admin fee (15% of base amount, capped per currency)
 * - Processing fee (grossed-up so Stripe fees are covered by the customer)
 * - Total amount
 * 
 * All amounts are in MINOR units (pence/cents).
 */

import {
  type SupportedCurrency,
  minorToMajor as moneyMinorToMajor,
  majorToMinor as moneyMajorToMinor,
} from './money';

export interface BookingCharges {
  baseAmount: number;
  adminFeeAmount: number;
  processingFeeAmount: number;
  totalAmount: number;
}

export interface StripeReadyAmount {
  amountMinor: number;
  currency: string;
}

/**
 * Admin-fee cap per currency in minor units.
 * Roughly equivalent across currencies (~£10 / $13 / €12 / CA$17).
 */
const ADMIN_FEE_CAP: Record<SupportedCurrency, number> = {
  GBP: 1000,
  USD: 1300,
  EUR: 1200,
  CAD: 1700,
};

/**
 * Calculate booking charges.
 *
 * @param baseAmountMinor - Base shipment price in minor units
 * @param commissionBps - Commission rate in basis points (default 1500 = 15%)
 * @param currency - ISO 4217 currency code (default GBP)
 */
export function calculateBookingCharges(
  baseAmountMinor: number,
  commissionBps: number = 1500,
  currency: SupportedCurrency = 'GBP',
): BookingCharges {
  if (!Number.isFinite(baseAmountMinor) || baseAmountMinor < 0) {
    throw new Error('Base amount must be a non-negative finite number');
  }

  if (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('Commission rate must be between 0 and 10000 basis points (0-100%)');
  }

  const COMMISSION_PERCENT = commissionBps / 10000;

  const STRIPE_PERCENT = Number(process.env.STRIPE_FEE_PERCENT ?? '0.0325');

  if (!Number.isFinite(STRIPE_PERCENT) || STRIPE_PERCENT < 0 || STRIPE_PERCENT >= 1) {
    throw new Error('STRIPE_FEE_PERCENT must be a number in [0, 1)');
  }

  // Stripe fixed fee per currency (in minor units)
  const STRIPE_FIXED_BY_CURRENCY: Record<SupportedCurrency, number> = {
    GBP: 20, // £0.20
    USD: 30, // $0.30
    EUR: 25, // €0.25
    CAD: 30, // CA$0.30
  };
  const STRIPE_FIXED_MINOR = STRIPE_FIXED_BY_CURRENCY[currency] ?? 20;

  const capMinor = ADMIN_FEE_CAP[currency] ?? ADMIN_FEE_CAP.GBP;
  const calculatedAdminFee = Math.round(baseAmountMinor * COMMISSION_PERCENT);
  const adminFeeAmount = Math.min(calculatedAdminFee, capMinor);

  const grossedUpTotal = Math.ceil(
    (baseAmountMinor + adminFeeAmount + STRIPE_FIXED_MINOR) / (1 - STRIPE_PERCENT)
  );

  const processingFeeAmount = grossedUpTotal - baseAmountMinor - adminFeeAmount;

  return {
    baseAmount: baseAmountMinor,
    adminFeeAmount,
    processingFeeAmount,
    totalAmount: grossedUpTotal,
  };
}

/**
 * Build a Stripe-ready payment descriptor from charges + currency.
 */
export function toStripeAmount(
  totalAmountMinor: number,
  currency: SupportedCurrency,
): StripeReadyAmount {
  return {
    amountMinor: totalAmountMinor,
    currency: currency.toLowerCase(),
  };
}

/**
 * Convert minor units to major units (pence to pounds, cents to dollars, etc.)
 * @deprecated Prefer the currency-aware version from `src/utils/money.ts`
 */
export function minorToMajor(minorAmount: number): number {
  return moneyMinorToMajor(minorAmount, 'GBP');
}

/**
 * Convert major units to minor units (pounds to pence, dollars to cents, etc.)
 * @deprecated Prefer the currency-aware version from `src/utils/money.ts`
 */
export function majorToMinor(majorAmount: number): number {
  return moneyMajorToMinor(majorAmount, 'GBP');
}

