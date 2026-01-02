import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { generalLimiter } from './middleware/rateLimiter';

// Import routes
import authRoutes from './modules/auth/routes';
import planRoutes from './modules/plans/routes';
import companyRoutes from './modules/companies/routes';
import shipmentRoutes from './modules/shipments/routes';
import bookingRoutes from './modules/bookings/routes';
import paymentRoutes from './modules/payments/routes';
import companyPaymentRoutes from './modules/payments/company-routes';
import subscriptionRoutes from './modules/subscriptions/routes';
import adminRoutes from './modules/admin/routes';
import contactRoutes from './modules/contact/routes';
import onboardingRoutes from './modules/onboarding/routes';
import customerRoutes from './modules/customer/routes';
import notificationRoutes from './modules/notifications/routes';
import uploadRoutes from './modules/uploads/routes';
import reviewRoutes from './modules/reviews/routes';
import chatRoutes from './modules/chat/routes';
import connectRoutes from './modules/connect/routes';
import extraChargeRoutes from './modules/extra-charges/routes';
import { paymentController } from './modules/payments/controller';
import {
  adminRouter as marketingAdminRoutes,
  companyRouter as marketingCompanyRoutes,
  consentRouter as marketingConsentRoutes,
  publicRouter as marketingPublicRoutes,
} from './modules/marketing/routes';

const app: Express = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = config.getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow any local network IP with the same port
    if (config.nodeEnv !== 'production') {
      const port = config.port.toString();
      const localPatterns = [
        new RegExp(`^http://localhost:${port}$`),
        new RegExp(`^http://127\\.0\\.0\\.1:${port}$`),
        new RegExp(`^http://192\\.168\\.\\d+\\.\\d+:${port}$`),
        new RegExp(`^http://10\\.\\d+\\.\\d+\\.\\d+:${port}$`),
        new RegExp(`^http://172\\.(1[6-9]|2[0-9]|3[0-1])\\.\\d+\\.\\d+:${port}$`),
        /^exp:\/\/.*$/, // Expo app origins
      ];
      
      if (localPatterns.some(pattern => pattern.test(origin))) {
        return callback(null, true);
      }
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Apply raw body parser for Stripe webhooks (must be before JSON parser)
// This preserves the raw body buffer needed for signature verification
app.use('/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/webhook/stripe', express.raw({ type: 'application/json' })); // Alternative path for Stripe webhooks
app.use('/subscriptions/webhooks/stripe-subscriptions', express.raw({ type: 'application/json' }));

// JSON parser for all routes except webhooks
// Webhook routes already have raw body parser applied above
// Increased limit to handle rich marketing payloads
const jsonParser = express.json({ limit: '2mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '2mb' });

app.use((req, res, next) => {
  // Skip JSON parsing for webhook routes (they use raw body)
  if (
    req.path === '/payments/webhooks/stripe' ||
    req.path === '/webhook/stripe' ||
    req.path === '/subscriptions/webhooks/stripe-subscriptions'
  ) {
    return next();
  }
  jsonParser(req, res, next);
});

app.use(urlencodedParser);

// Request logging middleware (after body parsers, before routes)
app.use(requestLogger);

// Apply general rate limiting to all routes (except webhooks and analytics)
app.use((req, res, next) => {
  // Skip rate limiting for webhook routes (they have their own validation)
  if (
    req.path === '/payments/webhooks/stripe' ||
    req.path === '/webhook/stripe' ||
    req.path === '/subscriptions/webhooks/stripe-subscriptions'
  ) {
    return next();
  }
  // Skip general rate limiting for analytics routes (they have their own limiter)
  if (req.path === '/companies/analytics' || req.path.startsWith('/companies/analytics?')) {
    return next();
  }
  generalLimiter(req, res, next);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/plans', planRoutes);
// Register specific company routes BEFORE the general /companies route
// to avoid conflicts with the catch-all :companyIdOrSlug route
app.use('/companies/shipments', shipmentRoutes);
app.use('/companies/bookings', bookingRoutes);
app.use('/companies/payments', companyPaymentRoutes);
app.use('/companies/subscription', subscriptionRoutes); // Company admin subscription routes (GET /, POST /cancel, PUT /payment-method)
app.use('/companies/notifications', notificationRoutes);
app.use('/companies', companyRoutes);
app.use('/shipments', shipmentRoutes); // Keep for backward compatibility
app.use('/bookings', bookingRoutes); // Keep for backward compatibility
app.use('/payments', paymentRoutes);
// Webhook route at root level (for Stripe webhook configuration)
// This handles /webhook/stripe (without 's' and without /payments prefix)
app.post('/webhook/stripe', paymentController.handleWebhook);
app.use('/subscriptions', subscriptionRoutes);
app.use('/admin', adminRoutes);
app.use('/contact', contactRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/customer', customerRoutes);
app.use('/customer/notifications', notificationRoutes);
app.use('/companies/notifications', notificationRoutes);
app.use('/uploads', uploadRoutes);
app.use('/', reviewRoutes); // Reviews routes (includes /bookings/:bookingId/reviews, /companies/:companyId/reviews, etc.)
app.use('/chat', chatRoutes); // Chat routes
app.use('/connect', connectRoutes); // Stripe Connect routes
app.use('/', extraChargeRoutes); // Extra charges routes (includes /bookings/:bookingId/extra-charges)
app.use('/admin/marketing', marketingAdminRoutes); // Admin marketing routes
app.use('/companies/marketing', marketingCompanyRoutes); // Company marketing routes
app.use('/me', marketingConsentRoutes); // User consent routes
app.use('/marketing', marketingPublicRoutes); // Public marketing routes (unsubscribe)

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

