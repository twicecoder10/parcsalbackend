import { z } from 'zod';
import { bookingIdValidator } from '../../utils/validators';

export const completeCustomerOnboardingSchema = z.object({
  body: z.object({
    phoneNumber: z.string().min(1, 'Phone number is required'),
    city: z.string().min(1, 'City is required'),
    address: z.string().optional(),
    country: z.string().optional(),
    preferredShippingMode: z.enum(['VAN', 'TRUCK', 'AIR', 'TRAIN', 'SHIP', 'RIDER']).optional(),
    notificationEmail: z.boolean().optional().default(true),
    notificationSMS: z.boolean().optional().default(false),
  }),
});

export const updateCustomerProfileSchema = z.object({
  body: z
    .object({
      fullName: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phoneNumber: z.string().optional(),
      city: z.string().optional(),
      address: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').optional(),
    })
    .refine(
      (data) => {
        const hasCurrent = data.currentPassword !== undefined && data.currentPassword !== '';
        const hasNew = data.newPassword !== undefined && data.newPassword !== '';
        if (hasCurrent || hasNew) return hasCurrent && hasNew;
        return true;
      },
      { message: 'Both currentPassword and newPassword are required to change password', path: ['newPassword'] }
    ),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }),
});

export const updateNotificationPreferencesSchema = z.object({
  body: z.object({
    // Transactional notification preferences
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
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

export const getRecentBookingsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
  }),
});

export const cancelBookingSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const trackShipmentSchema = z.object({
  params: z.object({
    bookingId: bookingIdValidator,
  }),
});

export const createPaymentSessionSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
});

export const syncPaymentStatusSchema = z.object({
  params: z.object({
    id: bookingIdValidator,
  }),
  query: z.object({
    session_id: z.string().optional(),
  }),
});

export type CompleteCustomerOnboardingDto = z.infer<typeof completeCustomerOnboardingSchema>['body'];
export type UpdateCustomerProfileDto = z.infer<typeof updateCustomerProfileSchema>['body'];
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>['body'];

