# Parcsal Backend API

Backend API for Parcsal - A marketplace for parcel/cargo shipment slots.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (access + refresh tokens)
- **Payments**: Stripe
- **Validation**: Zod

## Project Structure

```
/src
  /config          # Configuration files (database, env)
  /utils           # Utility functions (errors, pagination, slug generation)
  /middleware      # Express middleware (auth, error handling, validation)
  /modules         # Feature modules (clean architecture)
    /auth          # Authentication & authorization
    /users         # User management
    /companies     # Company management
    /plans         # Subscription plans
    /shipments     # Shipment slot management
    /bookings      # Booking management
    /payments      # Payment processing (Stripe)
    /subscriptions # Subscription management (Stripe)
    /admin         # Admin endpoints
  app.ts           # Express app setup
  server.ts        # Server entry point
/prisma
  schema.prisma    # Database schema
```

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- Stripe account (for payment processing)

### Installation

1. **Clone the repository** (if applicable)
   ```bash
   cd parcsal-BE
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=4000
   NODE_ENV=development
   DATABASE_URL="postgresql://user:password@localhost:5432/parcsal?schema=public"
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-change-in-production
   JWT_ACCESS_TOKEN_EXPIRES_IN=15m
   JWT_REFRESH_TOKEN_EXPIRES_IN=7d
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
   STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   STRIPE_WEBHOOK_SUBSCRIPTION_SECRET=whsec_your_subscription_webhook_secret
   FRONTEND_URL=http://localhost:3000
   SUPER_ADMIN_EMAIL=Custom email
   SUPER_ADMIN_PASSWORD=Custom password
   SUPER_ADMIN_NAME=Custom name
   # Azure Storage Configuration (Required)
   AZURE_STORAGE_CONNECTION_STRING=your-azure-storage-connection-string
   AZURE_STORAGE_CONTAINER_NAME=parcsal-uploads
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate

   # Run migrations
   npm run prisma:migrate

   # (Optional) Open Prisma Studio to view/edit data
   npm run prisma:studio
   ```

5. **Seed initial data**
   Seed default company plans (Basic, Pro, Enterprise):
   ```bash
   npm run prisma:seed
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:4000`

## API Endpoints

### Authentication
- `POST /auth/register-customer` - Register as a customer
- `POST /auth/register-company-admin` - Register as a company admin
- `POST /auth/login` - Login
- `POST /auth/refresh-token` - Refresh access token
- `POST /auth/logout` - Logout

### Plans (Public)
- `GET /plans` - List all available subscription plans

### Companies
- `GET /companies/me` - Get authenticated company profile
- `PATCH /companies/me` - Update company profile
- `GET /companies/:companyIdOrSlug/warehouses` - Get warehouse addresses (public, verified companies only)

### Shipments
- `POST /shipments` - Create shipment slot (company)
- `GET /shipments/company` - List company's shipment slots
- `PATCH /shipments/:id` - Update shipment slot
- `PATCH /shipments/:id/status` - Update shipment status
- `GET /shipments/search` - Search shipments (public) - **See [Shipments Search API Update](./SHIPMENTS_SEARCH_API_UPDATE.md) for latest date filtering features**
- `GET /shipments/:id` - Get shipment details (public)

### Bookings
- `POST /bookings` - Create booking (customer) - Supports address fields and parcel images
- `GET /bookings/me` - List customer bookings
- `GET /bookings/company` - List company bookings
- `PATCH /bookings/company/:id/status` - Update booking status
- `PATCH /bookings/:id/proof-images` - Add proof of pickup/delivery images (company)
- `GET /bookings/:id` - Get booking details

### Uploads
- `POST /uploads/parcel-images` - Upload parcel images (customer)
- `POST /uploads/proof-images` - Upload proof images (company)

**See [Frontend Image Upload Guide](./FRONTEND_IMAGE_UPLOAD_GUIDE.md) for detailed implementation instructions.**

### Reviews
- `POST /customer/bookings/:bookingId/reviews` - Create a review (customer)
- `PUT /customer/bookings/:bookingId/reviews` - Update a review (customer)
- `DELETE /customer/bookings/:bookingId/reviews` - Delete a review (customer)
- `GET /customer/reviews` - Get customer's reviews
- `GET /bookings/:bookingId/reviews` - Get review for a booking (public)
- `GET /companies/:companyId/reviews` - Get company reviews (public)
- `GET /companies/:companyId/reviews/stats` - Get company review statistics (public)

**See [Reviews API Documentation](./REVIEWS_API.md) for detailed request/response examples and integration guide.**

### Payments
- `POST /payments/checkout-session` - Create Stripe checkout session
- `POST /webhooks/stripe` - Stripe webhook handler

### Subscriptions
- `POST /subscriptions/checkout-session` - Create subscription checkout
- `POST /webhooks/stripe-subscriptions` - Subscription webhook handler

### Admin
- `GET /admin/dashboard/summary` - Get dashboard metrics
- `GET /admin/companies` - List all companies
- `PATCH /admin/companies/:id/verify` - Verify/unverify company

## Role-Based Access Control

The system supports the following roles:

- **CUSTOMER**: Can create bookings and view their own bookings
- **COMPANY_ADMIN**: Can manage company profile, create shipments, manage bookings
- **COMPANY_STAFF**: Can manage shipments and bookings for their company
- **SUPER_ADMIN**: Full access to all endpoints including admin features

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Building for Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## Database Schema

Key models:
- **User**: Authentication and user information
- **Company**: Company profiles and settings
- **CompanyPlan**: Subscription plans (Basic, Pro, Enterprise)
- **ShipmentSlot**: Available shipment slots with capacity and pricing
- **Booking**: Customer bookings for shipment slots
- **Payment**: Payment records linked to bookings
- **Subscription**: Company subscription records
- **Notification**: User notifications
- **Review**: Customer reviews for companies (linked to bookings)

See `prisma/schema.prisma` for complete schema definition.

## Stripe Webhooks

For Stripe webhooks to work in development, use Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/payments/webhooks/stripe
stripe listen --forward-to localhost:3000/subscriptions/webhooks/stripe-subscriptions --events customer.subscription.*,checkout.session.completed
```

The webhook secrets will be displayed in the terminal output. Add them to your `.env` file.

**Note**: Stripe webhooks require raw body parsing for signature verification. The current implementation works with Stripe CLI in development. For production, you may need to configure your web server (e.g., nginx) to pass raw body, or use middleware like `express.raw()` specifically for webhook routes.

## Notes

- JWT tokens are used for authentication. Access tokens expire in 15 minutes, refresh tokens in 7 days.
- All prices are stored in GBP (British Pounds).
- Shipment capacity can be tracked by weight (kg) or item count, or both.
- Companies must have an active subscription to create shipment slots (subject to plan limits).

## License

ISC

