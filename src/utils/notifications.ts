import prisma from '../config/database';

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
  | 'EXTRA_CHARGE_CANCELLED';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
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

