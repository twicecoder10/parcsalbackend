# Implementation Summary - Marketing Module & Redis Infrastructure

## 📋 Overview

This document summarizes all backend implementations completed, including the Marketing/Mass Communication module and Redis infrastructure improvements.

---

## 🎯 1. Marketing / Mass Communication Module

### **Purpose**
A comprehensive marketing campaign system that allows:
- **SUPER_ADMIN (Parcsal)**: Send broadcast campaigns to Customers, Companies, or All users
- **COMPANY_ADMIN**: Send marketing campaigns ONLY to past customers who booked with their company
- **Privacy-first**: Parcsal acts as the communication gateway - companies never see customer PII

### **Channels Implemented**
- ✅ **EMAIL**: Fully functional with unsubscribe links
- ✅ **IN_APP**: Creates in-app notifications
- ⚠️ **WHATSAPP**: Placeholder (logs only, not sending yet)

---

## 🔌 API Endpoints

### **Admin Routes** (`/admin/marketing`)
*Requires: SUPER_ADMIN role*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/campaigns` | Create a new campaign |
| GET | `/campaigns` | List all campaigns (paginated) |
| GET | `/campaigns/:id` | Get campaign details |
| PUT | `/campaigns/:id` | Update DRAFT campaign |
| DELETE | `/campaigns/:id` | Delete DRAFT/SCHEDULED/CANCELLED campaign |
| GET | `/campaigns/:id/preview` | Preview recipient count |
| POST | `/campaigns/:id/send` | Send campaign immediately |
| POST | `/campaigns/:id/schedule` | Schedule campaign for future |
| POST | `/campaigns/:id/cancel` | Cancel SCHEDULED campaign |

### **Company Routes** (`/companies/marketing`)
*Requires: COMPANY_ADMIN or COMPANY_STAFF role*

Same endpoints as admin routes, but:
- Can only create campaigns with `audienceType: "COMPANY_PAST_CUSTOMERS"`
- Only see campaigns created by their company
- Preview returns count only (no PII)

### **User Consent Routes** (`/me`)
*Requires: Any authenticated user*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketing-consent` | Get user's marketing consent preferences |
| PUT | `/marketing-consent` | Update marketing consent preferences |

### **Public Routes** (`/marketing`)
*No authentication required*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/unsubscribe?token=...` | Unsubscribe from marketing emails |

---

## 📝 Request/Response Formats

### **Create Campaign**
```typescript
POST /admin/marketing/campaigns
POST /companies/marketing/campaigns

Body:
{
  audienceType: "COMPANY_PAST_CUSTOMERS" | "PLATFORM_CUSTOMERS_ONLY" | 
                "PLATFORM_COMPANIES_ONLY" | "PLATFORM_ALL_USERS",
  channel: "EMAIL" | "IN_APP" | "WHATSAPP",
  
  // For EMAIL campaigns:
  subject?: string,           // Required for EMAIL
  contentHtml?: string,        // Required for EMAIL (one of contentHtml/contentText)
  contentText?: string,        // Optional fallback for EMAIL
  
  // For IN_APP campaigns:
  title?: string,             // Required for IN_APP
  inAppBody?: string,         // Required for IN_APP (max 1000 chars)
  
  // For WHATSAPP (placeholder):
  whatsappTemplateKey?: string,
  
  // Optional scheduling:
  scheduledAt?: string         // ISO 8601 datetime string
}

Response:
{
  success: true,
  data: {
    id: string,
    senderType: "ADMIN" | "COMPANY",
    senderCompanyId: string | null,
    audienceType: string,
    channel: string,
    status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED",
    subject?: string,
    title?: string,
    contentHtml?: string,
    contentText?: string,
    inAppBody?: string,
    scheduledAt?: string,
    totalRecipients: number,
    deliveredCount: number,
    failedCount: number,
    createdAt: string,
    updatedAt: string
  }
}
```

### **Update Campaign** (DRAFT only)
```typescript
PUT /admin/marketing/campaigns/:id
PUT /companies/marketing/campaigns/:id

Body: (all fields optional, partial update)
{
  audienceType?: string,
  channel?: string,
  subject?: string | null,
  title?: string | null,
  contentHtml?: string | null,
  contentText?: string | null,
  inAppBody?: string | null,
  scheduledAt?: string | null
}
```

### **List Campaigns**
```typescript
GET /admin/marketing/campaigns?page=1&limit=20&status=DRAFT&channel=EMAIL
GET /companies/marketing/campaigns?page=1&limit=20&status=DRAFT&channel=EMAIL

Response:
{
  success: true,
  data: {
    campaigns: Campaign[],
    pagination: {
      page: number,
      limit: number,
      total: number,
      totalPages: number
    }
  }
}
```

### **Preview Recipients**
```typescript
GET /admin/marketing/campaigns/:id/preview
GET /companies/marketing/campaigns/:id/preview

Response:
{
  success: true,
  data: {
    campaignId: string,
    audienceType: string,
    channel: string,
    totalCount: number  // Count only (no PII for companies)
  }
}
```

### **Schedule Campaign**
```typescript
POST /admin/marketing/campaigns/:id/schedule
POST /companies/marketing/campaigns/:id/schedule

Body:
{
  scheduledAt: "2026-01-01T00:00:00.000Z"  // ISO 8601 datetime string
}
```

### **Get/Update Marketing Consent**
```typescript
GET /me/marketing-consent

Response:
{
  success: true,
  data: {
    email: boolean,              // Transactional email notifications
    sms: boolean,                // Transactional SMS notifications
    marketing: {
      emailMarketingOptIn: boolean,
      whatsappMarketingOptIn: boolean,
      carrierMarketingOptIn: boolean
    }
  }
}

PUT /me/marketing-consent

Body (supports both nested and flat structure):
{
  // Transactional preferences
  email?: boolean,
  sms?: boolean,
  
  // Marketing preferences (nested - preferred)
  marketing?: {
    emailMarketingOptIn?: boolean,
    whatsappMarketingOptIn?: boolean,
    carrierMarketingOptIn?: boolean
  },
  
  // Marketing preferences (flat - backward compatible)
  emailMarketingOptIn?: boolean,
  whatsappMarketingOptIn?: boolean,
  carrierMarketingOptIn?: boolean
}
```

### **Unsubscribe**
```typescript
GET /marketing/unsubscribe?token=<JWT_TOKEN>

Response: HTML page with "You are unsubscribed" message
```

---

## 🔄 2. Integration with Existing Endpoints

### **Customer Notification Preferences**
```typescript
GET /customer/notifications/preferences
PUT /customer/notifications/preferences

// Now includes marketing consent:
{
  email: boolean,
  sms: boolean,
  marketing: {
    emailMarketingOptIn: boolean,
    whatsappMarketingOptIn: boolean,
    carrierMarketingOptIn: boolean
  }
}
```

### **Company Settings**
```typescript
GET /companies/settings
PUT /companies/settings

// Now includes marketing consent:
{
  notifications: {
    email: boolean,
    sms: boolean,
    bookingUpdates: boolean,
    shipmentUpdates: boolean
  },
  marketing: {
    emailMarketingOptIn: boolean,
    whatsappMarketingOptIn: boolean,
    carrierMarketingOptIn: boolean
  }
}
```

---

## 🗄️ 3. Database Models

### **MarketingConsent**
```prisma
{
  id: string,
  userId: string (unique),
  emailMarketingOptIn: boolean (default: true),      // Opt-out model
  whatsappMarketingOptIn: boolean (default: true), // Opt-out model
  carrierMarketingOptIn: boolean (default: true),    // Opt-out model
  createdAt: Date,
  updatedAt: Date
}
```

**Important**: All users are opted-in by default (opt-out model). Existing users were backfilled with `true` values.

### **MarketingCampaign**
```prisma
{
  id: string,
  senderType: "ADMIN" | "COMPANY",
  senderCompanyId: string | null,
  createdByUserId: string,
  audienceType: "COMPANY_PAST_CUSTOMERS" | "PLATFORM_CUSTOMERS_ONLY" | 
                "PLATFORM_COMPANIES_ONLY" | "PLATFORM_ALL_USERS",
  channel: "EMAIL" | "IN_APP" | "WHATSAPP",
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED",
  subject?: string,
  title?: string,
  contentHtml?: string,
  contentText?: string,
  inAppBody?: string,
  whatsappTemplateKey?: string,
  scheduledAt?: Date,
  startedAt?: Date,
  sentAt?: Date,
  failureReason?: string,
  totalRecipients: number,
  deliveredCount: number,
  failedCount: number,
  createdAt: Date,
  updatedAt: Date
}
```

### **MarketingMessageLog**
```prisma
{
  id: string,
  campaignId: string,
  recipientId: string,
  channel: "EMAIL" | "IN_APP" | "WHATSAPP",
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | 
          "SKIPPED_OPT_OUT" | "SKIPPED_NOT_IMPLEMENTED",
  error?: string,
  providerMessageId?: string,
  createdAt: Date,
  sentAt?: Date
}
```

---

## ⚡ 4. Redis Infrastructure

### **What Was Implemented**

1. **Campaign Scheduler** (BullMQ)
   - Scheduled campaigns are queued in Redis
   - Worker processes scheduled campaigns automatically
   - Survives server restarts (loads from DB on startup)

2. **Email Queue** (BullMQ)
   - All email sending is now asynchronous
   - Retry mechanism (3 attempts with exponential backoff)
   - Improved API response times

3. **Socket.IO Redis Adapter**
   - Enables horizontal scaling across multiple servers
   - Real-time features work across server instances

4. **Rate Limiting** (express-rate-limit + Redis)
   - General API: 100 requests/15min per IP
   - Auth: 5 login attempts/15min per IP
   - Registration: 3 attempts/hour per IP
   - Booking: 10 bookings/hour per user
   - Search: 60 searches/minute per IP
   - Refresh Token: 100 refreshes/15min per user

### **Redis Configuration**
- Supports `REDIS_URL`, `REDIS_PUBLIC_URL` (Railway), or individual `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`
- Handles Railway template variables automatically
- Graceful error handling and connection retry

---

## 🎨 Frontend Requirements & Considerations

### **1. Campaign Management UI**

#### **For SUPER_ADMIN:**
- Campaign creation form with:
  - Audience type selector (all 4 options available)
  - Channel selector (EMAIL, IN_APP, WHATSAPP)
  - Rich text editor for EMAIL content (React Quill recommended)
  - Subject line for EMAIL
  - Title + body for IN_APP (max 1000 chars)
  - Preview recipient count before sending
  - Schedule date/time picker
- Campaign list with filters (status, channel)
- Campaign detail view with stats (delivered, failed counts)
- Edit DRAFT campaigns
- Delete DRAFT/SCHEDULED/CANCELLED campaigns
- Cancel SCHEDULED campaigns

#### **For COMPANY_ADMIN:**
- Same UI but:
  - Audience type locked to "COMPANY_PAST_CUSTOMERS"
  - Only see their own campaigns
  - Preview shows count only (no recipient list)

### **2. Rich Text Editor (React Quill) for EMAIL**

**Important**: Images in HTML content should be handled carefully:

```typescript
// Recommended approach:
1. Upload images separately to your storage (e.g., Azure Blob, S3)
2. Replace base64 images in Quill with URLs
3. Send only URLs in contentHtml to backend
4. Backend will include these URLs in email HTML

// Why?
- Base64 images make payloads huge (causes "request entity too large")
- Backend body limit is 2MB (increased from default)
- URLs are more reliable for email clients
```

**Image Management:**
- When user removes/changes images, consider cleanup of orphaned files
- Store image URLs in campaign content (not files themselves)

### **3. Marketing Consent Management**

#### **User Settings Page:**
```typescript
// Show consent toggles:
- Email Marketing (emailMarketingOptIn)
- WhatsApp Marketing (whatsappMarketingOptIn)
- Carrier/Company Promotions (carrierMarketingOptIn)

// Also show transactional preferences:
- Email Notifications (email)
- SMS Notifications (sms)
```

#### **API Integration:**
```typescript
// Preferred (nested structure):
PUT /me/marketing-consent
{
  email: true,
  sms: false,
  marketing: {
    emailMarketingOptIn: true,
    whatsappMarketingOptIn: false,
    carrierMarketingOptIn: true
  }
}

// Also supported (flat structure):
PUT /me/marketing-consent
{
  email: true,
  sms: false,
  emailMarketingOptIn: true,
  whatsappMarketingOptIn: false,
  carrierMarketingOptIn: true
}
```

### **4. Email Unsubscribe Links**

- Backend generates JWT tokens with user ID and scope
- Unsubscribe links in emails: `/marketing/unsubscribe?token=<JWT>`
- Frontend should handle the unsubscribe page (or backend serves HTML directly)
- After unsubscribe, user is redirected to a confirmation page

### **5. Campaign Status & Lifecycle**

```typescript
Status Flow:
DRAFT → SCHEDULED → SENDING → SENT
DRAFT → SCHEDULED → CANCELLED
DRAFT → SENDING → SENT
DRAFT → SENDING → FAILED

// Frontend should:
- Show status badges (DRAFT, SCHEDULED, SENDING, SENT, FAILED, CANCELLED)
- Disable edit for non-DRAFT campaigns
- Show scheduled time for SCHEDULED campaigns
- Show error message for FAILED campaigns
- Show delivery stats (deliveredCount, failedCount) for SENT campaigns
```

### **6. Rate Limiting**

Frontend should handle rate limit responses gracefully:

```typescript
// Response when rate limited:
{
  message: "Too many requests from this IP, please try again later.",
  // Headers:
  "RateLimit-Limit": "100",
  "RateLimit-Remaining": "0",
  "RateLimit-Reset": "1234567890"
}

// Show user-friendly message:
"Too many requests. Please wait X minutes before trying again."
```

### **7. Large Payload Handling**

- Backend accepts up to 2MB for JSON/URL-encoded bodies
- For very large HTML content, consider:
  - Compressing images before upload
  - Using image URLs instead of base64
  - Splitting very long content

### **8. Scheduled Campaigns**

- Use ISO 8601 datetime strings: `"2026-01-01T00:00:00.000Z"`
- Frontend should validate scheduled time is in the future
- Show countdown or "Scheduled for [date/time]" in UI

### **9. In-App Notifications**

- When IN_APP campaigns are sent, they create notification records
- Frontend should poll or use WebSocket to show new notifications
- Notification format: `"Promotion from {Company} via Parcsal"` or `"Announcement from Parcsal"`

### **10. Error Handling**

Common errors to handle:

```typescript
// Validation errors:
400: "Validation failed: subject is required for EMAIL campaigns"

// Permission errors:
403: "Only DRAFT campaigns can be updated"
403: "Companies cannot target PLATFORM_* audiences"

// Not found:
404: "Campaign not found"

// Business logic:
400: "Only DRAFT campaigns can be scheduled"
400: "Scheduled time must be in the future"
400: "Only DRAFT, SCHEDULED, or CANCELLED campaigns can be deleted"
```

---

## 🔐 Security & Privacy

1. **PII Protection**: Companies never see customer emails/phone numbers
2. **Permission Checks**: Strict audience type validation per user role
3. **Unsubscribe Tokens**: JWT-signed, include scope (ADMIN_MARKETING vs CARRIER_MARKETING)
4. **Rate Limiting**: Prevents abuse of all endpoints
5. **Consent-Based**: All marketing respects user opt-in/opt-out preferences

---

## 📊 Defaults & Behavior

### **Marketing Consent Defaults**
- **All users are opted-in by default** (opt-out model)
- Existing users were backfilled with `true` values
- New users get `MarketingConsent` record with all `true` on first access

### **Campaign Limits**
- Company campaigns: Max 1,000 recipients
- Admin campaigns: Max 10,000 recipients

### **Email Footer**
- All marketing emails include: "Sent via Parcsal" + unsubscribe link
- Unsubscribe link uses appropriate scope based on sender type

---

## 🚀 Deployment Notes

1. **Redis Required**: Campaign scheduler and email queue require Redis
   - Server will start without Redis but show warnings
   - Scheduled campaigns won't process without Redis
   - Emails won't send without Redis

2. **Environment Variables**:
   ```env
   REDIS_URL=redis://...
   # OR
   REDIS_PUBLIC_URL=redis://... (Railway)
   REDIS_PASSWORD=...
   REDIS_HOST=...
   REDIS_PORT=6379
   ```

3. **Database Migrations**: Run Prisma migrations to create marketing tables

4. **Graceful Shutdown**: Server handles SIGTERM/SIGINT gracefully, closes all Redis connections

---

## 📝 Summary for Frontend Team

### **Must Implement:**
1. ✅ Campaign CRUD UI (create, list, view, edit, delete)
2. ✅ Marketing consent toggles in user settings
3. ✅ Rich text editor for EMAIL campaigns (with image URL handling)
4. ✅ Campaign status indicators and lifecycle management
5. ✅ Preview recipient count before sending
6. ✅ Schedule date/time picker
7. ✅ Error handling for all API responses

### **Nice to Have:**
1. Campaign analytics dashboard (delivery stats)
2. Unsubscribe page UI (if not using backend HTML)
3. In-app notification display for IN_APP campaigns
4. Campaign templates/saved drafts

### **Important Notes:**
- Use nested `marketing` object in consent API (preferred)
- Handle large HTML payloads (use image URLs, not base64)
- All users are opted-in by default (opt-out model)
- Companies can only target past customers
- Rate limiting is active - handle 429 responses gracefully

---

## ✅ Testing Checklist

- [ ] Create EMAIL campaign (SUPER_ADMIN)
- [ ] Create IN_APP campaign (COMPANY_ADMIN)
- [ ] Preview recipients
- [ ] Schedule campaign for future
- [ ] Send campaign immediately
- [ ] Cancel scheduled campaign
- [ ] Update DRAFT campaign
- [ ] Delete DRAFT campaign
- [ ] Get/update marketing consent
- [ ] Unsubscribe via token link
- [ ] Verify email footer and unsubscribe link
- [ ] Test rate limiting (make 100+ requests quickly)
- [ ] Test with large HTML payload (near 2MB limit)

---

**Last Updated**: 2025-01-26
**Backend Version**: 1.0.0

