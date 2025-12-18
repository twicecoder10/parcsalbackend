import prisma from '../../config/database';
import { User, UserRole } from '@prisma/client';
import { deleteImageByUrl } from '../../utils/upload';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  companyId?: string | null;
  isEmailVerified?: boolean;
}

export interface CreateCompanyData {
  name: string;
  slug: string;
  description?: string | null;
  country: string;
  city: string;
  website?: string | null;
  logoUrl?: string | null;
}

export const authRepository = {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async createUser(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data,
    });
  },

  async createUserWithCompany(
    userData: CreateUserData,
    companyData: CreateCompanyData
  ): Promise<{ user: User; companyId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      // Create user first (without companyId initially)
      const user = await tx.user.create({
        data: {
          ...userData,
          companyId: null, // Will be set after company is created
        },
      });

      // Create company with adminId
      const company = await tx.company.create({
        data: {
          ...companyData,
          adminId: user.id,
        },
      });

      // Update user with companyId
      await tx.user.update({
        where: { id: user.id },
        data: {
          companyId: company.id,
        },
      });

      return { user: { ...user, companyId: company.id }, companyId: company.id };
    });

    return result;
  },

  async updateUser(id: string, data: Partial<CreateUserData>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });
  },

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { passwordResetToken: token },
    });
  },

  async updateEmailVerificationToken(
    userId: string,
    token: string | null,
    expiresAt: Date | null
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpires: expiresAt,
      },
    });
  },

  async updatePasswordResetToken(
    userId: string,
    token: string | null,
    expiresAt: Date | null
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expiresAt,
      },
    });
  },

  async verifyEmail(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
  },

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  },

  async deleteAccount(userId: string, isCompanyAdmin: boolean = false, companyId: string | null = null): Promise<void> {
    // Store company logo URL before deletion (needed for cleanup)
    let companyLogoUrl: string | null = null;
    
    if (isCompanyAdmin && companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { logoUrl: true },
      });
      companyLogoUrl = company?.logoUrl || null;
    }

    await prisma.$transaction(async (tx) => {
      // Helper function to anonymize a user
      const anonymizeUser = async (targetUserId: string) => {
        const userDeletedAt = new Date();
        const userAnonymizedEmail = `deleted_${targetUserId}_${userDeletedAt.getTime()}@deleted.local`;
        
        // Anonymize user personal information
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            email: userAnonymizedEmail,
            fullName: 'Deleted User',
            phoneNumber: null,
            address: null,
            city: null,
            country: null,
            preferredShippingMode: null,
            passwordHash: '$2a$10$' + 'x'.repeat(53), // Invalid hash that can't be used
            emailVerificationToken: null,
            emailVerificationExpires: null,
            passwordResetToken: null,
            passwordResetExpires: null,
            isEmailVerified: false,
            notificationEmail: false,
            notificationSMS: false,
            onboardingSteps: {},
            onboardingCompleted: false,
            restrictions: {},
            companyId: null, // Remove company association
          },
        });

        // Anonymize bookings - keep booking records but remove customer PII
        await tx.booking.updateMany({
          where: { customerId: targetUserId },
          data: {
            pickupContactName: null,
            pickupContactPhone: null,
            deliveryContactName: null,
            deliveryContactPhone: null,
          },
        });

        // Delete notifications (personal data, no business need to retain)
        await tx.notification.deleteMany({
          where: { userId: targetUserId },
        });

        // Cancel pending team invitations sent by this user
        await tx.teamInvitation.updateMany({
          where: {
            invitedById: targetUserId,
            status: 'PENDING',
          },
          data: {
            status: 'CANCELLED',
          },
        });
      };

      // If user is a company admin, handle company and staff deletion
      if (isCompanyAdmin && companyId) {
        // Get company info before deletion to preserve in bookings
        const company = await tx.company.findUnique({
          where: { id: companyId },
          select: { name: true },
        });

        // Get all staff members (including other admins if any)
        const staffMembers = await tx.user.findMany({
          where: {
            companyId: companyId,
            role: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] },
          },
          select: { id: true },
        });

        // Anonymize all staff members first (excluding the admin themselves)
        for (const staff of staffMembers) {
          if (staff.id !== userId) {
            await anonymizeUser(staff.id);
          }
        }

        // Preserve bookings by setting companyId to null and storing company name
        // This ensures customers don't lose their booking history when company is deleted
        if (company?.name) {
          await tx.booking.updateMany({
            where: { companyId: companyId },
            data: {
              companyId: null,
              companyName: `Deleted Company (${company.name})`, // Preserve company name for customer reference
            },
          });
        }

        // Delete the company (this will cascade delete:
        // - WarehouseAddresses (warehouse references in bookings will be set to null due to SetNull)
        // - ShipmentSlots
        // - Subscriptions
        // - TeamInvitations
        // - Reviews (company reviews)
        // Note: Bookings are preserved (companyId set to null above)
        await tx.company.delete({
          where: { id: companyId },
        });
      }

      // Anonymize the user themselves
      await anonymizeUser(userId);
    });

    // Clean up company logo from Azure storage (after transaction completes)
    // Note: This is done outside the transaction to avoid blocking database operations
    // and to ensure it only runs if the transaction succeeds
    if (companyLogoUrl) {
      deleteImageByUrl(companyLogoUrl).catch((err) => {
        console.error(`Failed to cleanup company logo for company ${companyId}:`, err);
        // Don't throw - cleanup failures shouldn't affect the deletion
      });
    }
  },

  async checkCompanyAdminStatus(userId: string): Promise<{ isAdmin: boolean; companyId: string | null; staffCount: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        companyId: true,
      },
    });

    if (!user || user.role !== 'COMPANY_ADMIN' || !user.companyId) {
      return { isAdmin: false, companyId: null, staffCount: 0 };
    }

    // Check if user is the admin of the company
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        adminId: true,
      },
    });

    if (!company || company.adminId !== userId) {
      return { isAdmin: false, companyId: user.companyId, staffCount: 0 };
    }

    // Count staff members (excluding the admin themselves)
    const staffCount = await prisma.user.count({
      where: {
        companyId: user.companyId,
        role: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] },
        NOT: { id: userId },
      },
    });

    return { isAdmin: true, companyId: user.companyId, staffCount };
  },
};

