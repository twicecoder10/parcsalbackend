import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import { setupChatSocket } from './modules/chat/socket';

const PORT = config.port;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

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

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.IO
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.frontendUrl,
        credentials: true,
        methods: ['GET', 'POST'],
      },
    });

    // Setup chat socket handlers
    setupChatSocket(io);
    console.log('✅ Socket.IO initialized');

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  try {
    // Shutdown campaign scheduler
    try {
      const { shutdownScheduler } = await import('./modules/marketing/scheduler');
      await shutdownScheduler();
    } catch (error) {
      console.error('Error shutting down scheduler:', error);
    }

    // Disconnect database
    await prisma.$disconnect();
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

