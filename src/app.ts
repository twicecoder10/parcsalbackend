import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';

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
import { paymentController } from './modules/payments/controller';

const app: Express = express();

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// Apply raw body parser for Stripe webhooks (must be before JSON parser)
// This preserves the raw body buffer needed for signature verification
app.use('/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/webhook/stripe', express.raw({ type: 'application/json' })); // Alternative path for Stripe webhooks
app.use('/subscriptions/webhooks/stripe-subscriptions', express.raw({ type: 'application/json' }));

// JSON parser for all routes except webhooks
// Webhook routes already have raw body parser applied above
app.use((req, res, next) => {
  // Skip JSON parsing for webhook routes (they use raw body)
  if (
    req.path === '/payments/webhooks/stripe' ||
    req.path === '/webhook/stripe' ||
    req.path === '/subscriptions/webhooks/stripe-subscriptions'
  ) {
    return next();
  }
  express.json()(req, res, next);
});

app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/plans', planRoutes);
app.use('/companies', companyRoutes);
app.use('/companies/shipments', shipmentRoutes);
app.use('/companies/bookings', bookingRoutes);
app.use('/companies/payments', companyPaymentRoutes);
app.use('/shipments', shipmentRoutes); // Keep for backward compatibility
app.use('/bookings', bookingRoutes); // Keep for backward compatibility
app.use('/payments', paymentRoutes);
// Webhook route at root level (for Stripe webhook configuration)
// This handles /webhook/stripe (without 's' and without /payments prefix)
app.post('/webhook/stripe', paymentController.handleWebhook);
app.use('/subscriptions', subscriptionRoutes);
app.use('/companies/subscription', subscriptionRoutes); // Company admin subscription routes (GET /, POST /cancel, PUT /payment-method)
app.use('/admin', adminRoutes);
app.use('/contact', contactRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/customer', customerRoutes);
app.use('/customer/notifications', notificationRoutes);
app.use('/companies/notifications', notificationRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

