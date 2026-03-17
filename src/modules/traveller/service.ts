import prisma from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { parsePagination, createPaginatedResponse } from '../../utils/pagination';
import { createNotification } from '../../utils/notifications';
import {
  UpsertTravellerProfileDto,
  UpdateTravellerProfileDto,
  ReviewTravellerProfileDto,
} from './dto';
import { TravellerVerificationStatus } from '@prisma/client';

function deriveStatus(
  idDocumentUrl: string | null | undefined,
  selfieUrl: string | null | undefined,
  flightTicketUrl: string | null | undefined,
  currentStatus: TravellerVerificationStatus
): TravellerVerificationStatus {
  if (currentStatus === 'VERIFIED') return 'VERIFIED';

  if (idDocumentUrl && selfieUrl && flightTicketUrl) {
    return 'PENDING';
  }
  return 'NOT_STARTED';
}

export const travellerService = {
  async getMyProfile(req: AuthRequest) {
    if (!req.user) throw new ForbiddenError();

    const profile = await prisma.travellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    return profile;
  },

  async createProfile(req: AuthRequest, dto: UpsertTravellerProfileDto) {
    if (!req.user) throw new ForbiddenError();

    const existing = await prisma.travellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (existing) {
      return this.updateProfile(req, dto);
    }

    const status = deriveStatus(
      dto.idDocumentUrl,
      dto.selfieUrl,
      dto.flightTicketUrl,
      'NOT_STARTED'
    );

    const profile = await prisma.travellerProfile.create({
      data: {
        userId: req.user.id,
        idDocumentUrl: dto.idDocumentUrl,
        selfieUrl: dto.selfieUrl,
        flightTicketUrl: dto.flightTicketUrl,
        verificationStatus: status,
      },
    });

    return profile;
  },

  async updateProfile(req: AuthRequest, dto: UpdateTravellerProfileDto) {
    if (!req.user) throw new ForbiddenError();

    const existing = await prisma.travellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!existing) {
      throw new NotFoundError('Traveller profile not found. Create one first.');
    }

    const merged = {
      idDocumentUrl: dto.idDocumentUrl ?? existing.idDocumentUrl,
      selfieUrl: dto.selfieUrl ?? existing.selfieUrl,
      flightTicketUrl: dto.flightTicketUrl ?? existing.flightTicketUrl,
    };

    const newStatus = deriveStatus(
      merged.idDocumentUrl,
      merged.selfieUrl,
      merged.flightTicketUrl,
      existing.verificationStatus
    );

    const profile = await prisma.travellerProfile.update({
      where: { userId: req.user.id },
      data: {
        ...dto,
        verificationStatus: newStatus,
      },
    });

    return profile;
  },

  async getProfileById(profileId: string) {
    const profile = await prisma.travellerProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phoneNumber: true, country: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundError('Traveller profile not found');
    }

    return profile;
  },

  async listProfiles(query: any) {
    const pagination = parsePagination(query || {});
    const where: any = {};

    if (query?.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }

    const [profiles, total] = await Promise.all([
      prisma.travellerProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.travellerProfile.count({ where }),
    ]);

    return createPaginatedResponse(profiles, total, pagination);
  },

  async reviewProfile(adminId: string, profileId: string, dto: ReviewTravellerProfileDto) {
    const profile = await prisma.travellerProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundError('Traveller profile not found');
    }

    const updated = await prisma.travellerProfile.update({
      where: { id: profileId },
      data: {
        verificationStatus: dto.verificationStatus,
        rejectionReason:
          dto.verificationStatus === 'REJECTED' ? dto.rejectionReason : null,
        idVerified: dto.verificationStatus === 'VERIFIED',
        flightVerified: dto.verificationStatus === 'VERIFIED',
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
      },
    });

    const notifTitle =
      dto.verificationStatus === 'VERIFIED'
        ? 'Traveller Verification Approved'
        : 'Traveller Verification Rejected';
    const notifBody =
      dto.verificationStatus === 'VERIFIED'
        ? 'Your traveller profile has been verified. You can now publish courier listings.'
        : `Your traveller verification was rejected: ${dto.rejectionReason}`;

    await createNotification({
      userId: profile.userId,
      type: 'TRAVELLER_VERIFIED' as any,
      title: notifTitle,
      body: notifBody,
      metadata: { travellerProfileId: profile.id },
    });

    return updated;
  },
};
