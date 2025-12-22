import { Router } from 'express';
import { chatController } from './controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  createChatRoomSchema,
  sendMessageSchema,
  getChatRoomsSchema,
  getMessagesSchema,
  markMessagesAsReadSchema,
} from './dto';

const router = Router();

// Create chat room (customers and company users)
router.post(
  '/rooms',
  authenticate,
  validate(createChatRoomSchema),
  chatController.createChatRoom
);

// Get chat rooms (customers and company users)
router.get(
  '/rooms',
  authenticate,
  validate(getChatRoomsSchema),
  chatController.getChatRooms
);

// Get chat room by ID
router.get(
  '/rooms/:chatRoomId',
  authenticate,
  chatController.getChatRoomById
);

// Get messages in a chat room
router.get(
  '/rooms/:chatRoomId/messages',
  authenticate,
  validate(getMessagesSchema),
  chatController.getMessages
);

// Send message (via REST API - Socket.IO is preferred)
router.post(
  '/messages',
  authenticate,
  validate(sendMessageSchema),
  chatController.sendMessage
);

// Mark messages as read
router.put(
  '/rooms/:chatRoomId/read',
  authenticate,
  validate(markMessagesAsReadSchema),
  chatController.markMessagesAsRead
);

export default router;

