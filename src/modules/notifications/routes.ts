import { Router } from 'express';
import { notificationController } from './controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/', authenticate, notificationController.getNotifications);
router.get('/unread-count', authenticate, notificationController.getUnreadCount);
router.put('/:notificationId/read', authenticate, notificationController.markAsRead);
router.put('/read-all', authenticate, notificationController.markAllAsRead);
router.delete('/:notificationId', authenticate, notificationController.deleteNotification);
router.delete('/read/all', authenticate, notificationController.deleteAllRead);

export default router;

