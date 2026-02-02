import { Request, Response, NextFunction } from 'express';
import { whatsappService } from './service';
import { config } from '../../config/env';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';

export const whatsappController = {
  /**
   * GET /webhooks/whatsapp - Webhook verification
   * Meta sends a GET request to verify the webhook
   */
  async verifyWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        console.log('WhatsApp webhook verified');
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ error: 'Forbidden' });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /webhooks/whatsapp - Webhook handler for status updates
   * Meta sends POST requests with message status updates
   */
  async handleWebhook(req: Request, res: Response, _next: NextFunction) {
    try {
      // Respond immediately to Meta (within 20 seconds)
      res.status(200).json({ status: 'ok' });

      const body = req.body;

      // Handle status updates
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.value?.statuses) {
                for (const status of change.value.statuses) {
                  const messageId = status.id;
                  const statusValue = status.status; // sent, delivered, read, failed

                  if (messageId && statusValue) {
                    await whatsappService.updateMessageStatus(messageId, statusValue);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the webhook (already responded)
      console.error('Error processing WhatsApp webhook:', error);
    }
  },

  /**
   * PATCH /me/whatsapp-opt-in - User opt-in/opt-out for WhatsApp system notifications
   */
  async updateOptIn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(403).json({
          status: 'error',
          message: 'Authentication required',
        });
      }

      const { enabled } = req.body as { enabled: boolean };

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          message: 'enabled must be a boolean',
        });
      }

      // Check if user has phone number
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { phoneNumber: true },
      });

      if (!user?.phoneNumber) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is required to enable WhatsApp notifications',
        });
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: { notificationWhatsapp: enabled },
      });

      return res.status(200).json({
        status: 'success',
        message: `WhatsApp notifications ${enabled ? 'enabled' : 'disabled'}`,
        data: { notificationWhatsapp: enabled },
      });
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /admin/whatsapp-messages - Admin endpoint to view WhatsApp messages
   */
  async getMessages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden: Super admin access required',
        });
      }

      const pagination = parsePagination(req.query);
      const status = req.query.status as string | undefined;
      const companyId = req.query.companyId as string | undefined;
      const userId = req.query.userId as string | undefined;

      const where: any = {};
      if (status) {
        where.status = status;
      }
      if (companyId) {
        where.companyId = companyId;
      }
      if (userId) {
        where.userId = userId;
      }

      const [messages, total] = await Promise.all([
        prisma.whatsAppMessage.findMany({
          where,
          skip: pagination.offset,
          take: pagination.limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            user: {
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
              },
            },
          },
        }),
        prisma.whatsAppMessage.count({ where }),
      ]);

      return res.status(200).json({
        status: 'success',
        ...createPaginatedResponse(messages, total, pagination),
      });
    } catch (error) {
      return next(error);
    }
  },
};
