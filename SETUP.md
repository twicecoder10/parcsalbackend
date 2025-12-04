# Setup Guide

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   - Copy the environment template below to `.env`
   - Fill in your actual values

3. **Set up database**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate

   # Create and run migrations
   npm run prisma:migrate

   # Seed default company plans
   npm run prisma:seed
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env` file with the following:

```env
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/parcsal?schema=public"

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_WEBHOOK_SUBSCRIPTION_SECRET=whsec_your_subscription_webhook_secret

# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:3000

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@parcsal.com

# Admin Email (for contact form notifications)
ADMIN_EMAIL=admin@parcsal.com

# Super Admin Login Credentials
SUPER_ADMIN_EMAIL=Custom email
SUPER_ADMIN_PASSWORD=Custom password
SUPER_ADMIN_NAME=Custom name
```

## Stripe Webhook Setup

For local development with Stripe webhooks, you need to use Stripe CLI:

1. **Install Stripe CLI**: https://stripe.com/docs/stripe-cli

2. **Login to Stripe**
   ```bash
   stripe login
   ```

3. **Forward webhook events to local server**

   For booking payments:
   ```bash
   stripe listen --forward-to localhost:3000/payments/webhooks/stripe
   ```

   For subscriptions:
   ```bash
   stripe listen --forward-to localhost:3000/subscriptions/webhooks/stripe-subscriptions --events customer.subscription.*,checkout.session.completed
   ```

4. **Get webhook secrets**
   - The Stripe CLI will output webhook signing secrets
   - Copy them to your `.env` file

**Note**: In production, you'll need to configure webhooks in your Stripe Dashboard and update the webhook secrets accordingly.

## Email Setup (SMTP)

For email functionality (verification, password reset, contact form):

1. **Gmail Setup** (recommended for development):
   - Enable 2-factor authentication
   - Generate an App Password: https://myaccount.google.com/apppasswords
   - Use your Gmail address as `SMTP_USER`
   - Use the generated app password as `SMTP_PASS`

2. **Other SMTP Providers**:
   - Update `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` accordingly
   - Common providers:
     - SendGrid: `smtp.sendgrid.net`, port `587`
     - Mailgun: `smtp.mailgun.org`, port `587`
     - AWS SES: varies by region

3. **Testing**: Email sending is non-blocking, so the API will respond even if email fails (errors are logged).

## Important Notes

- **Raw Body for Webhooks**: Stripe webhooks require raw body parsing. For production, you may need to add middleware like `express.raw()` for webhook routes. For development with Stripe CLI, this should work as-is.

- **Database Migrations**: Always run migrations in order. The seed script will create default company plans (Basic, Pro, Enterprise). For new schema changes, use `npx prisma migrate dev` interactively or `npx prisma db push` for quick development.

- **First Super Admin**: You'll need to create the first super admin user manually through the database or by modifying the registration flow temporarily.

- **Email Verification**: New users receive verification emails on registration. Email verification is optional but can be enforced in production.

## Troubleshooting

- **Database connection errors**: Make sure PostgreSQL is running and the DATABASE_URL is correct
- **Prisma errors**: Run `npm run prisma:generate` after schema changes
- **Port already in use**: Change the PORT in `.env`
- **Stripe webhook errors**: Verify webhook secrets match Stripe CLI output

