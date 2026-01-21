import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Converts a number to base36 (0-9, A-Z)
 */
function toBase36(num: number): string {
  return num.toString(36).toUpperCase();
}

/**
 * Generates a hash from a string for use in PostgreSQL advisory locks
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates a custom payment ID in the format: PAY-YYYY-XXXXXXX
 * Format: PAY-{YEAR}-{SEQUENTIAL_NUMBER_IN_BASE36}
 * Example: PAY-2025-22A5726
 * 
 * Uses PostgreSQL advisory locks to ensure uniqueness even under concurrent requests.
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
  
  // Generate a unique lock key for this year and entity type
  const lockKey = `payment_id_${year}`;
  const lockHash = hashString(lockKey);
  
  // Acquire advisory lock to prevent race conditions
  try {
    if (tx) {
      // Within transaction - use transaction-level lock (auto-released)
      await db.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${lockHash})`
      );
    } else {
      // Outside transaction - use session-level lock with retry
      const lockResult = await db.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
        `SELECT pg_try_advisory_lock(${lockHash}) as pg_try_advisory_lock`
      );
      
      if (!lockResult[0]?.pg_try_advisory_lock) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
        const retryResult = await db.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
          `SELECT pg_try_advisory_lock(${lockHash}) as pg_try_advisory_lock`
        );
        if (!retryResult[0]?.pg_try_advisory_lock) {
          // Still locked, proceed with collision detection
        }
      }
    }
  } catch (error) {
    console.warn('[generatePaymentId] Advisory lock failed, falling back to collision detection:', error);
  }
  
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
  
  // Double-check if this ID already exists
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const existing = await db.payment.findUnique({
      where: { id: paymentId },
    });
    
    if (!existing) {
      // Release session-level lock if we acquired one
      if (!tx) {
        try {
          await db.$executeRawUnsafe(`SELECT pg_advisory_unlock(${lockHash})`);
        } catch (error) {
          // Ignore unlock errors
        }
      }
      return paymentId;
    }
    
    // If collision occurs, increment and try again
    attempts++;
    const nextNumber = paymentsThisYear + 1 + attempts;
    base36Id = toBase36(nextNumber).padStart(7, '0');
    paymentId = `${prefix}-${year}-${base36Id}`;
  }
  
  // Release session-level lock if we acquired one
  if (!tx) {
    try {
      await db.$executeRawUnsafe(`SELECT pg_advisory_unlock(${lockHash})`);
    } catch (error) {
      // Ignore unlock errors
    }
  }
  
  // Fallback: use timestamp-based approach if all attempts fail
  const timestamp = Date.now().toString(36).toUpperCase().slice(-7).padStart(7, '0');
  return `${prefix}-${year}-${timestamp}`;
}

