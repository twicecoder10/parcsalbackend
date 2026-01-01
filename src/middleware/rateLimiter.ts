import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../config/redis';
import { config } from '../config/env';

// Create sendCommand function for ioredis
const sendCommand: (...args: string[]) => Promise<any> = async (...args: string[]) => {
  return redisClient.call(...(args as [string, ...any[]]));
};

// Environment-based rate limit configuration
const isDevelopment = config.nodeEnv === 'development';
const isTest = config.nodeEnv === 'test';

/**
 * General API rate limiter
 * Development: 1000 requests per 15 minutes per IP (more lenient)
 * Production: 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:general:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : isTest ? 10000 : 100, // Much higher limits in dev/test
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

/**
 * Strict rate limiter for authentication endpoints
 * Development: 50 login attempts per 15 minutes per IP
 * Production: 5 login attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:auth:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : isTest ? 1000 : 5, // More lenient in dev/test
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

/**
 * Registration rate limiter
 * Development: 20 registration attempts per hour per IP
 * Production: 3 registration attempts per hour per IP
 */
export const registrationLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:register:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 20 : isTest ? 100 : 3, // More lenient in dev/test
  message: 'Too many registration attempts from this IP, please try again after an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

/**
 * Booking creation rate limiter
 * Development: 100 bookings per hour per user
 * Production: 10 bookings per hour per user
 */
export const bookingLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:booking:',
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 100 : isTest ? 1000 : 10, // More lenient in dev/test
  message: 'Too many booking requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Use user ID if authenticated, otherwise use IP (with proper IPv6 handling)
    return req.user?.id || ipKeyGenerator(req) || 'unknown';
  },
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

/**
 * Search rate limiter
 * Development: 300 search requests per minute per IP
 * Production: 60 search requests per minute per IP
 */
export const searchLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:search:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 300 : isTest ? 1000 : 60, // More lenient in dev/test
  message: 'Too many search requests, please try again in a minute.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

/**
 * Refresh token rate limiter
 * Development: 500 refresh requests per 15 minutes per user
 * Production: 100 refresh requests per 15 minutes per user
 */
export const refreshTokenLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix: 'rl:refresh:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 500 : isTest ? 10000 : 100, // More lenient in dev/test
  message: 'Too many token refresh requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Use user ID if authenticated, otherwise use IP (with proper IPv6 handling)
    return req.user?.id || ipKeyGenerator(req) || 'unknown';
  },
  skip: () => isTest, // Skip rate limiting entirely in test environment
});

