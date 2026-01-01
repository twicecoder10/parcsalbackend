# Redis Adoption Analysis for Parcsal Backend

## Executive Summary

After a thorough codebase review, I've identified **8 key areas** where Redis adoption would significantly improve performance, scalability, and reliability. Currently, Redis is only used for **marketing campaign scheduling**. This document outlines additional opportunities.

---

## 1. 🔴 **HIGH PRIORITY: Socket.IO Scaling** ⭐⭐⭐

### Current State
- Socket.IO is using in-memory adapter (default)
- Real-time chat and notifications won't work across multiple server instances
- Each server instance maintains its own socket connections independently

### Redis Solution
**Use `@socket.io/redis-adapter`** to enable cross-server Socket.IO communication.

### Benefits
- ✅ Real-time features work across multiple server instances
- ✅ Horizontal scaling support
- ✅ Users can connect to any server and receive messages
- ✅ Chat rooms work across all instances

### Implementation
```typescript
// src/server.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './config/redis';

io.adapter(createAdapter(pubClient, subClient));
```

### Impact: **CRITICAL** - Required for production scaling

---

## 2. 🔴 **HIGH PRIORITY: Email Queue** ⭐⭐⭐

### Current State
- Emails are sent **synchronously** during request handling
- Found in: `bookings/service.ts`, `companies/service.ts`, `marketing/service.ts`
- Email sending blocks API responses
- No retry mechanism for failed emails
- No rate limiting for email providers

### Redis Solution
**Use BullMQ queue** (already installed) to queue all email sends.

### Affected Operations
- Booking confirmation emails
- Booking cancellation emails
- Booking delivery emails
- Booking rejection emails
- Team invitation emails
- Marketing campaign emails (already queued for campaigns, but not transactional)

### Benefits
- ✅ Non-blocking API responses
- ✅ Automatic retry on failures
- ✅ Rate limiting for SMTP
- ✅ Better error handling
- ✅ Email sending metrics

### Implementation
Create `src/modules/email/queue.ts` similar to marketing scheduler.

### Impact: **HIGH** - Improves API response times significantly

---

## 3. 🟡 **MEDIUM PRIORITY: Response Caching** ⭐⭐

### Current State
- Expensive database queries run on every request
- No caching layer
- Repeated queries for same data

### Redis Solution
**Cache frequently accessed, rarely changing data** with TTL.

### Cacheable Endpoints

#### A. Admin Dashboard Stats (`/admin/dashboard/summary`, `/admin/dashboard/stats`)
- **Current**: Multiple `count()` and `findMany()` queries on every request
- **Cache TTL**: 5-10 minutes
- **Impact**: High - Admin dashboard is frequently accessed

#### B. Shipment Search Results (`/shipments/search`)
- **Current**: Complex queries with filters, joins, and pagination
- **Cache TTL**: 1-2 minutes (data changes frequently)
- **Cache Key**: `shipments:search:${hash(filters)}:${page}:${limit}`
- **Impact**: Medium - Search is common but results change often

#### C. Company Profiles (`/companies/:id`, `/companies/:slug`)
- **Current**: Includes relations (activePlan, admin, stats)
- **Cache TTL**: 5-10 minutes
- **Cache Key**: `company:${id}` or `company:slug:${slug}`
- **Impact**: Medium - Company profiles are frequently viewed

#### D. Review Statistics (`/companies/:id/reviews/stats`)
- **Current**: Aggregation queries on reviews
- **Cache TTL**: 5 minutes
- **Impact**: Low-Medium - Stats don't change frequently

#### E. User Profiles (with stats)
- **Current**: Includes booking counts, revenue calculations
- **Cache TTL**: 2-5 minutes
- **Impact**: Low-Medium

### Implementation Pattern
```typescript
// Cache middleware
async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}
```

### Impact: **MEDIUM** - Reduces database load, improves response times

---

## 4. 🟡 **MEDIUM PRIORITY: Rate Limiting** ⭐⭐

### Current State
- **No rate limiting implemented**
- API endpoints are vulnerable to abuse
- No protection against brute force attacks
- No protection against API scraping

### Redis Solution
**Use `express-rate-limit` with Redis store** or implement custom rate limiting.

### Endpoints to Protect

#### A. Authentication Endpoints
- `/auth/login` - 5 attempts per 15 minutes per IP
- `/auth/register-*` - 3 attempts per hour per IP
- `/auth/refresh-token` - 100 requests per 15 minutes per user

#### B. Booking Creation
- `/bookings` - 10 bookings per hour per user
- Prevents spam bookings

#### C. Search Endpoints
- `/shipments/search` - 60 requests per minute per IP
- Prevents scraping

#### D. General API
- All endpoints - 100 requests per minute per IP (general limit)
- Stricter limits for authenticated users

### Implementation
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from './config/redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### Impact: **HIGH** - Security and abuse prevention

---

## 5. 🟡 **MEDIUM PRIORITY: JWT Token Blacklisting** ⭐⭐

### Current State
- JWT tokens are stateless
- No way to invalidate tokens before expiration
- Logout doesn't actually invalidate tokens
- Refresh tokens can't be revoked

### Redis Solution
**Store blacklisted tokens** in Redis with TTL matching token expiration.

### Benefits
- ✅ Immediate token invalidation on logout
- ✅ Ability to revoke refresh tokens
- ✅ Security breach response (revoke all user tokens)
- ✅ Admin ability to force logout users

### Implementation
```typescript
// On logout
await redis.setex(`blacklist:${token}`, tokenExpirationTime, '1');

// In auth middleware
const isBlacklisted = await redis.exists(`blacklist:${token}`);
if (isBlacklisted) throw new UnauthorizedError('Token revoked');
```

### Impact: **MEDIUM** - Security enhancement

---

## 6. 🟢 **LOW PRIORITY: Real-time Notification Pub/Sub** ⭐

### Current State
- Socket.IO rooms work within single server instance
- Notifications are created in database and emitted via Socket.IO
- No cross-server notification broadcasting

### Redis Solution
**Use Redis Pub/Sub** for cross-server notification broadcasting.

### Benefits
- ✅ Notifications work across all server instances
- ✅ Decouples notification creation from delivery
- ✅ Better scalability

### Implementation
```typescript
// Publisher (when notification created)
redis.publish('notifications', JSON.stringify({ userId, notification }));

// Subscriber (in each server instance)
redis.subscribe('notifications', (message) => {
  const { userId, notification } = JSON.parse(message);
  io.to(`user:${userId}`).emit('notification', notification);
});
```

### Impact: **LOW** - Nice to have, but Socket.IO adapter (item #1) solves most of this

---

## 7. 🟢 **LOW PRIORITY: Session Storage** ⭐

### Current State
- Using stateless JWT tokens
- No server-side session storage needed currently

### Redis Solution
**Optional**: Store user sessions for:
- Active device tracking
- "Login from new device" notifications
- Session management UI

### Impact: **LOW** - Not critical, but useful for security features

---

## 8. 🟢 **LOW PRIORITY: Distributed Locks** ⭐

### Current State
- No distributed locking mechanism
- Potential race conditions in:
  - Booking creation (capacity checks)
  - Payment processing
  - Campaign sending

### Redis Solution
**Use Redis SETNX** or Redlock for distributed locks.

### Use Cases
- Prevent double-booking (race condition in capacity checks)
- Ensure only one worker processes a campaign at a time
- Prevent duplicate payment processing

### Implementation
```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redisClient], {
  retryCount: 3,
  retryDelay: 200,
});

// Usage
const lock = await redlock.acquire(['booking:create'], 5000);
try {
  // Critical section
} finally {
  await lock.release();
}
```

### Impact: **LOW-MEDIUM** - Prevents edge case bugs, but current implementation seems stable

---

## Implementation Priority

### Phase 1: Critical (Do First)
1. ✅ **Socket.IO Redis Adapter** - Required for scaling
2. ✅ **Email Queue** - Improves API performance significantly
3. ✅ **Rate Limiting** - Security requirement

### Phase 2: High Value (Do Soon)
4. ✅ **Response Caching** - Reduces database load
5. ✅ **JWT Token Blacklisting** - Security enhancement

### Phase 3: Nice to Have (Do Later)
6. ✅ **Pub/Sub Notifications** - Enhanced real-time features
7. ✅ **Session Storage** - Advanced security features
8. ✅ **Distributed Locks** - Edge case protection

---

## Estimated Impact

| Feature | Performance Gain | Scalability Gain | Security Gain | Implementation Effort |
|---------|-----------------|------------------|---------------|----------------------|
| Socket.IO Adapter | Low | **Very High** | Low | Low |
| Email Queue | **High** | Medium | Low | Medium |
| Response Caching | **High** | Medium | Low | Medium |
| Rate Limiting | Low | Low | **Very High** | Low |
| Token Blacklisting | Low | Low | **High** | Low |
| Pub/Sub | Low | Medium | Low | Medium |
| Session Storage | Low | Low | Medium | Medium |
| Distributed Locks | Low | Low | Medium | Medium |

---

## Dependencies Needed

```bash
npm install @socket.io/redis-adapter express-rate-limit rate-limit-redis redlock
```

---

## Redis Memory Estimation

Assuming:
- 1000 active users
- 10,000 shipments
- 100 companies
- 1 hour cache TTL average

| Feature | Estimated Memory |
|---------|------------------|
| Socket.IO Adapter | ~50MB (connection metadata) |
| Email Queue | ~10MB (pending emails) |
| Response Caching | ~100MB (cached responses) |
| Rate Limiting | ~20MB (rate limit counters) |
| Token Blacklisting | ~5MB (blacklisted tokens) |
| **Total** | **~185MB** |

*Note: Actual usage will vary based on traffic patterns*

---

## Conclusion

Redis adoption beyond campaign scheduling would provide:
- ✅ **Horizontal scaling** (Socket.IO adapter)
- ✅ **Better performance** (caching, email queue)
- ✅ **Enhanced security** (rate limiting, token blacklisting)
- ✅ **Improved reliability** (distributed locks, pub/sub)

**Recommended next steps**: Implement Socket.IO adapter and email queue first, as they provide the highest impact with reasonable effort.

