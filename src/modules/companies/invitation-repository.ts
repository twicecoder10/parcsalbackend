import prisma from '../../config/database';
import { TeamInvitation, InvitationStatus, UserRole } from '@prisma/client';
import crypto from 'crypto';

export interface CreateInvitationData {
  companyId: string;
  email: string;
  role: UserRole;
  invitedById: string;
  expiresAt: Date;
}

export const invitationRepository = {
  async create(data: CreateInvitationData): Promise<TeamInvitation> {
    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    return prisma.teamInvitation.create({
      data: {
        ...data,
        token,
        status: 'PENDING',
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByToken(token: string): Promise<TeamInvitation | null> {
    return prisma.teamInvitation.findUnique({
      where: { token },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async findByCompany(
    companyId: string,
    status?: InvitationStatus
  ): Promise<TeamInvitation[]> {
    const where: any = { companyId };
    if (status) {
      where.status = status;
    }

    return prisma.teamInvitation.findMany({
      where,
      include: {
        invitedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        acceptedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async findByEmailAndCompany(
    email: string,
    companyId: string
  ): Promise<TeamInvitation | null> {
    return prisma.teamInvitation.findFirst({
      where: {
        email,
        companyId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async updateStatus(
    id: string,
    status: InvitationStatus,
    acceptedById?: string
  ): Promise<TeamInvitation> {
    const updateData: any = { status };
    if (status === 'ACCEPTED' && acceptedById) {
      updateData.acceptedAt = new Date();
      updateData.acceptedById = acceptedById;
    }

    return prisma.teamInvitation.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        acceptedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.teamInvitation.delete({
      where: { id },
    });
  },

  async expireOldInvitations(): Promise<number> {
    const result = await prisma.teamInvitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return result.count;
  },
};

