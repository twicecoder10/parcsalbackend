import prisma from '../../config/database';
import { ChatRoom, Message, Prisma } from '@prisma/client';
import { PaginationParams } from '../../utils/pagination';

export interface CreateChatRoomData {
  customerId: string;
  companyId: string;
  bookingId?: string | null;
}

export interface CreateMessageData {
  chatRoomId: string;
  senderId: string;
  content: string;
}

export const chatRepository = {
  async createChatRoom(data: CreateChatRoomData): Promise<ChatRoom> {
    return prisma.chatRoom.create({
      data,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  },

  async findChatRoomById(id: string): Promise<ChatRoom | null> {
    return prisma.chatRoom.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  },

  async findChatRoomByParticipants(
    customerId: string,
    companyId: string,
    bookingId?: string | null
  ): Promise<ChatRoom | null> {
    const where: Prisma.ChatRoomWhereInput = {
      customerId,
      companyId,
    };

    if (bookingId) {
      where.bookingId = bookingId;
    } else {
      where.bookingId = null;
    }

    return prisma.chatRoom.findFirst({
      where,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  },

  async findChatRoomsByCustomer(
    customerId: string,
    params: PaginationParams
  ): Promise<{ chatRooms: ChatRoom[]; total: number }> {
    const skip = params.offset;

    // Only return chat rooms that have at least one message
    const [chatRooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where: {
          customerId,
          messages: {
            some: {}, // At least one message exists
          },
        },
        skip,
        take: params.limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
            },
          },
          booking: {
            select: {
              id: true,
              status: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              senderId: true,
            },
          },
        },
      }),
      prisma.chatRoom.count({
        where: {
          customerId,
          messages: {
            some: {}, // At least one message exists
          },
        },
      }),
    ]);

    return { chatRooms, total };
  },

  async findChatRoomsByCompany(
    companyId: string,
    params: PaginationParams
  ): Promise<{ chatRooms: ChatRoom[]; total: number }> {
    const skip = params.offset;

    // Only return chat rooms that have at least one message
    const [chatRooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where: {
          companyId,
          messages: {
            some: {}, // At least one message exists
          },
        },
        skip,
        take: params.limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
            },
          },
          booking: {
            select: {
              id: true,
              status: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              senderId: true,
            },
          },
        },
      }),
      prisma.chatRoom.count({
        where: {
          companyId,
          messages: {
            some: {}, // At least one message exists
          },
        },
      }),
    ]);

    return { chatRooms, total };
  },

  async createMessage(data: CreateMessageData): Promise<Message> {
    // Create message and update chat room's lastMessageAt in a transaction
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data,
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      });

      await tx.chatRoom.update({
        where: { id: data.chatRoomId },
        data: { lastMessageAt: new Date() },
      });

      return message;
    });
  },

  async findMessagesByChatRoom(
    chatRoomId: string,
    params: PaginationParams
  ): Promise<{ messages: Message[]; total: number }> {
    const skip = params.offset;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { chatRoomId },
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      prisma.message.count({
        where: { chatRoomId },
      }),
    ]);

    return { messages, total };
  },

  async markMessagesAsRead(chatRoomId: string, userId: string): Promise<number> {
    try {
      return await prisma.message.updateMany({
        where: {
          chatRoomId,
          senderId: { not: userId },
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      }).then((result) => result.count);
    } catch (error: any) {
      // If connection pool is exhausted, return 0 instead of throwing
      // This prevents cascading failures
      if (error.code === 'P2024') {
        console.warn('Connection pool exhausted when marking messages as read, skipping...');
        return 0;
      }
      throw error;
    }
  },

  async getUnreadCount(chatRoomId: string, userId: string): Promise<number> {
    return prisma.message.count({
      where: {
        chatRoomId,
        senderId: { not: userId },
        isRead: false,
      },
    });
  },
};

