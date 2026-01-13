/**
 * Payment Calculator Utility
 * 
 * Calculates booking charges including:
 * - Base amount (shipment price)
 * - Admin fee (commission rate from company plan, default 15%)
 * - Processing fee (grossed-up so Stripe fees are covered by the customer; configured percent + fixed fee)
 * - Total amount
 * 
 * All amounts are in MINOR units (pence for GBP)
 */

export interface BookingCharges {
  baseAmount: number;        // Shipment price in minor units
  adminFeeAmount: number;     // Parcsal admin fee in minor units
  processingFeeAmount: number; // Stripe processing fee in minor units
  totalAmount: number;        // Total amount in minor units
}

/**
 * Calculate booking charges
 * 
 * @param baseAmountMinor - Base shipment price in minor units (pence)
 * @param commissionBps - Optional commission rate in basis points (e.g., 1500 = 15.00%). Defaults to 1500 (15%)
 * @returns BookingCharges object with all amounts in minor units
 */
export function calculateBookingCharges(baseAmountMinor: number, commissionBps: number = 1500): BookingCharges {
  if (!Number.isFinite(baseAmountMinor) || baseAmountMinor < 0) {
    throw new Error('Base amount must be a non-negative finite number');
  }

  if (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10000) {
    throw new Error('Commission rate must be between 0 and 10000 basis points (0-100%)');
  }

  // -----------------------------
  // Config (minor units)
  // -----------------------------
  const COMMISSION_PERCENT = commissionBps / 10000; // Convert basis points to decimal (1500 bps = 0.15 = 15%)

  // Stripe processing fee estimate used for gross-up. Actual Stripe fees can vary by payment method/card.
  // Configure via env to match your Stripe account pricing.
  const STRIPE_PERCENT = Number(process.env.STRIPE_FEE_PERCENT ?? '0.0325');
  const STRIPE_FIXED_MINOR = Number(process.env.STRIPE_FEE_FIXED_MINOR ?? '20');

  if (!Number.isFinite(STRIPE_PERCENT) || STRIPE_PERCENT < 0 || STRIPE_PERCENT >= 1) {
    throw new Error('STRIPE_FEE_PERCENT must be a number in [0, 1)');
  }
  if (!Number.isFinite(STRIPE_FIXED_MINOR) || STRIPE_FIXED_MINOR < 0) {
    throw new Error('STRIPE_FEE_FIXED_MINOR must be a non-negative number');
  }

  // -----------------------------
  // Admin fee (commission)
  // -----------------------------
  const adminFeeAmount = Math.round(baseAmountMinor * COMMISSION_PERCENT);

  // -----------------------------
  // Gross-up total so that:
  //   total - (total*STRIPE_PERCENT + STRIPE_FIXED) = base + adminFee
  // => total = (base + adminFee + STRIPE_FIXED) / (1 - STRIPE_PERCENT)
  // We ceil to ensure we never under-collect.
  // -----------------------------
  const grossedUpTotal = Math.ceil(
    (baseAmountMinor + adminFeeAmount + STRIPE_FIXED_MINOR) / (1 - STRIPE_PERCENT)
  );

  // The processing fee we display/record is simply the remainder after base + admin.
  const processingFeeAmount = grossedUpTotal - baseAmountMinor - adminFeeAmount;

  return {
    baseAmount: baseAmountMinor,
    adminFeeAmount,
    processingFeeAmount,
    totalAmount: grossedUpTotal,
  };
}

/**
 * Convert minor units to major units (pence to pounds)
 * 
 * @param minorAmount - Amount in minor units
 * @returns Amount in major units
 */
export function minorToMajor(minorAmount: number): number {
  return minorAmount / 100;
}

/**
 * Convert major units to minor units (pounds to pence)
 * 
 * @param majorAmount - Amount in major units
 * @returns Amount in minor units
 */
export function majorToMinor(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}

