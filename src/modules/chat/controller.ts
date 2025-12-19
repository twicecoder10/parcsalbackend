import { Request, Response, NextFunction } from 'express';
import { chatService } from './service';
import { AuthRequest } from '../../middleware/auth';
import {
  CreateChatRoomDto,
  SendMessageDto,
  GetChatRoomsDto,
  GetMessagesDto,
  MarkMessagesAsReadDto,
} from './dto';

export const chatController = {
  async createChatRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateChatRoomDto;
      const result = await chatService.createChatRoom(req as AuthRequest, dto);

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getChatRooms(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.query as unknown as GetChatRoomsDto;
      const result = await chatService.getChatRooms(req as AuthRequest, dto);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getChatRoomById(req: Request, res: Response, next: NextFunction) {
    try {
      const { chatRoomId } = req.params;
      const result = await chatService.getChatRoomById(req as AuthRequest, chatRoomId);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = {
        chatRoomId: req.params.chatRoomId,
        page: req.query.page,
        limit: req.query.limit,
      } as unknown as GetMessagesDto;
      const result = await chatService.getMessages(req as AuthRequest, dto);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.body as SendMessageDto;
      const result = await chatService.sendMessage(req as AuthRequest, dto);

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async markMessagesAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = req.params as MarkMessagesAsReadDto;
      const result = await chatService.markMessagesAsRead(req as AuthRequest, dto);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

