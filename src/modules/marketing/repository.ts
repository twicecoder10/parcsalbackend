import prisma from '../../config/database';
import {
  CampaignSenderType,
  CampaignChannel,
  CampaignStatus,
  AudienceType,
  Prisma,
} from '@prisma/client';

export interface CreateCampaignData {
  senderType: CampaignSenderType;
  senderCompanyId?: string;
  createdByUserId: string;
  audienceType: AudienceType;
  channel: CampaignChannel;
  subject?: string;
  title?: string;
  contentHtml?: string;
  contentText?: string;
  inAppBody?: string;
  whatsappTemplateKey?: string;
  scheduledAt?: Date;
}

export interface ListCampaignsOptions {
  page: number;
  limit: number;
  status?: CampaignStatus;
  channel?: CampaignChannel;
  senderType?: CampaignSenderType;
  senderCompanyId?: string;
}

export interface CreateMessageLogData {
  campaignId: string;
  recipientId: string;
  channel: CampaignChannel;
  status: string;
  error?: string;
  providerMessageId?: string;
  sentAt?: Date;
}

export const marketingRepository = {
  // Campaigns
  async createCampaign(data: CreateCampaignData) {
    return prisma.marketingCampaign.create({
      data,
    });
  },

  async getCampaignById(id: string) {
    return prisma.marketingCampaign.findUnique({
      where: { id },
    });
  },

  async listCampaigns(options: ListCampaignsOptions) {
    const { page, limit, status, channel, senderType, senderCompanyId } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.MarketingCampaignWhereInput = {
      ...(status && { status }),
      ...(channel && { channel }),
      ...(senderType && { senderType }),
      ...(senderCompanyId !== undefined && { senderCompanyId }),
    };

    const [campaigns, total] = await Promise.all([
      prisma.marketingCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.marketingCampaign.count({ where }),
    ]);

    return {
      campaigns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async updateCampaign(id: string, data: Partial<CreateCampaignData>) {
    return prisma.marketingCampaign.update({
      where: { id },
      data,
    });
  },

  async updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    extra?: {
      startedAt?: Date;
      sentAt?: Date;
      failureReason?: string;
      totalRecipients?: number;
      deliveredCount?: number;
      failedCount?: number;
    }
  ) {
    return prisma.marketingCampaign.update({
      where: { id },
      data: {
        status,
        ...extra,
      },
    });
  },

  async deleteCampaign(id: string) {
    // This will cascade delete all MarketingMessageLog entries due to onDelete: Cascade
    return prisma.marketingCampaign.delete({
      where: { id },
    });
  },

  async findScheduledCampaigns() {
    return prisma.marketingCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          lte: new Date(),
        },
      },
    });
  },

  // Marketing Consent
  async getOrCreateConsent(userId: string) {
    const existing = await prisma.marketingConsent.findUnique({
      where: { userId },
    });

    if (existing) return existing;

    return prisma.marketingConsent.create({
      data: { userId },
    });
  },

  async updateConsent(
    userId: string,
    data: {
      emailMarketingOptIn?: boolean;
      whatsappMarketingOptIn?: boolean;
      carrierMarketingOptIn?: boolean;
    }
  ) {
    return prisma.marketingConsent.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  },

  async getConsentByUserId(userId: string) {
    return prisma.marketingConsent.findUnique({
      where: { userId },
    });
  },

  // Message Logs
  async createMessageLog(data: CreateMessageLogData) {
    return prisma.marketingMessageLog.create({
      data,
    });
  },

  async bulkCreateMessageLogs(data: CreateMessageLogData[]) {
    return prisma.marketingMessageLog.createMany({
      data,
    });
  },

  async updateMessageLog(
    id: string,
    data: {
      status?: string;
      error?: string;
      providerMessageId?: string;
      sentAt?: Date;
    }
  ) {
    return prisma.marketingMessageLog.update({
      where: { id },
      data,
    });
  },

  async getMessageLogsByCampaign(campaignId: string) {
    return prisma.marketingMessageLog.findMany({
      where: { campaignId },
      include: {
        recipient: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async countMessageLogsByCampaignAndStatus(campaignId: string) {
    const logs = await prisma.marketingMessageLog.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { id: true },
    });

    return logs.reduce(
      (acc, log) => {
        acc[log.status] = log._count.id;
        return acc;
      },
      {} as Record<string, number>
    );
  },

  // Recipients Resolution
  async getCompanyPastCustomers(companyId: string) {
    return prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        bookings: {
          some: {
            companyId,
          },
        },
      },
      distinct: ['id'],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
      },
    });
  },

  async getPlatformCustomers() {
    return prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
      },
    });
  },

  async getPlatformCompanies() {
    return prisma.user.findMany({
      where: {
        role: {
          in: ['COMPANY_ADMIN', 'COMPANY_STAFF'],
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
      },
    });
  },

  async getPlatformAllUsers() {
    return prisma.user.findMany({
      where: {
        role: {
          in: ['CUSTOMER', 'COMPANY_ADMIN', 'COMPANY_STAFF'],
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
      },
    });
  },

  async getUsersWithConsent(
    userIds: string[],
    consentFilters: {
      emailMarketingOptIn?: boolean;
      whatsappMarketingOptIn?: boolean;
      carrierMarketingOptIn?: boolean;
    }
  ) {
    // Include users who either match the required consent OR have no consent record
    // (no record = defaults apply, currently opt-in)
    const consentConditions: Prisma.UserWhereInput[] = [];

    // If any consent is required, build OR condition: match consent OR missing consent
    if (Object.keys(consentFilters).length > 0) {
      consentConditions.push({ marketingConsent: consentFilters });
      consentConditions.push({ marketingConsent: null });
    }

    const where: Prisma.UserWhereInput = {
      id: { in: userIds },
      ...(consentConditions.length > 0 && { OR: consentConditions }),
    };

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneNumber: true,
      },
    });
  },
};

