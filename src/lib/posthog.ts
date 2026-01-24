import { PostHog } from 'posthog-node';

type CaptureEventParams = {
  distinctId: string;
  event: string;
  properties?: Record<string, any>;
};

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST;

const client = apiKey && host ? new PostHog(apiKey, { host }) : null;

export function captureEvent({ distinctId, event, properties }: CaptureEventParams): void {
  if (!client || !distinctId || !event) {
    return;
  }

  try {
    // Fire-and-forget to avoid blocking request flow
    setImmediate(() => {
      try {
        client.capture({
          distinctId,
          event,
          properties,
        });
      } catch (error) {
        console.error('[PostHog] Failed to capture event:', error);
      }
    });
  } catch (error) {
    console.error('[PostHog] Failed to schedule capture:', error);
  }
}

