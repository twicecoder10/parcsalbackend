/**
 * Payment Calculator Utility
 * 
 * Calculates booking charges including:
 * - Base amount (shipment price)
 * - Admin fee (10% of base, capped at £10)
 * - Processing fee (grossed-up so Stripe fees are covered by the customer; UK card estimate 1.4% + £0.20)
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
 * @returns BookingCharges object with all amounts in minor units
 */
export function calculateBookingCharges(baseAmountMinor: number): BookingCharges {
  if (!Number.isFinite(baseAmountMinor) || baseAmountMinor < 0) {
    throw new Error('Base amount must be a non-negative finite number');
  }

  // -----------------------------
  // Config (minor units)
  // -----------------------------
  const ADMIN_FEE_PERCENT = 0.10;
  const ADMIN_FEE_CAP_MINOR = 1000; // £10

  // Stripe UK card fee estimate. Note: actual fees can vary by payment method/card.
  const STRIPE_PERCENT = 0.014;
  const STRIPE_FIXED_MINOR = 20; // £0.20

  // -----------------------------
  // Admin fee
  // -----------------------------
  const adminFeeAmount = Math.min(
    Math.round(baseAmountMinor * ADMIN_FEE_PERCENT),
    ADMIN_FEE_CAP_MINOR
  );

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

