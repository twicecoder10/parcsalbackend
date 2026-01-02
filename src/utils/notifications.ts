import prisma from '../config/database';
import { Server as SocketIOServer } from 'socket.io';
import { sendPushNotificationToUser } from './push-notifications';

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_ACCEPTED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_IN_TRANSIT'
  | 'BOOKING_DELIVERED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'SHIPMENT_PUBLISHED'
  | 'SHIPMENT_CLOSED'
  | 'SHIPMENT_TRACKING_UPDATE'
  | 'TEAM_INVITATION'
  | 'TEAM_MEMBER_ADDED'
  | 'TEAM_MEMBER_REMOVED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'EXTRA_CHARGE_REQUESTED'
  | 'EXTRA_CHARGE_PAID'
  | 'EXTRA_CHARGE_DECLINED'
  | 'EXTRA_CHARGE_CANCELLED'
  | 'MARKETING_MESSAGE';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

// Socket.IO instance (initialized from server.ts)
let ioInstance: SocketIOServer | null = null;

/**
 * Initialize Socket.IO instance for notifications
 * Call this from server.ts after Socket.IO is set up
 */
export function initializeNotificationSocket(io: SocketIOServer) {
  ioInstance = io;
}

/**
 * Emit unread count update to user via Socket.IO
 * Helper function that can be reused for mark-as-read, delete, etc.
 */
export async function emitUnreadCount(userId: string) {
  if (!ioInstance) {
    // Socket.IO not initialized yet, skip emission
    return;
  }

  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    ioInstance.to(`user:${userId}`).emit('notification:unreadCount', {
      count: unreadCount,
    });
  } catch (error) {
    // Don't fail if Socket.IO emission fails
    console.error('[Notification] Error emitting unread count:', error);
  }
}

/**
 * Emit notification update event (e.g., when marked as read)
 */
export async function emitNotificationUpdate(userId: string, notification: any) {
  if (!ioInstance) {
    return;
  }

  try {
    ioInstance.to(`user:${userId}`).emit('notification:updated', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });

    // Emit updated unread count
    await emitUnreadCount(userId);
  } catch (error) {
    console.error('[Notification] Error emitting notification update:', error);
  }
}

/**
 * Emit notification deletion event
 */
export async function emitNotificationDelete(userId: string, notificationId: string) {
  if (!ioInstance) {
    return;
  }

  try {
    ioInstance.to(`user:${userId}`).emit('notification:deleted', {
      id: notificationId,
    });

    // Emit updated unread count (in case deleted notification was unread)
    await emitUnreadCount(userId);
  } catch (error) {
    console.error('[Notification] Error emitting notification deletion:', error);
  }
}

/**
 * Emit notification to user via Socket.IO
 */
async function emitNotification(userId: string, notification: any) {
  if (!ioInstance) {
    // Socket.IO not initialized yet, skip emission
    return;
  }

  try {
    // Emit new notification
    ioInstance.to(`user:${userId}`).emit('notification:new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });

    // Emit updated unread count using helper function
    await emitUnreadCount(userId);
  } catch (error) {
    // Don't fail notification creation if Socket.IO emission fails
    console.error('[Notification] Error emitting Socket.IO event:', error);
  }
}

/**
 * Create a notification for a user
 */
export async function createNotification(data: CreateNotificationData) {
  try {
    // Check user's notification preferences
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        notificationEmail: true,
        notificationSMS: true,
        email: true,
        fullName: true,
        pushToken: true,
      },
    });

    if (!user) {
      console.error(`[Notification] User not found: ${data.userId}`);
      return null;
    }

    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        metadata: data.metadata || {},
      },
    });

    // Emit real-time notification via Socket.IO
    await emitNotification(data.userId, notification);

    // Send push notification if user has a push token (for when app is closed)
    // Note: When app is open/backgrounded, Socket.IO + local push notifications handle it
    if (user.pushToken) {
      // Send push notification asynchronously (don't wait for it)
      sendPushNotificationToUser(data.userId, data.title, data.body, {
        notificationId: notification.id,
        type: data.type,
        ...(data.metadata?.bookingId && { bookingId: data.metadata.bookingId }),
        ...(data.metadata?.shipmentSlotId && { shipmentSlotId: data.metadata.shipmentSlotId }),
      }).catch((error) => {
        console.error('[Notification] Error sending push notification:', error);
      });
    }

    // TODO: Send email/SMS based on user preferences
    // For now, we just create the notification in the database
    // Email/SMS sending can be implemented later with a queue system

    return notification;
  } catch (error) {
    console.error('[Notification] Error creating notification:', error);
    return null;
  }
}

/**
 * Create notifications for all company admins and staff
 */
export async function createCompanyNotification(
  companyId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, any>
) {
  try {
    const companyUsers = await prisma.user.findMany({
      where: {
        companyId,
        role: {
          in: ['COMPANY_ADMIN', 'COMPANY_STAFF'],
        },
      },
      select: {
        id: true,
      },
    });

    const notifications = await Promise.all(
      companyUsers.map((user) =>
        createNotification({
          userId: user.id,
          type,
          title,
          body,
          metadata,
        })
      )
    );

    return notifications.filter((n) => n !== null);
  } catch (error) {
    console.error('[Notification] Error creating company notifications:', error);
    return [];
  }
}

/**
 * Create notifications for all customers with bookings on a shipment
 */
export async function createShipmentCustomerNotifications(
  shipmentSlotId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, any>
) {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        shipmentSlotId,
        status: {
          in: ['PENDING', 'ACCEPTED', 'IN_TRANSIT'],
        },
      },
      select: {
        customerId: true,
      },
      distinct: ['customerId'],
    });

    const notifications = await Promise.all(
      bookings.map((booking) =>
        createNotification({
          userId: booking.customerId,
          type,
          title,
          body,
          metadata,
        })
      )
    );

    return notifications.filter((n) => n !== null);
  } catch (error) {
    console.error('[Notification] Error creating shipment customer notifications:', error);
    return [];
  }
}

