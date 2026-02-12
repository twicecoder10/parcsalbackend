import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import { setupChatSocket } from './modules/chat/socket';
import { initializeNotificationSocket } from './utils/notifications';

const PORT = config.port;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();

    // Initialize campaign scheduler (Redis-based)
    try {
      const { initializeScheduler } = await import('./modules/marketing/scheduler');
      await initializeScheduler();
    } catch (error: any) {
      console.warn('⚠️  Failed to initialize campaign scheduler (Redis may not be available)');
      if (error.message && !error.message.includes('ENOTFOUND')) {
        console.warn('   Error:', error.message);
      }
      console.warn('⚠️  Scheduled campaigns will not be processed automatically');
      console.warn('   To fix: Ensure Redis is running and REDIS_URL/REDIS_HOST is set correctly');
    }

    try {
      const { initializeRfqScheduler } = await import('./modules/rfq/scheduler');
      await initializeRfqScheduler();
    } catch (error: any) {
      console.warn('⚠️  Failed to initialize RFQ expiry scheduler');
      if (error.message) {
        console.warn('   Error:', error.message);
      }
    }

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.IO with same CORS configuration as Express
    const allowedOrigins = config.getAllowedOrigins();
    const isDevelopment = config.nodeEnv !== 'production';
    
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin
          if (!origin) {
            return callback(null, true);
          }
          
          // Check if origin is in allowed list
          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          
          // In development, allow local network IPs and Expo origins
          if (isDevelopment) {
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
        methods: ['GET', 'POST'],
      },
    });

    // Setup Redis adapter for Socket.IO (enables multi-server scaling)
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { pubClient, subClient } = await import('./config/redis');
      io.adapter(createAdapter(pubClient, subClient));
    } catch (error: any) {
      console.warn('⚠️  Failed to initialize Socket.IO Redis adapter:', error.message);
      console.warn('   Socket.IO will work but won\'t scale across multiple servers');
    }

    // Initialize notification Socket.IO instance
    initializeNotificationSocket(io);

    // Setup chat socket handlers
    setupChatSocket(io);

    // Start server - bind to 0.0.0.0 to allow network access (required for mobile apps)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT} (${config.nodeEnv})`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  try {
    // Shutdown Redis-based services (workers and queues)
    try {
      const { shutdownScheduler } = await import('./modules/marketing/scheduler');
      await shutdownScheduler();
    } catch (error: any) {
      // Suppress connection errors during shutdown (expected)
      if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
        console.error('Error shutting down scheduler:', error);
      }
    }

    try {
      const { shutdownRfqScheduler } = await import('./modules/rfq/scheduler');
      await shutdownRfqScheduler();
    } catch (error: any) {
      if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
        console.error('Error shutting down RFQ scheduler:', error);
      }
    }

    try {
      const { shutdownEmailQueue } = await import('./modules/email/queue');
      await shutdownEmailQueue();
    } catch (error: any) {
      // Suppress connection errors during shutdown (expected)
      if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
        console.error('Error shutting down email queue:', error);
      }
    }

    // Close Redis connections (after workers are closed)
    try {
      const { closeRedisConnections } = await import('./config/redis');
      await closeRedisConnections();
    } catch (error: any) {
      // Suppress connection errors during shutdown (expected)
      if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
        console.error('Error closing Redis connections:', error);
      }
    }

    // Disconnect database
    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    // Suppress connection errors during shutdown (expected)
    if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0); // Exit gracefully even if there are minor errors
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

