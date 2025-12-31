import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { marketingService } from './service';
import { CreateCampaignInput, ListCampaignsInput, UpdateCampaignInput, UpdateMarketingConsentInput } from './dto';
import prisma from '../../config/database';

export const marketingController = {
  /**
   * Create a new campaign
   * POST /admin/marketing/campaigns OR /companies/marketing/campaigns
   */
  async createCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;

      const data = req.body as CreateCampaignInput;

      const campaign = await marketingService.createCampaign(userId, userRole, companyId, data);

      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List campaigns
   * GET /admin/marketing/campaigns OR /companies/marketing/campaigns
   */
  async listCampaigns(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;

      const options = req.query as unknown as ListCampaignsInput;

      const result = await marketingService.listCampaigns(userRole, companyId, {
        page: options.page ? Number(options.page) : 1,
        limit: options.limit ? Number(options.limit) : 20,
        status: options.status,
        channel: options.channel,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get campaign by ID
   * GET /admin/marketing/campaigns/:id OR /companies/marketing/campaigns/:id
   */
  async getCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;

      const campaign = await marketingService.getCampaign(
        campaignId,
        userId,
        userRole,
        companyId
      );

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a campaign (only DRAFT campaigns)
   * PUT /admin/marketing/campaigns/:id OR /companies/marketing/campaigns/:id
   */
  async updateCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;
      const data = req.body as UpdateCampaignInput;

      // Convert null to undefined for scheduledAt (to clear scheduled time)
      const updateData: any = { ...data };
      if (updateData.scheduledAt === null) {
        updateData.scheduledAt = undefined;
      }

      const campaign = await marketingService.updateCampaign(
        campaignId,
        userId,
        userRole,
        companyId,
        updateData
      );

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Preview recipients for a campaign
   * GET /admin/marketing/campaigns/:id/preview OR /companies/marketing/campaigns/:id/preview
   */
  async previewRecipients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;

      const preview = await marketingService.previewRecipients(
        campaignId,
        userId,
        userRole,
        companyId
      );

      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send campaign immediately
   * POST /admin/marketing/campaigns/:id/send OR /companies/marketing/campaigns/:id/send
   */
  async sendCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;

      const result = await marketingService.sendCampaignNow(
        campaignId,
        userId,
        userRole,
        companyId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Schedule a campaign
   * POST /admin/marketing/campaigns/:id/schedule OR /companies/marketing/campaigns/:id/schedule
   */
  async scheduleCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;
      const { scheduledAt } = req.body;

      const campaign = await marketingService.scheduleCampaign(
        campaignId,
        scheduledAt,
        userId,
        userRole,
        companyId
      );

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cancel a campaign
   * POST /admin/marketing/campaigns/:id/cancel OR /companies/marketing/campaigns/:id/cancel
   */
  async cancelCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;

      const campaign = await marketingService.cancelCampaign(
        campaignId,
        userId,
        userRole,
        companyId
      );

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a campaign
   * DELETE /admin/marketing/campaigns/:id OR /companies/marketing/campaigns/:id
   */
  async deleteCampaign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const companyId = req.user!.companyId;
      const campaignId = req.params.id;

      await marketingService.deleteCampaign(campaignId, userId, userRole, companyId);

      res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get marketing consent and notification preferences for logged-in user
   * GET /me/marketing-consent
   */
  async getConsent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      // Get marketing consent
      const consent = await marketingService.getConsent(userId);

      // Get user's notification preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationEmail: true,
          notificationSMS: true,
        },
      });

      res.json({
        success: true,
        data: {
          // Transactional notifications
          email: user?.notificationEmail ?? true,
          sms: user?.notificationSMS ?? false,
          // Marketing consent
          marketing: {
            emailMarketingOptIn: consent.emailMarketingOptIn,
            whatsappMarketingOptIn: consent.whatsappMarketingOptIn,
            carrierMarketingOptIn: consent.carrierMarketingOptIn,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update marketing consent and notification preferences for logged-in user
   * PUT /me/marketing-consent
   */
  async updateConsent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const data = req.body as UpdateMarketingConsentInput & {
        marketing?: {
          emailMarketingOptIn?: boolean;
          whatsappMarketingOptIn?: boolean;
          carrierMarketingOptIn?: boolean;
        };
      };

      // Update transactional notification preferences
      if (data.email !== undefined || data.sms !== undefined) {
        const updateData: any = {};
        if (data.email !== undefined) updateData.notificationEmail = data.email;
        if (data.sms !== undefined) updateData.notificationSMS = data.sms;

        await prisma.user.update({
          where: { id: userId },
          data: updateData,
        });
      }

      // Update marketing consent preferences
      // Support both nested (marketing.*) and flat structure
      const marketingConsentUpdate: {
        emailMarketingOptIn?: boolean;
        whatsappMarketingOptIn?: boolean;
        carrierMarketingOptIn?: boolean;
      } = {};
      
      // Check nested structure first, then flat structure
      if (data.marketing?.emailMarketingOptIn !== undefined) {
        marketingConsentUpdate.emailMarketingOptIn = data.marketing.emailMarketingOptIn;
      } else if (data.emailMarketingOptIn !== undefined) {
        marketingConsentUpdate.emailMarketingOptIn = data.emailMarketingOptIn;
      }
      
      if (data.marketing?.whatsappMarketingOptIn !== undefined) {
        marketingConsentUpdate.whatsappMarketingOptIn = data.marketing.whatsappMarketingOptIn;
      } else if (data.whatsappMarketingOptIn !== undefined) {
        marketingConsentUpdate.whatsappMarketingOptIn = data.whatsappMarketingOptIn;
      }
      
      if (data.marketing?.carrierMarketingOptIn !== undefined) {
        marketingConsentUpdate.carrierMarketingOptIn = data.marketing.carrierMarketingOptIn;
      } else if (data.carrierMarketingOptIn !== undefined) {
        marketingConsentUpdate.carrierMarketingOptIn = data.carrierMarketingOptIn;
      }

      let consent;
      if (Object.keys(marketingConsentUpdate).length > 0) {
        consent = await marketingService.updateConsent(userId, marketingConsentUpdate);
      } else {
        consent = await marketingService.getConsent(userId);
      }

      // Get updated user preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          notificationEmail: true,
          notificationSMS: true,
        },
      });

      res.json({
        success: true,
        data: {
          // Transactional notifications
          email: user?.notificationEmail ?? true,
          sms: user?.notificationSMS ?? false,
          // Marketing consent
          marketing: {
            emailMarketingOptIn: consent.emailMarketingOptIn,
            whatsappMarketingOptIn: consent.whatsappMarketingOptIn,
            carrierMarketingOptIn: consent.carrierMarketingOptIn,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Unsubscribe from marketing emails via token
   * GET /marketing/unsubscribe?token=...
   */
  async unsubscribe(req: AuthRequest, res: Response, _next: NextFunction) {
    try {
      const token = req.query.token as string;

      if (!token) {
        res.status(400).send('<h1>Invalid unsubscribe link</h1>');
        return;
      }

      const result = await marketingService.processUnsubscribe(token);

      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribed - Parcsal</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              max-width: 500px;
              text-align: center;
            }
            h1 {
              color: #4CAF50;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✓</div>
            <h1>You've Been Unsubscribed</h1>
            <p>${result.message}</p>
            <p style="margin-top: 30px; font-size: 14px; color: #999;">
              You can update your marketing preferences anytime from your account settings.
            </p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - Parcsal</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background-color: #f5f5f5;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              max-width: 500px;
              text-align: center;
            }
            h1 {
              color: #F44336;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">⚠</div>
            <h1>Invalid Link</h1>
            <p>This unsubscribe link is invalid or has expired.</p>
            <p style="margin-top: 30px; font-size: 14px; color: #999;">
              Please contact support if you need assistance.
            </p>
          </div>
        </body>
        </html>
      `);
    }
  },
};

