import { z } from 'zod';

// Enums from Prisma
export const CampaignChannelSchema = z.enum(['EMAIL', 'IN_APP', 'WHATSAPP']);
export const AudienceTypeSchema = z.enum([
  'COMPANY_PAST_CUSTOMERS',
  'PLATFORM_CUSTOMERS_ONLY',
  'PLATFORM_COMPANIES_ONLY',
  'PLATFORM_ALL_USERS',
]);
export const CampaignStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
]);

// Create Campaign Schema
export const createCampaignSchema = z.object({
  body: z
    .object({
      audienceType: AudienceTypeSchema,
      channel: CampaignChannelSchema,
      subject: z.string().min(1).max(500).optional(),
      title: z.string().min(1).max(200).optional(),
      contentHtml: z.string().optional(),
      contentText: z.string().optional(),
      inAppBody: z.string().max(1000).optional(),
      whatsappTemplateKey: z.string().optional(),
      scheduledAt: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional(),
    })
    .refine(
      (data) => {
        if (data.channel === 'EMAIL') {
          return data.subject && (data.contentHtml || data.contentText);
        }
        if (data.channel === 'IN_APP') {
          return data.title && data.inAppBody;
        }
        return true;
      },
      {
        message: 'Required fields missing for selected channel',
      }
    ),
});

// List Campaigns Schema
export const listCampaignsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(20).optional(),
    status: CampaignStatusSchema.optional(),
    channel: CampaignChannelSchema.optional(),
  }),
});

// Get Campaign Schema
export const getCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Update Campaign Schema
export const updateCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z
    .object({
      audienceType: AudienceTypeSchema.optional(),
      channel: CampaignChannelSchema.optional(),
      subject: z.string().min(1).max(500).optional().nullable(),
      title: z.string().min(1).max(200).optional().nullable(),
      contentHtml: z.string().optional().nullable(),
      contentText: z.string().optional().nullable(),
      inAppBody: z.string().max(1000).optional().nullable(),
      whatsappTemplateKey: z.string().optional().nullable(),
      scheduledAt: z
        .string()
        .datetime()
        .transform((val) => new Date(val))
        .optional()
        .nullable(),
    }),
});

// Schedule Campaign Schema
export const scheduleCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    scheduledAt: z
      .string()
      .datetime()
      .transform((val) => new Date(val)),
  }),
});

// Send Campaign Schema
export const sendCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Cancel Campaign Schema
export const cancelCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Preview Recipients Schema
export const previewRecipientsSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

// Update Marketing Consent Schema
export const updateMarketingConsentSchema = z.object({
  body: z.object({
    // Transactional notification preferences
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    // Marketing consent preferences (nested structure)
    marketing: z.object({
      emailMarketingOptIn: z.boolean().optional(),
      whatsappMarketingOptIn: z.boolean().optional(),
      carrierMarketingOptIn: z.boolean().optional(),
    }).optional(),
    // Support flat structure for backward compatibility
    emailMarketingOptIn: z.boolean().optional(),
    whatsappMarketingOptIn: z.boolean().optional(),
    carrierMarketingOptIn: z.boolean().optional(),
  }),
});

// Unsubscribe Token Schema
export const unsubscribeSchema = z.object({
  query: z.object({
    token: z.string().min(1),
  }),
});

// Types
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>['body'];
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>['body'];
export type ListCampaignsInput = z.infer<typeof listCampaignsSchema>['query'];
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>['body'];
export type UpdateMarketingConsentInput = z.infer<typeof updateMarketingConsentSchema>['body'];

