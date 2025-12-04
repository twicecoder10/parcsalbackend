import prisma from '../../config/database';
import { User, UserRole } from '@prisma/client';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  companyId?: string | null;
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
};

