import { customerRepository, UpdateCustomerProfileData } from './repository';
import {
  CompleteCustomerOnboardingDto,
  UpdateCustomerProfileDto,
  ChangePasswordDto,
} from './dto';
import { AuthRequest } from '../../middleware/auth';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { authService } from '../auth/service';
import { authRepository } from '../auth/repository';
import prisma from '../../config/database';
import { bookingRepository } from '../bookings/repository';

export const customerService = {
  async getDashboardStats(req: AuthRequest) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can access dashboard stats');
    }

    return await customerRepository.getDashboardStats(req.user.id);
  },

  async getRecentBookings(req: AuthRequest, limit: number = 5) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can view their bookings');
    }

    const bookings = await customerRepository.getRecentBookings(req.user.id, limit);

    return bookings.map((booking) => ({
      id: booking.id,
      originCity: booking.shipmentSlot.originCity,
      destinationCity: booking.shipmentSlot.destinationCity,
      status: booking.status,
      departureTime: booking.shipmentSlot.departureTime,
      // Include new parcel information fields
      parcelType: booking.parcelType,
      weight: booking.weight,
      value: booking.value ? Number(booking.value) : null,
      length: booking.length,
      width: booking.width,
      height: booking.height,
      description: booking.description,
      images: booking.images,
      pickupMethod: booking.pickupMethod,
      deliveryMethod: booking.deliveryMethod,
      paymentStatus: booking.paymentStatus,
      calculatedPrice: booking.calculatedPrice ? Number(booking.calculatedPrice) : null,
    }));
  },

  async getProfile(req: AuthRequest) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can view their profile');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      city: user.city,
      address: user.address,
      country: user.country,
      preferredShippingMode: user.preferredShippingMode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },

  async updateProfile(req: AuthRequest, dto: UpdateCustomerProfileDto) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can update their profile');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if email is being changed and if it's already taken
    if (dto.email && dto.email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        throw new BadRequestError('Email is already taken');
      }
    }

    // Optional password update (both currentPassword and newPassword required together)
    if (dto.currentPassword && dto.newPassword) {
      const isPasswordValid = await authService.comparePassword(dto.currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        throw new BadRequestError('Current password is incorrect');
      }
      const passwordHash = await authService.hashPassword(dto.newPassword);
      await authRepository.updatePassword(req.user.id, passwordHash);
    }

    const updateData: UpdateCustomerProfileData = {};
    if (dto.fullName !== undefined) updateData.fullName = dto.fullName;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phoneNumber !== undefined) updateData.phoneNumber = dto.phoneNumber;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.address !== undefined) updateData.address = dto.address || null;
    if (dto.country !== undefined) updateData.country = dto.country || null;

    const updatedUser = await customerRepository.updateProfile(req.user.id, updateData);

    return {
      message: 'Profile updated successfully',
      profile: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        city: updatedUser.city,
        address: updatedUser.address,
        country: updatedUser.country,
        preferredShippingMode: updatedUser.preferredShippingMode,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    };
  },

  async completeOnboarding(req: AuthRequest, dto: CompleteCustomerOnboardingDto) {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    if (req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can complete customer onboarding');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updateData: UpdateCustomerProfileData = {
      phoneNumber: dto.phoneNumber,
      city: dto.city,
      address: dto.address || null,
      country: dto.country || null,
      preferredShippingMode: dto.preferredShippingMode || null,
      notificationEmail: dto.notificationEmail ?? true,
      notificationSMS: dto.notificationSMS ?? false,
      onboardingCompleted: true,
    };

    await customerRepository.updateProfile(req.user.id, updateData);

    return {
      message: 'Onboarding completed successfully',
    };
  },

  async changePassword(req: AuthRequest, dto: ChangePasswordDto) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can change their password');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isPasswordValid = await authService.comparePassword(
      dto.currentPassword,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await authService.hashPassword(dto.newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    return {
      message: 'Password changed successfully',
    };
  },

  async getNotificationPreferences(req: AuthRequest) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can view notification preferences');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get marketing consent
    const { marketingService } = await import('../marketing/service');
    const marketingConsent = await marketingService.getConsent(req.user.id);

    return {
      // Transactional notifications
      email: user.notificationEmail,
      sms: user.notificationSMS,
      whatsapp: user.notificationWhatsapp ?? false,
      // Marketing consent
      marketing: {
        emailMarketingOptIn: marketingConsent.emailMarketingOptIn,
        whatsappMarketingOptIn: marketingConsent.whatsappMarketingOptIn,
        carrierMarketingOptIn: marketingConsent.carrierMarketingOptIn,
      },
    };
  },

  async updateNotificationPreferences(
    req: AuthRequest,
    dto: {
      email?: boolean;
      sms?: boolean;
      whatsapp?: boolean;
      marketing?: {
        emailMarketingOptIn?: boolean;
        whatsappMarketingOptIn?: boolean;
        carrierMarketingOptIn?: boolean;
      };
      // Support flat structure for backward compatibility
      emailMarketingOptIn?: boolean;
      whatsappMarketingOptIn?: boolean;
      carrierMarketingOptIn?: boolean;
    }
  ) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can update notification preferences');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update transactional notification preferences
    const updateData: UpdateCustomerProfileData = {};
    if (dto.email !== undefined) updateData.notificationEmail = dto.email;
    if (dto.sms !== undefined) updateData.notificationSMS = dto.sms;
    if (dto.whatsapp !== undefined) updateData.notificationWhatsapp = dto.whatsapp;

    const updatedUser = await customerRepository.updateProfile(req.user.id, updateData);

    // Update marketing consent preferences
    // Support both nested (marketing.*) and flat structure
    const { marketingService } = await import('../marketing/service');
    const marketingConsentUpdate: {
      emailMarketingOptIn?: boolean;
      whatsappMarketingOptIn?: boolean;
      carrierMarketingOptIn?: boolean;
    } = {};
    
    // Check nested structure first, then flat structure
    if (dto.marketing?.emailMarketingOptIn !== undefined) {
      marketingConsentUpdate.emailMarketingOptIn = dto.marketing.emailMarketingOptIn;
    } else if (dto.emailMarketingOptIn !== undefined) {
      marketingConsentUpdate.emailMarketingOptIn = dto.emailMarketingOptIn;
    }
    
    if (dto.marketing?.whatsappMarketingOptIn !== undefined) {
      marketingConsentUpdate.whatsappMarketingOptIn = dto.marketing.whatsappMarketingOptIn;
    } else if (dto.whatsappMarketingOptIn !== undefined) {
      marketingConsentUpdate.whatsappMarketingOptIn = dto.whatsappMarketingOptIn;
    }
    
    if (dto.marketing?.carrierMarketingOptIn !== undefined) {
      marketingConsentUpdate.carrierMarketingOptIn = dto.marketing.carrierMarketingOptIn;
    } else if (dto.carrierMarketingOptIn !== undefined) {
      marketingConsentUpdate.carrierMarketingOptIn = dto.carrierMarketingOptIn;
    }

    let updatedMarketingConsent = null;
    if (Object.keys(marketingConsentUpdate).length > 0) {
      updatedMarketingConsent = await marketingService.updateConsent(
        req.user.id,
        marketingConsentUpdate
      );
    } else {
      // Get current marketing consent if not updating
      updatedMarketingConsent = await marketingService.getConsent(req.user.id);
    }

    return {
      message: 'Notification preferences updated successfully',
      preferences: {
        // Transactional notifications
        email: updatedUser.notificationEmail,
        sms: updatedUser.notificationSMS,
        whatsapp: updatedUser.notificationWhatsapp ?? false,
        // Marketing consent
        marketing: {
          emailMarketingOptIn: updatedMarketingConsent.emailMarketingOptIn,
          whatsappMarketingOptIn: updatedMarketingConsent.whatsappMarketingOptIn,
          carrierMarketingOptIn: updatedMarketingConsent.carrierMarketingOptIn,
        },
      },
    };
  },

  async cancelBooking(req: AuthRequest, bookingId: string) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can cancel bookings');
    }

    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to cancel this booking');
    }

    // Only PENDING or ACCEPTED bookings can be cancelled
    if (booking.status !== 'PENDING' && booking.status !== 'ACCEPTED') {
      throw new BadRequestError('Only pending or accepted bookings can be cancelled');
    }

    // Update booking status to CANCELLED
    await bookingRepository.updateStatus(bookingId, 'CANCELLED');

    // Release capacity back to shipment slot
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
    });

    if (shipmentSlot) {
      const updates: any = {};
      if (booking.requestedWeightKg && shipmentSlot.remainingCapacityKg !== null) {
        updates.remainingCapacityKg = {
          increment: booking.requestedWeightKg,
        };
      }
      if (booking.requestedItemsCount && shipmentSlot.remainingCapacityItems !== null) {
        updates.remainingCapacityItems = {
          increment: booking.requestedItemsCount,
        };
      }

      if (Object.keys(updates).length > 0) {
        await prisma.shipmentSlot.update({
          where: { id: booking.shipmentSlotId },
          data: updates,
        });
      }
    }

    // Notify company about cancellation
    const { createCompanyNotification } = await import('../../utils/notifications');
    if (booking.companyId) {
      await createCompanyNotification(
        booking.companyId,
        'BOOKING_CANCELLED',
        'Booking Cancelled',
        `Booking ${bookingId} has been cancelled by the customer`,
        {
          bookingId: booking.id,
          customerId: booking.customerId,
          shipmentSlotId: booking.shipmentSlotId,
        }
      ).catch((err) => {
        console.error('Failed to create company notification:', err);
      });
    }

    return {
      message: 'Booking cancelled successfully',
    };
  },

  async trackShipment(req: AuthRequest, bookingId: string) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can track shipments');
    }

    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.customerId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to track this shipment');
    }

    // Get shipment slot with tracking information
    const shipmentSlot = await prisma.shipmentSlot.findUnique({
      where: { id: booking.shipmentSlotId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            contactPhone: true,
            contactEmail: true,
          },
        },
      },
    });

    if (!shipmentSlot) {
      throw new NotFoundError('Shipment slot not found');
    }

    // Sanitize company data - remove sensitive contact information
    const sanitizedCompany = shipmentSlot.company ? {
      id: shipmentSlot.company.id,
      name: shipmentSlot.company.name,
      slug: shipmentSlot.company.slug,
      logoUrl: shipmentSlot.company.logoUrl,
    } : null;

    return {
      booking: {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        requestedWeightKg: booking.requestedWeightKg,
        requestedItemsCount: booking.requestedItemsCount,
        calculatedPrice: booking.calculatedPrice ? Number(booking.calculatedPrice) : null,
        // Include new parcel information fields
        parcelType: booking.parcelType,
        weight: booking.weight,
        value: booking.value ? Number(booking.value) : null,
        length: booking.length,
        width: booking.width,
        height: booking.height,
        description: booking.description,
        images: booking.images,
        pickupMethod: booking.pickupMethod,
        deliveryMethod: booking.deliveryMethod,
        notes: booking.notes,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      shipment: {
        id: shipmentSlot.id,
        originCountry: shipmentSlot.originCountry,
        originCity: shipmentSlot.originCity,
        destinationCountry: shipmentSlot.destinationCountry,
        destinationCity: shipmentSlot.destinationCity,
        departureTime: shipmentSlot.departureTime,
        arrivalTime: shipmentSlot.arrivalTime,
        mode: shipmentSlot.mode,
        trackingStatus: shipmentSlot.trackingStatus,
        status: shipmentSlot.status,
        cutoffTimeForReceivingItems: shipmentSlot.cutoffTimeForReceivingItems,
      },
      company: sanitizedCompany,
    };
  },
};

