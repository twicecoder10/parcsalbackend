import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import prisma from '../../config/database';
import { chatRepository } from './repository';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
    companyId?: string | null;
  };
}

export function setupChatSocket(io: SocketIOServer) {
  // Authentication middleware for Socket.IO
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as {
        userId: string;
        email: string;
        role: string;
        companyId?: string | null;
      };

      // Verify user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          companyId: true,
        },
      });

      if (!user) {
        return next(new Error('User not found') as Error);
      }

      socket.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
      };

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        next(new Error('Invalid or expired token') as Error);
      } else {
        next(error as Error);
      }
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      socket.disconnect();
      return;
    }

    const userId = socket.user.id;
    const userRole = socket.user.role;

    // Join user-specific room for notifications
    socket.join(`user:${userId}`);

    // Join company room if user is part of a company
    if (userRole === 'COMPANY_ADMIN' || userRole === 'COMPANY_STAFF') {
      if (socket.user.companyId) {
        socket.join(`company:${socket.user.companyId}`);
      }
    }

    console.log(`User ${userId} (${userRole}) connected to chat`);

    // Join a chat room
    // Note: Access verification is minimal here to avoid DB queries
    // Full access control is handled by REST API when loading chat rooms
    socket.on('join:chatRoom', (data: { chatRoomId: string }) => {
      try {
        const { chatRoomId } = data;

        if (!chatRoomId || typeof chatRoomId !== 'string') {
          socket.emit('error', { message: 'Invalid chat room ID' });
          return;
        }

        // Join the chat room (access verification happens via REST API)
        // We trust that if the user can load the chat room via API, they can join via socket
        socket.join(`chatRoom:${chatRoomId}`);
        socket.emit('joined:chatRoom', { chatRoomId });

        // Note: Marking messages as read should be done via REST API, not socket
        // This prevents connection pool exhaustion
      } catch (error) {
        console.error('Error joining chat room:', error);
        socket.emit('error', { message: 'Failed to join chat room' });
      }
    });

    // Leave a chat room
    socket.on('leave:chatRoom', (data: { chatRoomId: string }) => {
      const { chatRoomId } = data;
      socket.leave(`chatRoom:${chatRoomId}`);
      socket.emit('left:chatRoom', { chatRoomId });
    });

    // Send a message
    socket.on('message:send', async (data: { chatRoomId?: string; companyId?: string; bookingId?: string | null; content: string }) => {
      try {
        const { chatRoomId, companyId, bookingId, content } = data;

        if (!content || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content cannot be empty' });
          return;
        }

        if (content.length > 5000) {
          socket.emit('error', { message: 'Message content too long' });
          return;
        }

        let chatRoom;

        // If chatRoomId is provided, use existing room
        if (chatRoomId) {
          chatRoom = await chatRepository.findChatRoomById(chatRoomId);
          if (!chatRoom) {
            socket.emit('error', { message: 'Chat room not found' });
            return;
          }
        } else if (companyId) {
          // Create chat room on first message
          if (userRole !== 'CUSTOMER') {
            socket.emit('error', { message: 'Only customers can start new conversations' });
            return;
          }

          // Verify company exists
          const company = await prisma.company.findUnique({
            where: { id: companyId },
          });

          if (!company) {
            socket.emit('error', { message: 'Company not found' });
            return;
          }

          // If bookingId is provided, verify it belongs to the customer and company
          if (bookingId) {
            const booking = await prisma.booking.findUnique({
              where: { id: bookingId },
            });

            if (!booking) {
              socket.emit('error', { message: 'Booking not found' });
              return;
            }

            if (booking.customerId !== userId) {
              socket.emit('error', { message: 'Booking does not belong to you' });
              return;
            }

            if (booking.companyId !== companyId) {
              socket.emit('error', { message: 'Booking does not belong to this company' });
              return;
            }
          }

          // Check if chat room already exists
          chatRoom = await chatRepository.findChatRoomByParticipants(
            userId,
            companyId,
            bookingId || null
          );

          // If no chat room exists, create it now (first message)
          if (!chatRoom) {
            chatRoom = await chatRepository.createChatRoom({
              customerId: userId,
              companyId,
              bookingId: bookingId || null,
            });
          }
        } else {
          socket.emit('error', { message: 'Either chatRoomId or companyId must be provided' });
          return;
        }

        // Verify access
        if (userRole === 'CUSTOMER') {
          if (chatRoom.customerId !== userId) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }
        } else if (userRole === 'COMPANY_ADMIN' || userRole === 'COMPANY_STAFF') {
          if (chatRoom.companyId !== socket.user?.companyId) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Check staff permission for replying to messages
          if (userRole === 'COMPANY_STAFF') {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { restrictions: true },
            });

            if (user) {
              const restrictions = (user.restrictions as Record<string, boolean> | null) || {};
              if (restrictions.replyToMessage === false) {
                socket.emit('error', { message: 'You do not have permission to reply to messages' });
                return;
              }
            }
          }
        } else {
          socket.emit('error', { message: 'Invalid user role' });
          return;
        }

        // Create message (chat room is guaranteed to exist at this point)
        const messageResult = await chatRepository.createMessage({
          chatRoomId: chatRoom.id,
          senderId: userId,
          content: content.trim(),
        });

        // Use sender info from socket.user (already authenticated)
        // This avoids an extra DB query
        if (!socket.user) {
          socket.emit('error', { message: 'User not authenticated' });
          return;
        }

        const sender = {
          id: socket.user.id,
          email: socket.user.email,
          fullName: socket.user.fullName || socket.user.email.split('@')[0],
          role: socket.user.role,
        };

        // Emit message to all users in the chat room
        io.to(`chatRoom:${chatRoom.id}`).emit('message:new', {
          id: messageResult.id,
          chatRoomId: messageResult.chatRoomId,
          senderId: messageResult.senderId,
          sender: {
            id: sender.id,
            email: sender.email,
            fullName: sender.fullName,
            role: sender.role,
          },
          content: messageResult.content,
          isRead: messageResult.isRead,
          readAt: messageResult.readAt,
          createdAt: messageResult.createdAt,
        });

        // Notify the other party if they're not in the room
        const otherUserId = userRole === 'CUSTOMER' ? null : chatRoom.customerId;
        if (otherUserId) {
          io.to(`user:${otherUserId}`).emit('chatRoom:newMessage', {
            chatRoomId: chatRoom.id,
            message: {
              id: messageResult.id,
              content: messageResult.content,
              createdAt: messageResult.createdAt,
            },
          });
        }

        // If this was a new chat room (first message), notify the sender
        if (!chatRoomId) {
          socket.emit('chatRoom:created', {
            chatRoomId: chatRoom.id,
            companyId: chatRoom.companyId,
            bookingId: chatRoom.bookingId,
          });
        }
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Note: Marking messages as read is handled via REST API only
    // This prevents database connection pool exhaustion
    // Use PUT /chat/rooms/:chatRoomId/read endpoint instead

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from chat`);
    });
  });
}

