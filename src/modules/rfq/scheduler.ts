import { rfqService } from './service';

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
let expiryInterval: NodeJS.Timeout | null = null;

async function runExpirySweep() {
  try {
    const result = await rfqService.expireOpenRequestsAndQuotes();
    if (result.expiredRequests > 0 || result.expiredQuotes > 0) {
      console.log(
        `[RFQ Scheduler] Expired requests: ${result.expiredRequests}, expired quotes: ${result.expiredQuotes}`
      );
    }
  } catch (error) {
    console.error('[RFQ Scheduler] Failed to run expiry sweep:', error);
  }
}

export async function initializeRfqScheduler() {
  await runExpirySweep();
  expiryInterval = setInterval(() => {
    runExpirySweep();
  }, DAILY_INTERVAL_MS);
}

export async function shutdownRfqScheduler() {
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}
