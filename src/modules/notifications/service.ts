import prisma from '../../config/database';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';

export const notificationService = {
  async getNotifications(req: AuthRequest, query: any) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const pagination = parsePagination(query);
    const unreadOnly = query.unreadOnly === 'true';
    const type = query.type as string | undefined;

    const where: any = { userId: req.user.id };
    if (unreadOnly) {
      where.isRead = false;
    }
    if (type) {
      where.type = type;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return createPaginatedResponse(notifications, total, pagination);
  },

  async getUnreadCount(req: AuthRequest) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
      },
    });

    return { count };
  },

  async markAsRead(req: AuthRequest, notificationId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (notification.userId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to update this notification');
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return { message: 'Notification marked as read' };
  },

  async markAllAsRead(req: AuthRequest) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  },

  async deleteNotification(req: AuthRequest, notificationId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (notification.userId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to delete this notification');
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted successfully' };
  },

  async deleteAllRead(req: AuthRequest) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const result = await prisma.notification.deleteMany({
      where: {
        userId: req.user.id,
        isRead: true,
      },
    });

    return { message: `${result.count} notifications deleted successfully`, count: result.count };
  },
};

