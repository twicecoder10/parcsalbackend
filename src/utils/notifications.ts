import prisma from '../config/database';
import { Server as SocketIOServer } from 'socket.io';
import { sendPushNotificationToUser } from './push-notifications';
import { queueEmail } from '../modules/email/queue';
import { emailService } from '../config/email';

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_ACCEPTED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_IN_TRANSIT'
  | 'BOOKING_DELIVERED'
  | 'BOOKING_TRACKING_UPDATED'
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
  | 'MARKETING_MESSAGE'
  | 'TRAVELLER_VERIFIED'
  | 'TRAVEL_LISTING_CREATED'
  | 'TRAVEL_LISTING_PUBLISHED'
  | 'TRAVEL_LISTING_CLOSED'
  | 'TRAVEL_FLIGHT_PROOF_SUBMITTED'
  | 'TRAVEL_BOOKING_REQUESTED'
  | 'TRAVEL_BOOKING_APPROVED'
  | 'TRAVEL_BOOKING_REJECTED'
  | 'TRAVEL_PAYMENT_COMPLETED'
  | 'TRAVEL_DELIVERED'
  | 'TRAVEL_DELIVERY_CONFIRMED'
  | 'TRAVEL_PAYOUT_RELEASED'
  | 'TRAVEL_FLIGHT_PROOF_REVIEWED'
  | 'TRAVEL_BOOKING_RISK_FLAGGED'
  | 'TRAVEL_DISPUTE_OPENED'
  | 'TRAVEL_DISPUTE_UPDATED'
  | 'TRAVEL_REVIEW_SUBMITTED';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  /** Send email whenever the user has an address, even if notificationEmail is off (e.g. verification outcomes). */
  alwaysSendEmail?: boolean;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    // Email: normal flow respects notificationEmail; alwaysSendEmail overrides for critical account messages.
    if (user.email && (user.notificationEmail || data.alwaysSendEmail)) {
      const safeName = escapeHtml(user.fullName || 'there');
      const safeTitle = escapeHtml(data.title);
      const safeBody = escapeHtml(data.body);

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${safeTitle} - Parcsal</title>
        </head>
        <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
          <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f5;padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="background:#FF6B35;padding:24px;color:#ffffff;font-size:22px;font-weight:700;">
                      Parcsal Notification
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px;">
                      <p style="margin:0 0 12px 0;color:#1A1A1A;">Hi ${safeName},</p>
                      <h2 style="margin:0 0 12px 0;color:#1A1A1A;font-size:20px;">${safeTitle}</h2>
                      <p style="margin:0;color:#4A4A4A;font-size:15px;line-height:1.6;">${safeBody}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      if (data.alwaysSendEmail) {
        // Critical notification path (e.g. profile rejection): send immediately via SMTP.
        emailService
          .sendEmail(user.email, `[Parcsal] ${data.title}`, html, `${data.title}\n\n${data.body}`)
          .catch((error) => {
            console.error('[Notification] Error sending critical notification email:', error);
          });
      } else {
        queueEmail({
          to: user.email,
          subject: `[Parcsal] ${data.title}`,
          html,
          text: `${data.title}\n\n${data.body}`,
        }).catch((error) => {
          console.error('[Notification] Error queueing notification email:', error);
        });
      }
    }

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
 * Create notifications for all SUPER_ADMIN users
 */
export async function createSuperAdminNotification(
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, any>
) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });

    const notifications = await Promise.all(
      admins.map((admin) =>
        createNotification({ userId: admin.id, type, title, body, metadata })
      )
    );

    return notifications.filter((n) => n !== null);
  } catch (error) {
    console.error('[Notification] Error creating super admin notifications:', error);
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

