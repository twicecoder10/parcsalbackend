import prisma from '../../config/database';
import { Feedback, FeedbackApp, FeedbackPriority, FeedbackStatus, FeedbackType, Prisma } from '@prisma/client';

export interface CreateFeedbackData {
  userId?: string | null;
  companyId?: string | null;
  type: FeedbackType;
  rating?: number | null;
  message: string;
  pageUrl?: string | null;
  app: FeedbackApp;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  attachments?: Prisma.InputJsonValue | null;
}

export interface FeedbackFilters {
  status?: FeedbackStatus;
  type?: FeedbackType;
  app?: FeedbackApp;
}

export interface FeedbackPagination {
  limit: number;
  offset: number;
}

export const feedbackRepository = {
  async create(data: CreateFeedbackData): Promise<Feedback> {
    const { userId, companyId, ...rest } = data;
    const createData: Prisma.FeedbackCreateInput = {
      ...rest,
      attachments: rest.attachments === null ? Prisma.DbNull : rest.attachments,
      ...(userId ? { user: { connect: { id: userId } } } : {}),
      ...(companyId ? { company: { connect: { id: companyId } } } : {}),
    };

    return prisma.feedback.create({
      data: createData,
    });
  },

  async findById(id: string): Promise<Feedback | null> {
    return prisma.feedback.findUnique({
      where: { id },
    });
  },

  async update(id: string, data: Partial<CreateFeedbackData>): Promise<Feedback> {
    const { userId, companyId, ...rest } = data;
    const updateData: Prisma.FeedbackUpdateInput = {
      ...rest,
      attachments: rest.attachments === null ? Prisma.DbNull : rest.attachments,
      ...(userId === undefined
        ? {}
        : userId === null
          ? { user: { disconnect: true } }
          : { user: { connect: { id: userId } } }),
      ...(companyId === undefined
        ? {}
        : companyId === null
          ? { company: { disconnect: true } }
          : { company: { connect: { id: companyId } } }),
    };

    return prisma.feedback.update({
      where: { id },
      data: updateData,
    });
  },

  async findMany(filters: FeedbackFilters, pagination: FeedbackPagination) {
    const where: Prisma.FeedbackWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.app ? { app: filters.app } : {}),
    };

    const [feedback, total] = await prisma.$transaction([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              plan: true,
            },
          },
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    return { feedback, total };
  },
};

