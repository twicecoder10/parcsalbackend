import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Converts a number to base36 (0-9, A-Z)
 */
function toBase36(num: number): string {
  return num.toString(36).toUpperCase();
}

/**
 * Generates a custom payment ID in the format: PAY-YYYY-XXXXXXX
 * Format: PAY-{YEAR}-{SEQUENTIAL_NUMBER_IN_BASE36}
 * Example: PAY-2025-22A5726
 * 
 * @param tx Optional Prisma transaction client. If provided, uses the transaction for counting.
 */
export async function generatePaymentId(
  tx?: Prisma.TransactionClient | PrismaClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = 'PAY';
  
  // Use provided transaction client or default prisma client
  const db = tx || prisma;
  
  // Get the count of payments created this year
  const startOfYear = new Date(year, 0, 1);
  const paymentsThisYear = await db.payment.count({
    where: {
      createdAt: {
        gte: startOfYear,
      },
    },
  });
  
  // Generate sequential number (start from 1, so add 1 to count)
  const sequentialNumber = paymentsThisYear + 1;
  
  // Convert to base36
  let base36Id = toBase36(sequentialNumber);
  
  // Pad to 7 characters for consistency
  base36Id = base36Id.padStart(7, '0');
  
  // Generate the payment ID
  let paymentId = `${prefix}-${year}-${base36Id}`;
  
  // Check if this ID already exists (handle race conditions)
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const existing = await db.payment.findUnique({
      where: { id: paymentId },
    });
    
    if (!existing) {
      return paymentId;
    }
    
    // If collision occurs, increment and try again
    attempts++;
    const nextNumber = paymentsThisYear + 1 + attempts;
    base36Id = toBase36(nextNumber).padStart(7, '0');
    paymentId = `${prefix}-${year}-${base36Id}`;
  }
  
  // Fallback: use timestamp-based approach if all attempts fail
  const timestamp = Date.now().toString(36).toUpperCase().slice(-7).padStart(7, '0');
  return `${prefix}-${year}-${timestamp}`;
}

