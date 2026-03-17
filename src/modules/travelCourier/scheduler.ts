import { travelCourierService } from './service';

const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
let releaseInterval: NodeJS.Timeout | null = null;

async function runAutoRelease() {
  try {
    const result = await travelCourierService.autoReleasePendingPayouts();
    if (result.releasedCount > 0) {
      console.log(
        `[TravelCourier Scheduler] Auto-released payouts: ${result.releasedCount}`
      );
    }
  } catch (error) {
    console.error('[TravelCourier Scheduler] Failed to run auto-release:', error);
  }
}

export async function initializeTravelCourierScheduler() {
  await runAutoRelease();
  releaseInterval = setInterval(() => {
    runAutoRelease();
  }, HOURLY_INTERVAL_MS);
}

export async function shutdownTravelCourierScheduler() {
  if (releaseInterval) {
    clearInterval(releaseInterval);
    releaseInterval = null;
  }
}
