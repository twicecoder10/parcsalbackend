import jwt from 'jsonwebtoken';
import { marketingRepository, CreateCampaignData } from './repository';
import { emailService } from '../../config/email';
import { createNotification } from '../../utils/notifications';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { config } from '../../config/env';
import { CampaignChannel, CampaignSenderType, AudienceType } from '@prisma/client';

const MAX_RECIPIENTS_COMPANY = 1000;
const MAX_RECIPIENTS_ADMIN = 10000;
const BATCH_SIZE = 500;

interface ResolvedRecipient {
  id: string;
  email: string;
  fullName: string;
}

export const marketingService = {
  /**
   * Create a new marketing campaign
   */
  async createCampaign(
    userId: string,
    userRole: string,
    companyId: string | null | undefined,
    data: Omit<CreateCampaignData, 'senderType' | 'senderCompanyId' | 'createdByUserId'>
  ) {
    // Determine sender type
    const senderType: CampaignSenderType =
      userRole === 'SUPER_ADMIN' ? 'ADMIN' : 'COMPANY';

    // Validate audience type permissions
    if (senderType === 'COMPANY') {
      if (data.audienceType !== 'COMPANY_PAST_CUSTOMERS') {
        throw new ForbiddenError(
          'Companies can only target COMPANY_PAST_CUSTOMERS audience'
        );
      }
      if (!companyId) {
        throw new BadRequestError('Company ID is required for company campaigns');
      }
    }

    // Validate channel-specific fields
    this.validateCampaignContent(data.channel, data);

    const campaign = await marketingRepository.createCampaign({
      ...data,
      senderType,
      senderCompanyId: senderType === 'COMPANY' ? companyId || undefined : undefined,
      createdByUserId: userId,
    });

    return campaign;
  },

  /**
   * Get campaign by ID (with permission check)
   */
  async getCampaign(
    campaignId: string,
    _userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    const campaign = await marketingRepository.getCampaignById(campaignId);

    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    // Permission check
    if (userRole === 'SUPER_ADMIN') {
      // Admin can see all
      return campaign;
    } else if (campaign.senderType === 'COMPANY' && campaign.senderCompanyId === companyId) {
      // Company can see their own
      return campaign;
    } else {
      throw new ForbiddenError('You do not have permission to view this campaign');
    }
  },

  /**
   * Update a campaign (only DRAFT campaigns can be updated)
   */
  async updateCampaign(
    campaignId: string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined,
    data: Partial<Omit<CreateCampaignData, 'senderType' | 'senderCompanyId' | 'createdByUserId'>>
  ) {
    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    // Only DRAFT campaigns can be updated
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestError('Only DRAFT campaigns can be updated');
    }

    // If audience type is being changed, validate permissions
    if (data.audienceType) {
      const senderType: CampaignSenderType =
        userRole === 'SUPER_ADMIN' ? 'ADMIN' : 'COMPANY';

      if (senderType === 'COMPANY') {
        if (data.audienceType !== 'COMPANY_PAST_CUSTOMERS') {
          throw new ForbiddenError(
            'Companies can only target COMPANY_PAST_CUSTOMERS audience'
          );
        }
      }
    }

    // Clean up data: convert null to undefined, remove undefined values
    const cleanData: any = {};
    Object.keys(data).forEach((key) => {
      const value = (data as any)[key];
      if (value !== null && value !== undefined) {
        cleanData[key] = value;
      }
    });

    // If channel is being updated, validate content
    if (cleanData.channel) {
      // Merge existing campaign data with updates for validation
      const mergedData = {
        ...campaign,
        ...cleanData,
      };
      this.validateCampaignContent(cleanData.channel, mergedData);
    } else if (cleanData.subject || cleanData.contentHtml || cleanData.contentText || cleanData.title || cleanData.inAppBody) {
      // If content is being updated but channel isn't, validate against existing channel
      const mergedData = {
        ...campaign,
        ...cleanData,
      };
      this.validateCampaignContent(campaign.channel, mergedData);
    }

    // Update the campaign
    const updatedCampaign = await marketingRepository.updateCampaign(campaignId, cleanData);

    return updatedCampaign;
  },

  /**
   * List campaigns (scoped by user permissions)
   */
  async listCampaigns(
    userRole: string,
    companyId: string | null | undefined,
    options: {
      page: number;
      limit: number;
      status?: any;
      channel?: any;
    }
  ) {
    if (userRole === 'SUPER_ADMIN') {
      // Admin sees all campaigns
      return marketingRepository.listCampaigns({
        ...options,
        senderType: 'ADMIN',
      });
    } else {
      // Company sees only their own
      if (!companyId) {
        throw new BadRequestError('Company ID is required');
      }
      return marketingRepository.listCampaigns({
        ...options,
        senderType: 'COMPANY',
        senderCompanyId: companyId,
      });
    }
  },

  /**
   * Preview recipient counts for a campaign
   */
  async previewRecipients(
    campaignId: string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    const recipients = await this.resolveRecipients(campaign);

    // Never return actual recipient data to companies - only counts
    if (userRole !== 'SUPER_ADMIN') {
      return {
        totalCount: recipients.length,
        campaignId: campaign.id,
        audienceType: campaign.audienceType,
        channel: campaign.channel,
      };
    }

    // Admin can see more detail (but still not full PII)
    return {
      totalCount: recipients.length,
      campaignId: campaign.id,
      audienceType: campaign.audienceType,
      channel: campaign.channel,
      sample: recipients.slice(0, 10).map((r) => ({
        email: r.email.replace(/(?<=.{2}).(?=[^@]*?@)/g, '*'), // Partially mask email
        fullName: r.fullName,
      })),
    };
  },

  /**
   * Schedule a campaign for later sending
   */
  async scheduleCampaign(
    campaignId: string,
    scheduledAt: Date | string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    // Ensure scheduledAt is a Date object
    const scheduledDate = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestError(`Invalid scheduledAt date: ${scheduledAt}`);
    }

    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    if (campaign.status !== 'DRAFT') {
      throw new BadRequestError('Only DRAFT campaigns can be scheduled');
    }

    if (scheduledDate <= new Date()) {
      throw new BadRequestError('Scheduled time must be in the future');
    }

    const updated = await marketingRepository.updateCampaignStatus(campaignId, 'SCHEDULED', {
      startedAt: undefined,
      sentAt: undefined,
      failureReason: undefined,
    });

    await marketingRepository.updateCampaign(campaignId, { scheduledAt: scheduledDate });

    // Add to Redis queue for scheduled execution
    try {
      const { scheduleCampaignInQueue } = await import('./scheduler');
      await scheduleCampaignInQueue(campaignId, scheduledDate);
    } catch (error) {
      console.error(`Failed to schedule campaign ${campaignId} in Redis queue:`, error);
      // Don't fail the request if Redis fails - the campaign is still scheduled in DB
      // A periodic sync job can pick it up
    }

    return updated;
  },

  /**
   * Cancel a campaign
   */
  async cancelCampaign(
    campaignId: string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      throw new BadRequestError('Only DRAFT or SCHEDULED campaigns can be cancelled');
    }

    // Remove from Redis queue if scheduled
    if (campaign.status === 'SCHEDULED') {
      try {
        const { removeCampaignFromQueue } = await import('./scheduler');
        await removeCampaignFromQueue(campaignId);
      } catch (error) {
        console.error(`Failed to remove campaign ${campaignId} from Redis queue:`, error);
        // Continue with cancellation even if Redis removal fails
      }
    }

    return marketingRepository.updateCampaignStatus(campaignId, 'CANCELLED');
  },

  /**
   * Delete a campaign (only DRAFT or SCHEDULED campaigns can be deleted)
   */
  async deleteCampaign(
    campaignId: string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    // Only allow deletion of campaigns that haven't been sent
    if (!['DRAFT', 'SCHEDULED', 'CANCELLED'].includes(campaign.status)) {
      throw new BadRequestError(
        'Only DRAFT, SCHEDULED, or CANCELLED campaigns can be deleted. Sent campaigns cannot be deleted for audit purposes.'
      );
    }

    // Delete the campaign (this will cascade delete message logs due to onDelete: Cascade)
    return marketingRepository.deleteCampaign(campaignId);
  },

  /**
   * Send a campaign immediately
   */
  async sendCampaignNow(
    campaignId: string,
    userId: string,
    userRole: string,
    companyId: string | null | undefined
  ) {
    const campaign = await this.getCampaign(campaignId, userId, userRole, companyId);

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      throw new BadRequestError('Campaign has already been sent or is in progress');
    }

    // Resolve recipients
    const recipients = await this.resolveRecipients(campaign);

    // Check recipient limits
    const maxRecipients =
      campaign.senderType === 'ADMIN' ? MAX_RECIPIENTS_ADMIN : MAX_RECIPIENTS_COMPANY;
    if (recipients.length > maxRecipients) {
      throw new BadRequestError(
        `Recipient count (${recipients.length}) exceeds maximum allowed (${maxRecipients})`
      );
    }

    // Update campaign status to SENDING
    await marketingRepository.updateCampaignStatus(campaignId, 'SENDING', {
      startedAt: new Date(),
      totalRecipients: recipients.length,
    });

    // Create message logs
    await marketingRepository.bulkCreateMessageLogs(
      recipients.map((r) => ({
        campaignId: campaign.id,
        recipientId: r.id,
        channel: campaign.channel,
        status: 'QUEUED',
      }))
    );

    // Process in batches to avoid timeouts
    try {
      await this.processCampaignBatch(campaign, recipients.slice(0, BATCH_SIZE));

      // Mark as SENT
      const statusCounts = await marketingRepository.countMessageLogsByCampaignAndStatus(
        campaignId
      );
      await marketingRepository.updateCampaignStatus(campaignId, 'SENT', {
        sentAt: new Date(),
        deliveredCount: statusCounts.SENT || 0,
        failedCount:
          (statusCounts.FAILED || 0) +
          (statusCounts.SKIPPED_OPT_OUT || 0) +
          (statusCounts.SKIPPED_NOT_IMPLEMENTED || 0),
      });

      return { success: true, recipientCount: recipients.length };
    } catch (error) {
      await marketingRepository.updateCampaignStatus(campaignId, 'FAILED', {
        failureReason: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  },

  /**
   * Resolve recipients for a campaign based on audience type and consent
   */
  async resolveRecipients(campaign: any): Promise<ResolvedRecipient[]> {
    let allUsers: any[] = [];

    // Step 1: Get base audience
    switch (campaign.audienceType as AudienceType) {
      case 'COMPANY_PAST_CUSTOMERS':
        if (!campaign.senderCompanyId) {
          throw new BadRequestError('Company ID required for COMPANY_PAST_CUSTOMERS');
        }
        allUsers = await marketingRepository.getCompanyPastCustomers(campaign.senderCompanyId);
        break;

      case 'PLATFORM_CUSTOMERS_ONLY':
        allUsers = await marketingRepository.getPlatformCustomers();
        break;

      case 'PLATFORM_COMPANIES_ONLY':
        allUsers = await marketingRepository.getPlatformCompanies();
        break;

      case 'PLATFORM_ALL_USERS':
        allUsers = await marketingRepository.getPlatformAllUsers();
        break;

      default:
        throw new BadRequestError('Invalid audience type');
    }

    // Step 2: Filter by consent based on channel and sender type
    const consentFilter = this.getConsentFilter(
      campaign.channel,
      campaign.senderType,
      campaign.audienceType
    );

    const userIds = allUsers.map((u) => u.id);

    if (Object.keys(consentFilter).length === 0) {
      // No consent required (e.g., IN_APP for platform-wide)
      return allUsers;
    }

    // Get users with required consent
    const usersWithConsent = await marketingRepository.getUsersWithConsent(
      userIds,
      consentFilter
    );

    return usersWithConsent;
  },

  /**
   * Determine consent filter requirements
   */
  getConsentFilter(
    channel: CampaignChannel,
    _senderType: CampaignSenderType,
    audienceType: AudienceType
  ) {
    const filter: any = {};

    if (channel === 'EMAIL') {
      if (audienceType === 'COMPANY_PAST_CUSTOMERS') {
        // Companies: require both emailMarketingOptIn AND carrierMarketingOptIn
        filter.emailMarketingOptIn = true;
        filter.carrierMarketingOptIn = true;
      } else {
        // Platform (Admin): require emailMarketingOptIn
        filter.emailMarketingOptIn = true;
      }
    } else if (channel === 'IN_APP') {
      if (audienceType === 'COMPANY_PAST_CUSTOMERS') {
        // Companies: require carrierMarketingOptIn for in-app
        filter.carrierMarketingOptIn = true;
      }
      // Platform in-app: no consent filter (allow by default)
    } else if (channel === 'WHATSAPP') {
      // WhatsApp requires opt-in always
      filter.whatsappMarketingOptIn = true;
      if (audienceType === 'COMPANY_PAST_CUSTOMERS') {
        filter.carrierMarketingOptIn = true;
      }
    }

    return filter;
  },

  /**
   * Process a batch of recipients
   */
  async processCampaignBatch(campaign: any, recipients: ResolvedRecipient[]) {
    const promises = recipients.map((recipient) =>
      this.sendToRecipient(campaign, recipient)
    );
    await Promise.allSettled(promises);
  },

  /**
   * Send campaign message to a single recipient
   */
  async sendToRecipient(campaign: any, recipient: ResolvedRecipient) {
    try {
      if (campaign.channel === 'EMAIL') {
        await this.sendEmailMessage(campaign, recipient);
      } else if (campaign.channel === 'IN_APP') {
        await this.sendInAppMessage(campaign, recipient);
      } else if (campaign.channel === 'WHATSAPP') {
        await this.logWhatsAppMessage(campaign, recipient);
      }

      // Update log status
      const logs = await marketingRepository.getMessageLogsByCampaign(campaign.id);
      const log = logs.find((l) => l.recipientId === recipient.id);
      if (log) {
        await marketingRepository.updateMessageLog(log.id, {
          status: campaign.channel === 'WHATSAPP' ? 'SKIPPED_NOT_IMPLEMENTED' : 'SENT',
          sentAt: new Date(),
        });
      }
    } catch (error) {
      const logs = await marketingRepository.getMessageLogsByCampaign(campaign.id);
      const log = logs.find((l) => l.recipientId === recipient.id);
      if (log) {
        await marketingRepository.updateMessageLog(log.id, {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  },

  /**
   * Send email message
   */
  async sendEmailMessage(campaign: any, recipient: ResolvedRecipient) {
    const scope =
      campaign.senderType === 'ADMIN' ? 'ADMIN_MARKETING' : 'CARRIER_MARKETING';
    const unsubscribeToken = this.generateUnsubscribeToken(recipient.id, scope);
    const unsubscribeUrl = `${config.frontendUrl}/marketing/unsubscribe?token=${unsubscribeToken}`;

    const footer = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 12px; color: #666;">
        <p style="margin: 0 0 8px 0;">Sent via <strong>Parcsal</strong></p>
        <p style="margin: 0;">
          <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe from marketing emails</a>
        </p>
      </div>
    `;

    const htmlWithFooter = campaign.contentHtml
      ? campaign.contentHtml + footer
      : undefined;

    await emailService.sendEmail(
      recipient.email,
      campaign.subject || 'Message from Parcsal',
      htmlWithFooter || campaign.contentText || '',
      campaign.contentText
    );
  },

  /**
   * Send in-app notification
   */
  async sendInAppMessage(campaign: any, recipient: ResolvedRecipient) {
    const senderLabel =
      campaign.senderType === 'ADMIN'
        ? 'Announcement from Parcsal'
        : `Promotion via Parcsal`;

    await createNotification({
      userId: recipient.id,
      type: 'MARKETING_MESSAGE' as any,
      title: campaign.title || 'Message from Parcsal',
      body: `${senderLabel}\n\n${campaign.inAppBody || ''}`,
      metadata: {
        campaignId: campaign.id,
        senderType: campaign.senderType,
      },
    });
  },

  /**
   * Log WhatsApp message (not sending yet)
   */
  async logWhatsAppMessage(_campaign: any, _recipient: ResolvedRecipient) {
    // Placeholder: WhatsApp integration not implemented
    // Just log as SKIPPED_NOT_IMPLEMENTED
    return;
  },

  /**
   * Generate unsubscribe token
   */
  generateUnsubscribeToken(userId: string, scope: string): string {
    return jwt.sign({ userId, scope }, config.jwt.secret, { expiresIn: '30d' });
  },

  /**
   * Process unsubscribe
   */
  async processUnsubscribe(token: string) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as {
        userId: string;
        scope: string;
      };

      const updates: any = {
        emailMarketingOptIn: false,
      };

      if (decoded.scope === 'CARRIER_MARKETING') {
        updates.carrierMarketingOptIn = false;
      }

      await marketingRepository.updateConsent(decoded.userId, updates);

      return { success: true, message: 'You have been unsubscribed from marketing emails.' };
    } catch (error) {
      throw new BadRequestError('Invalid or expired unsubscribe token');
    }
  },

  /**
   * Get user's marketing consent
   */
  async getConsent(userId: string) {
    return marketingRepository.getOrCreateConsent(userId);
  },

  /**
   * Update user's marketing consent
   */
  async updateConsent(
    userId: string,
    data: {
      emailMarketingOptIn?: boolean;
      whatsappMarketingOptIn?: boolean;
      carrierMarketingOptIn?: boolean;
    }
  ) {
    return marketingRepository.updateConsent(userId, data);
  },

  /**
   * Validate campaign content based on channel
   */
  validateCampaignContent(channel: CampaignChannel, data: any) {
    if (channel === 'EMAIL') {
      if (!data.subject) {
        throw new BadRequestError('Subject is required for EMAIL campaigns');
      }
      if (!data.contentHtml && !data.contentText) {
        throw new BadRequestError(
          'Either contentHtml or contentText is required for EMAIL campaigns'
        );
      }
    } else if (channel === 'IN_APP') {
      if (!data.title || !data.inAppBody) {
        throw new BadRequestError('Title and inAppBody are required for IN_APP campaigns');
      }
    }
  },
};

