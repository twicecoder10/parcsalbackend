import Redis from 'ioredis';

// Redis connection configuration
// Supports REDIS_URL, REDIS_PUBLIC_URL (Railway), or individual REDIS_HOST/PORT/PASSWORD
function getRedisConnection() {
  // Check for REDIS_URL or REDIS_PUBLIC_URL (Railway uses REDIS_PUBLIC_URL)
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
  
  // If a Redis URL is provided, use it directly (ioredis supports connection strings)
  if (redisUrl) {
    // Replace template variables if present (Railway template syntax)
    const resolvedUrl = redisUrl
      .replace(/\$\{\{REDIS_PASSWORD\}\}/g, process.env.REDIS_PASSWORD || '')
      .replace(/\$\{\{RAILWAY_TCP_PROXY_DOMAIN\}\}/g, process.env.RAILWAY_TCP_PROXY_DOMAIN || '')
      .replace(/\$\{\{RAILWAY_TCP_PROXY_PORT\}\}/g, process.env.RAILWAY_TCP_PROXY_PORT || '6379');
    
    return new Redis(resolvedUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect on READONLY error
        }
        return false;
      },
    });
  }

  // Otherwise, use individual environment variables
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true; // Reconnect on READONLY error
      }
      return false;
    },
  });
}

// Main Redis client (for general use, caching, etc.)
export const redisClient = getRedisConnection();

// Separate Redis clients for Socket.IO adapter (pub/sub pattern)
// Socket.IO adapter requires separate pub/sub clients
export const pubClient = getRedisConnection();
export const subClient = getRedisConnection();

// Handle connection errors gracefully
let lastConnectionErrorTime = 0;
const CONNECTION_ERROR_THROTTLE_MS = 60000; // 1 minute

redisClient.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
    console.error('❌ Redis connection error:', err.message);
    lastConnectionErrorTime = now;
  }
});

pubClient.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
    console.error('❌ Redis pub client error:', err.message);
    lastConnectionErrorTime = now;
  }
});

subClient.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
    console.error('❌ Redis sub client error:', err.message);
    lastConnectionErrorTime = now;
  }
});

// Graceful shutdown
export async function closeRedisConnections() {
  await Promise.all([
    redisClient.quit(),
    pubClient.quit(),
    subClient.quit(),
  ]);
}

