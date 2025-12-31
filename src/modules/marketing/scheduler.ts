import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { marketingService } from './service';
import { marketingRepository } from './repository';

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

const redisConnection = getRedisConnection();

// Campaign queue
export const campaignQueue = new Queue('marketing-campaigns', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Worker to process scheduled campaigns
export const campaignWorker = new Worker(
  'marketing-campaigns',
  async (job: Job<{ campaignId: string }>) => {
    const { campaignId } = job.data;

    try {
      // Get the campaign to verify it's still scheduled
      const campaign = await marketingRepository.getCampaignById(campaignId);

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      if (campaign.status !== 'SCHEDULED') {
        console.log(`Campaign ${campaignId} is no longer SCHEDULED (status: ${campaign.status}), skipping`);
        return;
      }

      if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
        console.log(`Campaign ${campaignId} scheduled time hasn't arrived yet, skipping`);
        return;
      }

      // Send the campaign
      console.log(`Processing scheduled campaign ${campaignId}`);
      await marketingService.sendCampaignNow(
        campaignId,
        campaign.createdByUserId,
        campaign.senderType === 'ADMIN' ? 'SUPER_ADMIN' : 'COMPANY_ADMIN',
        campaign.senderCompanyId || undefined
      );

      console.log(`Successfully sent scheduled campaign ${campaignId}`);
    } catch (error: any) {
      console.error(`Error processing scheduled campaign ${campaignId}:`, error);
      throw error; // Re-throw to trigger retry mechanism
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 campaigns concurrently
  }
);

// Event handlers
campaignWorker.on('completed', (job: Job) => {
  console.log(`✅ Campaign job ${job.id} completed`);
});

campaignWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`❌ Campaign job ${job?.id} failed:`, err.message);
});

// Suppress repeated connection errors - log once per minute max
let lastConnectionErrorTime = 0;
const CONNECTION_ERROR_THROTTLE_MS = 60000; // 1 minute

campaignWorker.on('error', (err: Error) => {
  const now = Date.now();
  // Only log connection errors once per minute to avoid spam
  if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
    if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
      console.error('❌ Campaign worker Redis connection error:', err.message);
      console.error('   Make sure Redis is running and REDIS_URL/REDIS_HOST is correct');
      lastConnectionErrorTime = now;
    }
  } else {
    // Log other errors immediately
    console.error('❌ Campaign worker error:', err);
  }
});

// Handle Redis connection errors
redisConnection.on('error', (err: Error) => {
  const now = Date.now();
  if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
    console.error('❌ Redis connection error:', err.message);
    lastConnectionErrorTime = now;
  }
});

/**
 * Schedule a campaign in Redis queue
 */
export async function scheduleCampaignInQueue(campaignId: string, scheduledAt: Date | string) {
  // Ensure scheduledAt is a Date object
  const scheduledDate = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  
  if (isNaN(scheduledDate.getTime())) {
    throw new Error(`Invalid scheduledAt date: ${scheduledAt}`);
  }
  
  const delay = scheduledDate.getTime() - Date.now();

  if (delay <= 0) {
    // If scheduled time has passed, add to queue immediately
    await campaignQueue.add(
      'send-campaign',
      { campaignId },
      {
        jobId: `campaign-${campaignId}`, // Unique job ID per campaign
      }
    );
  } else {
    // Schedule for future execution
    await campaignQueue.add(
      'send-campaign',
      { campaignId },
      {
        jobId: `campaign-${campaignId}`,
        delay,
      }
    );
  }

  console.log(`Campaign ${campaignId} scheduled in Redis queue for ${scheduledDate.toISOString()}`);
}

/**
 * Remove a scheduled campaign from Redis queue
 */
export async function removeCampaignFromQueue(campaignId: string) {
  const job = await campaignQueue.getJob(`campaign-${campaignId}`);
  if (job) {
    await job.remove();
    console.log(`Campaign ${campaignId} removed from Redis queue`);
  }
}

/**
 * Initialize scheduler: Load existing scheduled campaigns from DB into Redis
 * This should be called on server startup
 */
export async function initializeScheduler() {
  try {
    console.log('🔄 Initializing campaign scheduler...');

    // Find all scheduled campaigns
    const scheduledCampaigns = await marketingRepository.findScheduledCampaigns();

    console.log(`Found ${scheduledCampaigns.length} scheduled campaigns in database`);

    // Add each to Redis queue
    for (const campaign of scheduledCampaigns) {
      if (campaign.scheduledAt) {
        await scheduleCampaignInQueue(campaign.id, campaign.scheduledAt);
      }
    }

    console.log('✅ Campaign scheduler initialized');
  } catch (error) {
    console.error('❌ Failed to initialize campaign scheduler:', error);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownScheduler() {
  console.log('🛑 Shutting down campaign scheduler...');
  await campaignWorker.close();
  await campaignQueue.close();
  await redisConnection.quit();
  console.log('✅ Campaign scheduler shut down');
}

