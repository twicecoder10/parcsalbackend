import jwt from 'jsonwebtoken';
import { marketingRepository, CreateCampaignData } from './repository';
import { emailService } from '../../config/email';
import { createNotification } from '../../utils/notifications';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { config } from '../../config/env';
import { CampaignChannel, CampaignSenderType, AudienceType } from '@prisma/client';
import { 
  getMarketingEmailLimit,
  getWhatsappPromoLimit,
  getWhatsappStoryLimit,
  canRunEmailCampaigns
} from '../billing/planConfig';
import {
  ensureCurrentUsagePeriod,
  incrementMarketingEmailsSent,
  incrementWhatsappPromoSent,
  incrementWhatsappStoriesPosted,
  deductCredits,
  getCompanyUsage
} from '../billing/usage';
import prisma from '../../config/database';
import { sendTemplateMessage, safeNoOpIfDisabled } from '../whatsapp/service';

const MAX_RECIPIENTS_COMPANY = 1000;
const MAX_RECIPIENTS_ADMIN = 10000;
const BATCH_SIZE = 500;

interface ResolvedRecipient {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
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

    const isRetry = campaign.status === 'FAILED';
    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(campaign.status)) {
      throw new BadRequestError('Campaign has already been sent or is in progress');
    }

    // Resolve recipients (for retry: only those who didn't receive the message)
    let recipients: ResolvedRecipient[];
    if (isRetry) {
      const existingLogs = await marketingRepository.getMessageLogsByCampaign(campaignId);
      const sentRecipientIds = new Set(
        existingLogs.filter((l) => l.status === 'SENT').map((l) => l.recipientId)
      );
      const allRecipients = await this.resolveRecipients(campaign);
      recipients = allRecipients.filter((r) => !sentRecipientIds.has(r.id));
      if (recipients.length === 0) {
        const statusCounts = await marketingRepository.countMessageLogsByCampaignAndStatus(
          campaignId
        );
        await marketingRepository.updateCampaignStatus(campaignId, 'SENT', {
          sentAt: new Date(),
          deliveredCount: statusCounts.SENT || 0,
          failedCount:
            (statusCounts.FAILED || 0) +
            (statusCounts.SKIPPED_OPT_OUT || 0) +
            (statusCounts.SKIPPED_NO_PHONE || 0) +
            (statusCounts.SKIPPED_NOT_IMPLEMENTED || 0),
        });
        return { success: true, recipientCount: 0, retry: true };
      }
    } else {
      recipients = await this.resolveRecipients(campaign);
    }

    // Check recipient limits
    const maxRecipients =
      campaign.senderType === 'ADMIN' ? MAX_RECIPIENTS_ADMIN : MAX_RECIPIENTS_COMPANY;
    if (recipients.length > maxRecipients) {
      throw new BadRequestError(
        `Recipient count (${recipients.length}) exceeds maximum allowed (${maxRecipients})`
      );
    }

    // Enforce plan limits for company campaigns
    if (campaign.senderType === 'COMPANY' && campaign.senderCompanyId) {
      const company = await prisma.company.findUnique({
        where: { id: campaign.senderCompanyId },
        select: { plan: true, planActive: true },
      });

      if (!company) {
        throw new ForbiddenError('Company not found');
      }

      // FREE plan can have planActive=false, but paid plans must be active
      if (company.plan !== 'FREE' && !company.planActive) {
        throw new ForbiddenError('Company plan is not active. Please activate your subscription.');
      }
      
      // Check email limits for EMAIL campaigns
      if (campaign.channel === 'EMAIL') {
        // FREE plan cannot run email campaigns
        if (!canRunEmailCampaigns(company)) {
          throw new ForbiddenError(
            'Email campaigns are not included in the Free plan. Upgrade to Starter plan to access email marketing.'
          );
        }
        
        await ensureCurrentUsagePeriod(campaign.senderCompanyId);
        const usage = await getCompanyUsage(campaign.senderCompanyId);
        
        if (!usage) {
          throw new BadRequestError('Usage record not found');
        }

        const currentSent = usage.marketingEmailsSent;
        const limit = getMarketingEmailLimit(company);
        
        // Enforce the limit (limit can be Infinity for Enterprise)
        if (limit !== Infinity && (currentSent + recipients.length) > limit) {
          const includedRemaining = Math.max(0, limit - currentSent);
          const exceedingCount = recipients.length - includedRemaining;
          
          if (exceedingCount > 0) {
            if (usage.marketingEmailCreditsBalance < exceedingCount) {
              throw new ForbiddenError(
                `Insufficient marketing email credits. You have ${usage.marketingEmailCreditsBalance} credits, but need ${exceedingCount} for emails exceeding your included limit. Please top up credits.`
              );
            }
          }
        }
      }

      // Check promo credits and limits for WHATSAPP campaigns
      if (campaign.channel === 'WHATSAPP') {
        await ensureCurrentUsagePeriod(campaign.senderCompanyId);
        const usage = await getCompanyUsage(campaign.senderCompanyId);
        
        if (!usage) {
          throw new BadRequestError('Usage record not found');
        }

        // Determine if this is a story or promo message (for now, treat all as promo unless specified)
        // TODO: Add campaign metadata field to distinguish story vs promo
        const isStory = false; // Default to promo message
        
        if (isStory) {
          // WhatsApp story limit check
          const storyLimit = getWhatsappStoryLimit(company);
          const currentStories = usage.whatsappStoriesPosted;
          
          if (storyLimit !== Infinity && (currentStories + recipients.length) > storyLimit) {
            const includedRemaining = Math.max(0, storyLimit - currentStories);
            const exceedingCount = recipients.length - includedRemaining;
            
            if (exceedingCount > 0) {
              if (usage.whatsappStoryCreditsBalance < exceedingCount) {
                throw new ForbiddenError(
                  `Insufficient WhatsApp story credits. You have ${usage.whatsappStoryCreditsBalance} credits, but need ${exceedingCount} for stories exceeding your included limit. Please top up credits.`
                );
              }
            }
          }

          if (company.plan === 'FREE') {
            if (usage.whatsappStoryCreditsBalance < recipients.length) {
              throw new ForbiddenError(
                `Insufficient WhatsApp story credits. You have ${usage.whatsappStoryCreditsBalance} credits, but need ${recipients.length}. Please top up credits or upgrade to Starter plan.`
              );
            }
          }
        } else {
          // WhatsApp promo message limit check
          const promoLimit = getWhatsappPromoLimit(company);
          const currentPromos = usage.whatsappPromoSent;
          
          // Check if within included limit
          if (promoLimit !== Infinity && (currentPromos + recipients.length) > promoLimit) {
            // Calculate how many exceed the included limit
            const includedRemaining = Math.max(0, promoLimit - currentPromos);
            const exceedingCount = recipients.length - includedRemaining;
            
            if (exceedingCount > 0) {
              // Need to deduct credits for messages exceeding included limit
              if (usage.whatsappPromoCreditsBalance < exceedingCount) {
                throw new ForbiddenError(
                  `Insufficient WhatsApp promo credits. You have ${usage.whatsappPromoCreditsBalance} credits, but need ${exceedingCount} for messages exceeding your included limit. Please top up credits.`
                );
              }
            }
          }
          
          // FREE plan: must have credits for all messages
          if (company.plan === 'FREE') {
            if (usage.whatsappPromoCreditsBalance < recipients.length) {
              throw new ForbiddenError(
                `Insufficient WhatsApp promo credits. You have ${usage.whatsappPromoCreditsBalance} credits, but need ${recipients.length}. Please top up credits or upgrade to Starter plan.`
              );
            }
          }
        }
      }
    }

    console.log(
      `[Campaign] Sending campaign ${campaignId} | channel=${campaign.channel} | recipients=${recipients.length} | retry=${isRetry}`
    );

    // Update campaign status to SENDING
    await marketingRepository.updateCampaignStatus(campaignId, 'SENDING', {
      startedAt: new Date(),
      ...(isRetry ? {} : { totalRecipients: recipients.length }),
    });
    if (isRetry) {
      await prisma.marketingCampaign.update({
        where: { id: campaignId },
        data: { failureReason: null },
      });
    }

    // Create message logs only on first send, not on retry
    if (!isRetry) {
      await marketingRepository.bulkCreateMessageLogs(
        recipients.map((r) => ({
          campaignId: campaign.id,
          recipientId: r.id,
          channel: campaign.channel,
          status: 'QUEUED',
        }))
      );
    }

    // Process in batches to avoid timeouts
    try {
      await this.processCampaignBatch(campaign, recipients.slice(0, BATCH_SIZE));

      const statusCounts = await marketingRepository.countMessageLogsByCampaignAndStatus(
        campaignId
      );
      const deliveredCount = statusCounts.SENT || 0;
      const failedCount =
        (statusCounts.FAILED || 0) +
        (statusCounts.SKIPPED_OPT_OUT || 0) +
        (statusCounts.SKIPPED_NO_PHONE || 0) +
        (statusCounts.SKIPPED_NOT_IMPLEMENTED || 0);
      const totalRecipientsForCampaign = campaign.totalRecipients || recipients.length;

      // If no messages were delivered and we had recipients, mark as FAILED so user can retry
      if (deliveredCount === 0 && totalRecipientsForCampaign > 0) {
        const failureReason = 'No messages were delivered. You can retry sending.';
        console.error(
          `[Campaign] Marking campaign ${campaignId} as FAILED: ${failureReason} | ` +
            `statusCounts=${JSON.stringify(statusCounts)} | channel=${campaign.channel}`
        );
        await marketingRepository.updateCampaignStatus(campaignId, 'FAILED', {
          failureReason,
          deliveredCount: 0,
          failedCount,
        });
        return {
          success: false,
          recipientCount: recipients.length,
          retry: isRetry,
          message: failureReason,
        };
      }

      await marketingRepository.updateCampaignStatus(campaignId, 'SENT', {
        sentAt: new Date(),
        deliveredCount,
        failedCount,
      });

      return { success: true, recipientCount: recipients.length, retry: isRetry };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[Campaign] Campaign ${campaignId} failed with exception:`,
        error instanceof Error ? error.stack : failureReason
      );
      await marketingRepository.updateCampaignStatus(campaignId, 'FAILED', {
        failureReason,
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

    // For WhatsApp, only include users with a valid phone number
    if (campaign.channel === 'WHATSAPP') {
      return usersWithConsent.filter(
        (u) => u.phoneNumber != null && String(u.phoneNumber).trim().length > 0
      ) as ResolvedRecipient[];
    }

    return usersWithConsent as ResolvedRecipient[];
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
    let messageLogStatus: string = 'SENT';
    let messageLogSentAt: Date | undefined = undefined;

    try {
      if (campaign.channel === 'EMAIL') {
        await this.sendEmailMessage(campaign, recipient);
        
        // Track email usage for company campaigns
        if (campaign.senderType === 'COMPANY' && campaign.senderCompanyId) {
          const company = await prisma.company.findUnique({
            where: { id: campaign.senderCompanyId },
            select: { plan: true },
          });

          if (company) {
            const usage = await getCompanyUsage(campaign.senderCompanyId);
            const emailLimit = getMarketingEmailLimit(company);
            const shouldDeductCredits = emailLimit !== Infinity && usage && usage.marketingEmailsSent >= emailLimit;

            if (shouldDeductCredits) {
              const deducted = await deductCredits(
                campaign.senderCompanyId,
                'MARKETING_EMAIL',
                1,
                campaign.id,
                `Marketing email campaign: ${campaign.id}`
              );

              if (!deducted) {
                console.error(`Failed to deduct email credits for campaign ${campaign.id}, recipient ${recipient.id}`);
              }
            }
          }

          await incrementMarketingEmailsSent(campaign.senderCompanyId, 1).catch((err) => {
            console.error('Failed to increment email count:', err);
            // Don't fail the send if tracking fails
          });
        }
      } else if (campaign.channel === 'IN_APP') {
        await this.sendInAppMessage(campaign, recipient);
      } else if (campaign.channel === 'WHATSAPP') {
        const result = await this.sendWhatsAppCampaignMessage(campaign, recipient);
        messageLogStatus = result.sent ? 'SENT' : (result.skippedReason ?? 'FAILED');
        messageLogSentAt = result.sent ? new Date() : undefined;

        // Track WhatsApp usage for company campaigns (only when actually sent)
        if (campaign.senderType === 'COMPANY' && campaign.senderCompanyId) {
          // Determine if this is a story or promo message (for now, treat all as promo unless specified)
          // TODO: Add campaign metadata field to distinguish story vs promo
          const isStory = false; // Default to promo message

          if (isStory) {
            const company = await prisma.company.findUnique({
              where: { id: campaign.senderCompanyId },
              select: { plan: true },
            });

            if (company) {
              const usage = await getCompanyUsage(campaign.senderCompanyId);
              const storyLimit = getWhatsappStoryLimit(company);
              const shouldDeductCredits = company.plan === 'FREE' || 
                (storyLimit !== Infinity && usage && usage.whatsappStoriesPosted >= storyLimit);

              if (shouldDeductCredits) {
                const deducted = await deductCredits(
                  campaign.senderCompanyId,
                  'WHATSAPP_STORY',
                  1,
                  campaign.id,
                  `WhatsApp story campaign: ${campaign.id}`
                );

                if (!deducted) {
                  console.error(`Failed to deduct story credits for campaign ${campaign.id}, recipient ${recipient.id}`);
                }
              }
            }

            // Track story posts
            await incrementWhatsappStoriesPosted(campaign.senderCompanyId, 1).catch((err) => {
              console.error('Failed to increment WhatsApp story count:', err);
            });
          } else {
            // Get company to check limits before incrementing
            const company = await prisma.company.findUnique({
              where: { id: campaign.senderCompanyId },
              select: { plan: true },
            });
            
            if (company && result.sent) {
              const usage = await getCompanyUsage(campaign.senderCompanyId);
              const promoLimit = getWhatsappPromoLimit(company);

              // Check if we need to deduct credits (before incrementing)
              // FREE plan: always deduct credits
              // Other plans: only deduct if exceeding included limit
              const shouldDeductCredits =
                company.plan === 'FREE' ||
                (promoLimit !== Infinity && usage && usage.whatsappPromoSent >= promoLimit);

              if (shouldDeductCredits) {
                const deducted = await deductCredits(
                  campaign.senderCompanyId,
                  'WHATSAPP_PROMO',
                  1,
                  campaign.id,
                  `WhatsApp promo campaign: ${campaign.id}`
                );

                if (!deducted) {
                  console.error(
                    `Failed to deduct credits for campaign ${campaign.id}, recipient ${recipient.id}`
                  );
                }
              }

              // Track promo messages (only when sent)
              await incrementWhatsappPromoSent(campaign.senderCompanyId, 1).catch((err) => {
                console.error('Failed to increment WhatsApp promo count:', err);
              });
            }
          }
        }
      }

      // Update log status
      const logs = await marketingRepository.getMessageLogsByCampaign(campaign.id);
      const log = logs.find((l) => l.recipientId === recipient.id);
      if (log) {
        await marketingRepository.updateMessageLog(log.id, {
          status: messageLogStatus,
          sentAt: messageLogSentAt ?? (messageLogStatus === 'SENT' ? new Date() : undefined),
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
      type: 'MARKETING_MESSAGE',
      title: campaign.title || 'Message from Parcsal',
      body: `${senderLabel}\n\n${campaign.inAppBody || ''}`,
      metadata: {
        campaignId: campaign.id,
        senderType: campaign.senderType,
      },
    });
  },

  /**
   * Send WhatsApp campaign message via Meta template API
   */
  async sendWhatsAppCampaignMessage(
    campaign: any,
    recipient: ResolvedRecipient
  ): Promise<{ sent: boolean; skippedReason?: string }> {
    if (!recipient.phoneNumber || !recipient.phoneNumber.trim()) {
      return { sent: false, skippedReason: 'SKIPPED_NO_PHONE' };
    }

    if (safeNoOpIfDisabled()) {
      return { sent: false, skippedReason: 'SKIPPED_NOT_IMPLEMENTED' };
    }

    const templateName = campaign.whatsappTemplateKey?.trim();
    if (!templateName) {
      return { sent: false, skippedReason: 'SKIPPED_NOT_IMPLEMENTED' };
    }

    // Meta template body parameter: no newlines/tabs, max 4 consecutive spaces (API 132018)
    const BODY_PARAM_MAX_LENGTH = 1024;
    let bodyText = (campaign.contentText || '').trim().slice(0, BODY_PARAM_MAX_LENGTH);
    bodyText = bodyText
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{5,}/g, '    '); // collapse 5+ spaces to 4 (Meta limit)

    try {
      await sendTemplateMessage({
        toPhone: recipient.phoneNumber,
        templateName,
        languageCode: 'en',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: bodyText }],
          },
        ],
        userId: recipient.id,
        companyId: campaign.senderCompanyId || undefined,
        payload: { campaignId: campaign.id, type: 'marketing_campaign' },
      });
      return { sent: true };
    } catch (err: any) {
      if (err?.message === 'WhatsApp is not enabled') {
        return { sent: false, skippedReason: 'SKIPPED_NOT_IMPLEMENTED' };
      }
      console.error(
        `[Campaign] WhatsApp send failed for campaign ${campaign.id} to ${recipient.phoneNumber}:`,
        err?.message || err
      );
      throw err;
    }
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
    } else if (channel === 'WHATSAPP') {
      if (!data.whatsappTemplateKey || !data.whatsappTemplateKey.trim()) {
        throw new BadRequestError(
          'whatsappTemplateKey is required for WHATSAPP campaigns (use an approved Meta template name)'
        );
      }
      if (!data.contentText || !data.contentText.trim()) {
        throw new BadRequestError(
          'contentText is required for WHATSAPP campaigns (used as the template body message)'
        );
      }
    }
  },
};

