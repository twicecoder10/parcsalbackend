import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Converts a number to base36 (0-9, A-Z)
 */
function toBase36(num: number): string {
  return num.toString(36).toUpperCase();
}

/**
 * Generates a custom booking ID in the format: BKG-YYYY-XXXXXXX
 * Format: BKG-{YEAR}-{SEQUENTIAL_NUMBER_IN_BASE36}
 * Example: BKG-2025-22A5726
 * 
 * @param tx Optional Prisma transaction client. If provided, uses the transaction for counting.
 */
export async function generateBookingId(
  tx?: Prisma.TransactionClient | PrismaClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = 'BKG';
  
  // Use provided transaction client or default prisma client
  const db = tx || prisma;
  
  // Get the count of bookings created this year
  const startOfYear = new Date(year, 0, 1);
  const bookingsThisYear = await db.booking.count({
    where: {
      createdAt: {
        gte: startOfYear,
      },
    },
  });
  
  // Generate sequential number (start from 1, so add 1 to count)
  const sequentialNumber = bookingsThisYear + 1;
  
  // Convert to base36
  let base36Id = toBase36(sequentialNumber);
  
  // For the format like "22A5726", we want a mix that looks natural
  // Let's use base36 encoding. The example "22A5726" is 7 characters
  // We'll pad to 7 characters, but use a more natural distribution
  // Actually, let's analyze: 22A5726 could be interpreted as:
  // - A sequential number in base36
  // Let's just use base36 with padding to 7 chars for consistency
  base36Id = base36Id.padStart(7, '0');
  
  // Generate the booking ID
  let bookingId = `${prefix}-${year}-${base36Id}`;
  
  // Check if this ID already exists (handle race conditions)
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const existing = await db.booking.findUnique({
      where: { id: bookingId },
    });
    
    if (!existing) {
      return bookingId;
    }
    
    // If collision occurs, increment and try again
    attempts++;
    const nextNumber = bookingsThisYear + 1 + attempts;
    base36Id = toBase36(nextNumber).padStart(7, '0');
    bookingId = `${prefix}-${year}-${base36Id}`;
  }
  
  // Fallback: use timestamp-based approach if all attempts fail
  const timestamp = Date.now().toString(36).toUpperCase().slice(-7).padStart(7, '0');
  return `${prefix}-${year}-${timestamp}`;
}

