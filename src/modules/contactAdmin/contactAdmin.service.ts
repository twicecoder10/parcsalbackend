import prisma from '../../config/database';
import { ContactStatus, Prisma } from '@prisma/client';
import { NotFoundError } from '../../utils/errors';
import { ListContactMessagesQuery, UpdateContactMessageDto } from './contactAdmin.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query?: ListContactMessagesQuery) {
  const page = Math.max(query?.page ?? DEFAULT_PAGE, 1);
  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildSearchFilter(search?: string): Prisma.ContactWhereInput | undefined {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export const contactAdminService = {
  async listContactMessages(query?: ListContactMessagesQuery) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.ContactWhereInput = {
      status: query?.status,
      ...buildSearchFilter(query?.search),
    };

    const [data, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  },

  async getContactMessage(id: string) {
    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundError('Contact message not found');
    }

    return contact;
  },

  async updateContactMessage(id: string, dto: UpdateContactMessageDto) {
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Contact message not found');
    }

    const status = dto.status as ContactStatus;
    const isRead = status !== 'NEW';

    return prisma.contact.update({
      where: { id },
      data: {
        status,
        isRead,
      },
    });
  },
};

