import { z } from 'zod';

export const createChatRoomSchema = z.object({
  body: z.object({
    companyId: z.string().uuid('Invalid company ID'),
    bookingId: z.string().uuid('Invalid booking ID').optional().nullable(),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    chatRoomId: z.string().uuid('Invalid chat room ID'),
    content: z.string().min(1, 'Message content cannot be empty').max(5000, 'Message content too long'),
  }),
});

export const getChatRoomsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    chatRoomId: z.string().uuid('Invalid chat room ID'),
  }),
  query: z.object({
    page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  }),
});

export const markMessagesAsReadSchema = z.object({
  params: z.object({
    chatRoomId: z.string().uuid('Invalid chat room ID'),
  }),
});

export type CreateChatRoomDto = z.infer<typeof createChatRoomSchema>['body'];
export type SendMessageDto = z.infer<typeof sendMessageSchema>['body'];
export type GetChatRoomsDto = z.infer<typeof getChatRoomsSchema>['query'];
export type GetMessagesDto = z.infer<typeof getMessagesSchema>['query'] & z.infer<typeof getMessagesSchema>['params'];
export type MarkMessagesAsReadDto = z.infer<typeof markMessagesAsReadSchema>['params'];

