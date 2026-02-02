import prisma from '../../config/database';
import { sendTemplateMessage, safeNoOpIfDisabled } from './service';
import { config } from '../../config/env';

/**
 * Check if user has WhatsApp opt-in for system notifications
 */
async function canSendWhatsAppToUser(userId: string): Promise<{ canSend: boolean; phoneNumber?: string }> {
  if (safeNoOpIfDisabled()) {
    return { canSend: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phoneNumber: true,
      notificationWhatsapp: true,
    },
  });

  if (!user || !user.phoneNumber || !user.notificationWhatsapp) {
    return { canSend: false };
  }

  return { canSend: true, phoneNumber: user.phoneNumber };
}

/**
 * Check if company admin has WhatsApp opt-in for system notifications
 */
async function canSendWhatsAppToCompany(companyId: string): Promise<{ canSend: boolean; phoneNumber?: string }> {
  if (safeNoOpIfDisabled()) {
    return { canSend: false };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      adminId: true,
    },
  });

  if (!company || !company.adminId) {
    return { canSend: false };
  }

  const admin = await prisma.user.findUnique({
    where: { id: company.adminId },
    select: {
      phoneNumber: true,
      notificationWhatsapp: true,
    },
  });

  if (!admin || !admin.phoneNumber || !admin.notificationWhatsapp) {
    return { canSend: false };
  }

  return { canSend: true, phoneNumber: admin.phoneNumber };
}

/**
 * Send WhatsApp notification to customer about booking confirmation
 */
export async function sendCustomerBookingConfirmed(bookingId: string, customerId: string): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToUser(customerId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
            departureTime: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;
    const departureDate = new Date(booking.shipmentSlot.departureTime).toLocaleDateString('en-GB');

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'customer_booking_confirmed',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: `${origin} → ${destination}` },
            { type: 'text', text: departureDate },
          ],
        },
      ],
      userId: customerId,
      payload: { bookingId, type: 'customer_booking_confirmed' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp booking confirmed notification:', error);
  }
}

/**
 * Send WhatsApp notification to customer about booking status change
 */
export async function sendCustomerBookingStatus(
  bookingId: string,
  customerId: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToUser(customerId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;
    const statusLabel = status === 'accepted' ? 'accepted' : 'rejected';

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'customer_booking_status',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: statusLabel },
            { type: 'text', text: `${origin} → ${destination}` },
          ],
        },
      ],
      userId: customerId,
      payload: { bookingId, status, type: 'customer_booking_status' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp booking status notification:', error);
  }
}

/**
 * Send WhatsApp notification to customer about tracking update
 */
export async function sendCustomerTrackingUpdate(
  bookingId: string,
  customerId: string,
  trackingStatus: string
): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToUser(customerId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'customer_tracking_update',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: trackingStatus },
            { type: 'text', text: `${origin} → ${destination}` },
          ],
        },
      ],
      userId: customerId,
      payload: { bookingId, trackingStatus, type: 'customer_tracking_update' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp tracking update notification:', error);
  }
}

/**
 * Send WhatsApp notification to customer about delivery
 */
export async function sendCustomerDelivered(bookingId: string, customerId: string): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToUser(customerId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'customer_delivered',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: `${origin} → ${destination}` },
          ],
        },
      ],
      userId: customerId,
      payload: { bookingId, type: 'customer_delivered' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp delivered notification:', error);
  }
}

/**
 * Send WhatsApp notification to company about new booking
 */
export async function sendCompanyNewBooking(bookingId: string, companyId: string): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToCompany(companyId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: {
            fullName: true,
          },
        },
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;
    const customerName = booking.customer.fullName;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { adminId: true },
    });

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'company_new_booking',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: customerName },
            { type: 'text', text: `${origin} → ${destination}` },
          ],
        },
      ],
      userId: company?.adminId || undefined,
      companyId,
      payload: { bookingId, type: 'company_new_booking' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp new booking notification to company:', error);
  }
}

/**
 * Send WhatsApp notification to company about booking cancellation
 */
export async function sendCompanyBookingCancelled(bookingId: string, companyId: string): Promise<void> {
  try {
    const { canSend, phoneNumber } = await canSendWhatsAppToCompany(companyId);
    if (!canSend || !phoneNumber) {
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: {
            fullName: true,
          },
        },
        shipmentSlot: {
          select: {
            originCity: true,
            destinationCity: true,
          },
        },
      },
    });

    if (!booking) {
      return;
    }

    const origin = booking.shipmentSlot.originCity;
    const destination = booking.shipmentSlot.destinationCity;
    const customerName = booking.customer.fullName;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { adminId: true },
    });

    await sendTemplateMessage({
      toPhone: phoneNumber,
      templateName: 'company_booking_cancelled',
      languageCode: config.whatsapp.defaultCountry === 'GB' ? 'en_GB' : 'en',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: bookingId },
            { type: 'text', text: customerName },
            { type: 'text', text: `${origin} → ${destination}` },
          ],
        },
      ],
      userId: company?.adminId || undefined,
      companyId,
      payload: { bookingId, type: 'company_booking_cancelled' },
    });
  } catch (error) {
    console.error('Failed to send WhatsApp booking cancelled notification to company:', error);
  }
}
