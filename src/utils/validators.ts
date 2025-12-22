import { z } from 'zod';

/**
 * Custom validator for booking IDs in format: BKG-YYYY-XXXXXXX
 * Example: BKG-2025-22A5726 or BKG-2025-000000E
 * Supports 7+ alphanumeric characters after the year
 */
export const bookingIdValidator = z
  .string()
  .regex(
    /^BKG-\d{4}-[0-9A-Z]{7,}$/,
    'Invalid booking ID format. Expected format: BKG-YYYY-XXXXXXX (where XXXXXXX is 7+ alphanumeric characters)'
  );

/**
 * Custom validator for payment IDs in format: PAY-YYYY-XXXXXXX
 * Example: PAY-2025-22A5726
 */
export const paymentIdValidator = z
  .string()
  .regex(
    /^PAY-\d{4}-[0-9A-Z]{7}$/,
    'Invalid payment ID format. Expected format: PAY-YYYY-XXXXXXX'
  );

