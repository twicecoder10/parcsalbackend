import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwt: {
    secret: process.env.JWT_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    webhookSubscriptionSecret: process.env.STRIPE_WEBHOOK_SUBSCRIPTION_SECRET || '',
    webhookBillingSecret: process.env.STRIPE_WEBHOOK_BILLING_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '', // Falls back to main webhook secret if not provided
    priceStarterId: process.env.STRIPE_PRICE_STARTER_ID || '',
    priceProfessionalId: process.env.STRIPE_PRICE_PROFESSIONAL_ID || '',
    priceEnterpriseId: process.env.STRIPE_PRICE_ENTERPRISE_ID || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  // Get allowed origins for CORS (supports comma-separated list or single URL)
  getAllowedOrigins: (): string[] => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // If ALLOWED_ORIGINS is set, use it (comma-separated)
    if (process.env.ALLOWED_ORIGINS) {
      return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    }
    
    // In development, allow multiple origins for mobile development
    if (process.env.NODE_ENV !== 'production') {
      const origins = [frontendUrl];
      
      // Add common Expo/local network origins
      // Allow any origin with the same port (for local IP access like http://192.168.x.x:3000)
      // This will be handled by the CORS function in app.ts
      return origins;
    }
    
    // In production, only allow the configured frontend URL
    return [frontendUrl];
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@parcsal.com',
  },
  adminEmail: process.env.ADMIN_EMAIL || process.env.SMTP_USER || '',
  azureStorage: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || '',
    accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY || '',
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'parcsal-uploads',
    cdnUrl: process.env.AZURE_STORAGE_CDN_URL || '', // Optional CDN URL for serving images
  },
  tracking: {
    deliveredRequirement: (process.env.TRACKING_DELIVERED_REQUIREMENT || 'EVIDENCE_OR_NOTE') as
      | 'EVIDENCE'
      | 'NOTE'
      | 'EVIDENCE_OR_NOTE'
      | 'NONE',
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    defaultCountry: process.env.WHATSAPP_DEFAULT_COUNTRY || 'GB',
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'STRIPE_SECRET_KEY',
];

// Validate Azure Storage configuration in production
if (config.nodeEnv === 'production') {
  if (!config.azureStorage.connectionString && 
      (!config.azureStorage.accountName || !config.azureStorage.accountKey)) {
    throw new Error('Azure Storage configuration is required in production. Please provide AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY');
  }
  
  // Validate Stripe price IDs in production
  if (!config.stripe.priceStarterId || !config.stripe.priceProfessionalId) {
    throw new Error('Stripe price IDs are required in production. Please provide STRIPE_PRICE_STARTER_ID and STRIPE_PRICE_PROFESSIONAL_ID');
  }
}

if (config.nodeEnv === 'production') {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

