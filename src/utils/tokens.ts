import crypto from 'crypto';

/**
 * Generate a random token for email verification or password reset
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a token with expiration (returns token and expiration date)
 */
export function generateTokenWithExpiry(hours: number = 24): { token: string; expiresAt: Date } {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return { token, expiresAt };
}

