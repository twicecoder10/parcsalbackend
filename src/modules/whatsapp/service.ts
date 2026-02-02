import prisma from '../../config/database';
import { config } from '../../config/env';
import { WhatsAppMessageDirection, WhatsAppMessageStatus } from '@prisma/client';

interface SendTemplateMessageParams {
  toPhone: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: string;
    parameters?: Array<{
      type: string;
      text?: string;
      payload?: string;
    }>;
  }>;
  userId?: string;
  companyId?: string;
  payload?: any;
}

/**
 * Normalize phone number to E.164 format
 * Removes spaces, dashes, parentheses, and ensures country code
 */
export function normalizePhoneNumber(phone: string, defaultCountry: string = 'GB'): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If it doesn't start with +, add country code
  if (!normalized.startsWith('+')) {
    const countryCodes: Record<string, string> = {
      GB: '44',
      US: '1',
      CA: '1',
      AU: '61',
      // Add more as needed
    };
    const countryCode = countryCodes[defaultCountry] || '44';
    normalized = `+${countryCode}${normalized}`;
  }

  return normalized;
}

/**
 * Safe no-op if WhatsApp is disabled
 * Returns early if WhatsApp is not enabled
 */
export function safeNoOpIfDisabled(): boolean {
  return !config.whatsapp.enabled;
}

/**
 * Send WhatsApp template message via Meta API
 */
export async function sendTemplateMessage(params: SendTemplateMessageParams): Promise<string> {
  if (safeNoOpIfDisabled()) {
    throw new Error('WhatsApp is not enabled');
  }

  const {
    toPhone,
    templateName,
    languageCode = config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
    components = [],
    userId,
    companyId,
    payload,
  } = params;

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(toPhone, config.whatsapp.defaultCountry);

  // Create WhatsApp message record with QUEUED status
  const whatsappMessage = await prisma.whatsAppMessage.create({
    data: {
      direction: WhatsAppMessageDirection.OUTBOUND,
      status: WhatsAppMessageStatus.QUEUED,
      toPhone: normalizedPhone,
      templateName,
      messageType: 'TEMPLATE',
      payload: payload || null,
      userId: userId || null,
      companyId: companyId || null,
    },
  });

  try {
    // Prepare API payload
    const apiPayload: any = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
      },
    };

    // Add components if provided
    if (components.length > 0) {
      apiPayload.template.components = components;
    }

    // Call Meta WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.whatsapp.token}`,
        },
        body: JSON.stringify(apiPayload),
      }
    );

    const responseData = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: any;
    };

    if (!response.ok) {
      // Update message status to FAILED
      await prisma.whatsAppMessage.update({
        where: { id: whatsappMessage.id },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          error: JSON.stringify(responseData),
        },
      });

      throw new Error(`WhatsApp API error: ${JSON.stringify(responseData)}`);
    }

    // Extract message ID from response
    const providerMsgId = responseData.messages?.[0]?.id;

    // Update message status to SENT
    await prisma.whatsAppMessage.update({
      where: { id: whatsappMessage.id },
      data: {
        status: WhatsAppMessageStatus.SENT,
        providerMsgId: providerMsgId || null,
      },
    });

    return whatsappMessage.id;
  } catch (error: any) {
    // Update message status to FAILED
    await prisma.whatsAppMessage.update({
      where: { id: whatsappMessage.id },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        error: error.message || String(error),
      },
    });

    throw error;
  }
}

/**
 * Update WhatsApp message status from webhook
 */
export async function updateMessageStatus(
  providerMsgId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed'
): Promise<void> {
  const statusMap: Record<string, WhatsAppMessageStatus> = {
    sent: WhatsAppMessageStatus.SENT,
    delivered: WhatsAppMessageStatus.DELIVERED,
    read: WhatsAppMessageStatus.READ,
    failed: WhatsAppMessageStatus.FAILED,
  };

  const mappedStatus = statusMap[status];
  if (!mappedStatus) {
    console.warn(`Unknown WhatsApp status: ${status}`);
    return;
  }

  await prisma.whatsAppMessage.updateMany({
    where: { providerMsgId },
    data: {
      status: mappedStatus,
      updatedAt: new Date(),
    },
  });
}

export const whatsappService = {
  normalizePhoneNumber,
  safeNoOpIfDisabled,
  sendTemplateMessage,
  updateMessageStatus,
};
