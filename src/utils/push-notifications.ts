import prisma from '../config/database';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  sound?: 'default';
  title?: string;
  body?: string;
  data?: Record<string, any>;
  badge?: number;
  channelId?: string;
}

interface ExpoPushResponse {
  data: Array<{
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: any;
  }>;
}

/**
 * Send push notification via Expo Push Notification Service
 */
export async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  badge?: number
): Promise<boolean> {
  try {
    if (!pushToken || (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken['))) {
      // Not a valid Expo push token
      return false;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      channelId: 'default', // Android notification channel
    };

    if (badge !== undefined) {
      message.badge = badge;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify([message]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[Push Notification] HTTP error:', response.status, response.statusText);
        return false;
      }

      const result = (await response.json()) as ExpoPushResponse;

      if (result?.data?.[0]?.status === 'ok') {
        return true;
      } else {
        const error = result?.data?.[0];
        console.error('[Push Notification] Failed to send:', error?.message || error);
        return false;
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[Push Notification] Request timeout');
      } else {
        throw fetchError;
      }
      return false;
    }
  } catch (error: any) {
    console.error('[Push Notification] Error sending push notification:', error.message);
    return false;
  }
}

/**
 * Send push notification to a user if they have a push token
 */
export async function sendPushNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushToken: true,
      },
    });

    if (!user?.pushToken) {
      // User doesn't have a push token registered
      return false;
    }

    // Get unread count for badge
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return await sendExpoPushNotification(user.pushToken, title, body, data, unreadCount);
  } catch (error) {
    console.error('[Push Notification] Error sending push notification to user:', error);
    return false;
  }
}

