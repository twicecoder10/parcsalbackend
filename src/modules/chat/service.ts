import { chatRepository } from './repository';
import { CreateChatRoomDto, SendMessageDto, GetChatRoomsDto, GetMessagesDto, MarkMessagesAsReadDto } from './dto';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { checkStaffPermission } from '../../utils/permissions';
import prisma from '../../config/database';

export const chatService = {
  async createChatRoom(req: AuthRequest, dto: CreateChatRoomDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Customers and company users can create chat rooms
    const isCustomer = req.user.role === 'CUSTOMER';
    const isCompanyUser = req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF';
    
    if (!isCustomer && !isCompanyUser) {
      throw new ForbiddenError('Only customers and company users can create chat rooms');
    }

    let companyId: string;
    let customerId: string;

    if (isCustomer) {
      // For customers: they provide companyId, customerId is themselves
      companyId = dto.companyId;
      customerId = req.user.id;
    } else {
      // For company users: they use their own companyId, need customerId from bookingId
      if (!req.user.companyId) {
        throw new ForbiddenError('User is not associated with a company');
      }
      companyId = req.user.companyId;

      // Company admins must provide bookingId to get customerId
      if (!dto.bookingId) {
        throw new BadRequestError('bookingId is required for company users to create chat rooms');
      }

      const booking = await prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: {
          id: true,
          customerId: true,
          companyId: true,
          status: true,
        },
      });

      if (!booking) {
        throw new NotFoundError('Booking not found');
      }

      if (booking.companyId !== req.user.companyId) {
        throw new ForbiddenError('Booking does not belong to your company');
      }

      customerId = booking.customerId;
    }

    // If bookingId is provided, verify it belongs to the customer and company
    if (dto.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: {
          id: true,
          customerId: true,
          companyId: true,
          status: true,
        },
      });

      if (!booking) {
        throw new NotFoundError('Booking not found');
      }

      if (isCustomer && booking.customerId !== req.user.id) {
        throw new ForbiddenError('Booking does not belong to you');
      }

      if (booking.companyId !== companyId) {
        throw new BadRequestError('Booking does not belong to this company');
      }
    }

    // Check if chat room already exists (only return if it has messages)
    const existingChatRoom = await chatRepository.findChatRoomByParticipants(
      customerId,
      companyId,
      dto.bookingId || null
    );

    // Only return existing chat room if it has at least one message
    if (existingChatRoom) {
      const messageCount = await prisma.message.count({
        where: { chatRoomId: existingChatRoom.id },
      });
      
      if (messageCount > 0) {
        return existingChatRoom;
      }
    }

    // Get company info for return value
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Get customer info for return value
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Don't create chat room yet - just return metadata
    // Chat room will be created when first message is sent
    return {
      id: '', // Empty ID indicates room doesn't exist yet
      customerId,
      companyId,
      bookingId: dto.bookingId || null,
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        logoUrl: company.logoUrl,
      },
      booking: dto.bookingId ? {
        id: dto.bookingId,
        status: 'PENDING', // Will be fetched if needed
      } : null,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
    };
  },

  async getChatRooms(req: AuthRequest, dto: GetChatRoomsDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check staff permission for viewing messages
    if (req.user.role === 'COMPANY_STAFF') {
      await checkStaffPermission(req, 'viewMessages');
    }

    const pagination = parsePagination(dto);

    let result;
    if (req.user.role === 'CUSTOMER') {
      result = await chatRepository.findChatRoomsByCustomer(req.user.id, pagination);
    } else if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF') {
      if (!req.user.companyId) {
        throw new ForbiddenError('User is not associated with a company');
      }
      result = await chatRepository.findChatRoomsByCompany(req.user.companyId, pagination);
    } else {
      throw new ForbiddenError('Invalid user role');
    }

    return createPaginatedResponse(result.chatRooms, result.total, pagination);
  },

  async getChatRoomById(req: AuthRequest, chatRoomId: string) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check staff permission for viewing messages
    if (req.user.role === 'COMPANY_STAFF') {
      await checkStaffPermission(req, 'viewMessages');
    }

    const chatRoom = await chatRepository.findChatRoomById(chatRoomId);

    if (!chatRoom) {
      throw new NotFoundError('Chat room not found');
    }

    // Verify user has access to this chat room
    if (req.user.role === 'CUSTOMER') {
      if (chatRoom.customerId !== req.user.id) {
        throw new ForbiddenError('Access denied');
      }
    } else if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF') {
      if (chatRoom.companyId !== req.user.companyId) {
        throw new ForbiddenError('Access denied');
      }
    } else {
      throw new ForbiddenError('Invalid user role');
    }

    return chatRoom;
  },

  async getMessages(req: AuthRequest, dto: GetMessagesDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check staff permission for viewing messages
    if (req.user.role === 'COMPANY_STAFF') {
      await checkStaffPermission(req, 'viewMessages');
    }

    // Verify chat room access
    await this.getChatRoomById(req, dto.chatRoomId);

    const pagination = parsePagination(dto);
    const result = await chatRepository.findMessagesByChatRoom(dto.chatRoomId, pagination);

    // Reverse messages to show oldest first (since we order by desc)
    result.messages.reverse();

    return createPaginatedResponse(result.messages, result.total, pagination);
  },

  async sendMessage(req: AuthRequest, dto: SendMessageDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check staff permission for replying to messages
    if (req.user.role === 'COMPANY_STAFF') {
      await checkStaffPermission(req, 'replyToMessage');
    }

    let chatRoom = await chatRepository.findChatRoomById(dto.chatRoomId || '');

    // If chat room doesn't exist and user is company admin/staff, try to create it
    if (!chatRoom && (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF')) {
      if (!dto.customerId) {
        throw new BadRequestError('customerId is required when creating a new chat room');
      }

      if (!req.user.companyId) {
        throw new ForbiddenError('User is not associated with a company');
      }

      // Verify customer exists
      const customer = await prisma.user.findUnique({
        where: { id: dto.customerId },
        select: { id: true, role: true },
      });

      if (!customer || customer.role !== 'CUSTOMER') {
        throw new NotFoundError('Customer not found');
      }

      // If bookingId is provided, verify it belongs to the customer and company
      if (dto.bookingId) {
        const booking = await prisma.booking.findUnique({
          where: { id: dto.bookingId },
          select: {
            id: true,
            customerId: true,
            companyId: true,
          },
        });

        if (!booking) {
          throw new NotFoundError('Booking not found');
        }

        if (booking.customerId !== dto.customerId) {
          throw new BadRequestError('Booking does not belong to this customer');
        }

        if (booking.companyId !== req.user.companyId) {
          throw new BadRequestError('Booking does not belong to this company');
        }
      }

      // Check if chat room already exists
      chatRoom = await chatRepository.findChatRoomByParticipants(
        dto.customerId,
        req.user.companyId,
        dto.bookingId || null
      );

      // Create chat room if it doesn't exist
      if (!chatRoom) {
        chatRoom = await chatRepository.createChatRoom({
          customerId: dto.customerId,
          companyId: req.user.companyId,
          bookingId: dto.bookingId || null,
        });
      }
    } else if (!chatRoom) {
      // For customers, chat room must exist
      throw new NotFoundError('Chat room not found');
    }

    // Verify access
    if (req.user.role === 'CUSTOMER') {
      if (chatRoom.customerId !== req.user.id) {
        throw new ForbiddenError('Access denied');
      }
    } else if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF') {
      if (chatRoom.companyId !== req.user.companyId) {
        throw new ForbiddenError('Access denied');
      }
    } else {
      throw new ForbiddenError('Invalid user role');
    }

    // Create message (chat room exists at this point)
    const message = await chatRepository.createMessage({
      chatRoomId: chatRoom.id,
      senderId: req.user.id,
      content: dto.content,
    });

    return message;
  },

  async markMessagesAsRead(req: AuthRequest, dto: MarkMessagesAsReadDto) {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Verify chat room access
    await this.getChatRoomById(req, dto.chatRoomId);

    const count = await chatRepository.markMessagesAsRead(dto.chatRoomId, req.user.id);

    return { count };
  },
};

