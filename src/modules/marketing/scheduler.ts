import { Queue, Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { marketingService } from './service';
import { marketingRepository } from './repository';

// Campaign queue
export const campaignQueue = new Queue('marketing-campaigns', {
  connection: redisClient,
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
        return;
      }

      if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
        return;
      }

      // Send the campaign
      await marketingService.sendCampaignNow(
        campaignId,
        campaign.createdByUserId,
        campaign.senderType === 'ADMIN' ? 'SUPER_ADMIN' : 'COMPANY_ADMIN',
        campaign.senderCompanyId || undefined
      );
    } catch (error: any) {
      console.error(`Error processing scheduled campaign ${campaignId}:`, error);
      throw error; // Re-throw to trigger retry mechanism
    }
  },
  {
    connection: redisClient,
    concurrency: 5, // Process up to 5 campaigns concurrently
  }
);

// Track shutdown state to suppress expected errors
let isShuttingDown = false;

// Event handlers
campaignWorker.on('completed', () => {
  // Job completed silently
});

campaignWorker.on('failed', (job: Job | undefined, err: Error) => {
  if (!isShuttingDown) {
    console.error(`❌ Campaign job ${job?.id} failed:`, err.message);
  }
});

// Suppress repeated connection errors - log once per minute max
let lastConnectionErrorTime = 0;
const CONNECTION_ERROR_THROTTLE_MS = 60000; // 1 minute

campaignWorker.on('error', (err: Error) => {
  // Suppress "Connection is closed" errors during shutdown (expected behavior)
  if (isShuttingDown && (err.message.includes('Connection is closed') || err.message.includes('closed'))) {
    return;
  }

  const now = Date.now();
  // Only log connection errors once per minute to avoid spam
  if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
    if (now - lastConnectionErrorTime > CONNECTION_ERROR_THROTTLE_MS) {
      console.error('❌ Campaign worker Redis connection error:', err.message);
      console.error('   Make sure Redis is running and REDIS_URL/REDIS_HOST is correct');
      lastConnectionErrorTime = now;
    }
  } else if (!err.message.includes('Connection is closed') && !err.message.includes('closed')) {
    // Log other errors immediately (but not connection closed errors)
    console.error('❌ Campaign worker error:', err);
  }
});

// Note: Redis connection errors are handled in src/config/redis.ts

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

}

/**
 * Remove a scheduled campaign from Redis queue
 */
export async function removeCampaignFromQueue(campaignId: string) {
  const job = await campaignQueue.getJob(`campaign-${campaignId}`);
  if (job) {
    await job.remove();
  }
}

/**
 * Initialize scheduler: Load existing scheduled campaigns from DB into Redis
 * This should be called on server startup
 */
export async function initializeScheduler() {
  try {
    // Find all scheduled campaigns
    const scheduledCampaigns = await marketingRepository.findScheduledCampaigns();

    // Add each to Redis queue
    for (const campaign of scheduledCampaigns) {
      if (campaign.scheduledAt) {
        await scheduleCampaignInQueue(campaign.id, campaign.scheduledAt);
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize campaign scheduler:', error);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownScheduler() {
  isShuttingDown = true;
  
  try {
    // Close worker first (stops processing new jobs)
    await campaignWorker.close();
    // Then close queue
    await campaignQueue.close();
    // Note: redisClient is shared, don't quit it here
  } catch (error: any) {
    // Suppress connection errors during shutdown
    if (!error.message?.includes('Connection is closed') && !error.message?.includes('closed')) {
      console.error('Error shutting down campaign scheduler:', error);
    }
  }
}

