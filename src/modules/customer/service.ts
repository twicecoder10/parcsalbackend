import { customerRepository, UpdateCustomerProfileData } from './repository';
import {
  CompleteCustomerOnboardingDto,
  UpdateCustomerProfileDto,
  ChangePasswordDto,
} from './dto';
import { AuthRequest } from '../../middleware/auth';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { authService } from '../auth/service';
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

    return {
      email: user.notificationEmail,
      sms: user.notificationSMS,
    };
  },

  async updateNotificationPreferences(req: AuthRequest, dto: { email?: boolean; sms?: boolean }) {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can update notification preferences');
    }

    const user = await customerRepository.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updateData: UpdateCustomerProfileData = {};
    if (dto.email !== undefined) updateData.notificationEmail = dto.email;
    if (dto.sms !== undefined) updateData.notificationSMS = dto.sms;

    const updatedUser = await customerRepository.updateProfile(req.user.id, updateData);

    return {
      message: 'Notification preferences updated successfully',
      preferences: {
        email: updatedUser.notificationEmail,
        sms: updatedUser.notificationSMS,
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
      console.error('Failed to create notification:', err);
    });

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

    return {
      booking: {
        id: booking.id,
        status: booking.status,
        requestedWeightKg: booking.requestedWeightKg,
        requestedItemsCount: booking.requestedItemsCount,
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
      company: shipmentSlot.company,
    };
  },
};

