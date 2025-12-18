import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { authRepository } from './repository';
import {
  RegisterCustomerDto,
  RegisterCompanyAdminDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto';
import { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } from '../../utils/errors';
import { generateUniqueSlug } from '../../utils/slug';
import { generateTokenWithExpiry } from '../../utils/tokens';
import { emailService } from '../../config/email';
import prisma from '../../config/database';
import { onboardingRepository } from '../onboarding/repository';
import { invitationRepository } from '../companies/invitation-repository';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    companyId?: string | null;
    isEmailVerified: boolean;
    onboardingCompleted: boolean;
  };
  tokens: AuthTokens;
}

const SALT_ROUNDS = 10;

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  generateAccessToken(userId: string, email: string, role: string, companyId?: string | null): string {
    return jwt.sign(
      { userId, email, role, companyId },
      config.jwt.secret,
      { expiresIn: config.jwt.accessTokenExpiresIn } as jwt.SignOptions
    );
  },

  generateRefreshToken(userId: string, email: string, role: string, companyId?: string | null): string {
    return jwt.sign(
      { userId, email, role, companyId },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTokenExpiresIn } as jwt.SignOptions
    );
  },

  generateTokens(user: { id: string; email: string; role: string; companyId?: string | null }): AuthTokens {
    return {
      accessToken: this.generateAccessToken(user.id, user.email, user.role, user.companyId),
      refreshToken: this.generateRefreshToken(user.id, user.email, user.role, user.companyId),
    };
  },

  verifyRefreshToken(token: string): { userId: string; email: string; role: string; companyId?: string | null } {
    try {
      return jwt.verify(token, config.jwt.refreshSecret) as {
        userId: string;
        email: string;
        role: string;
        companyId?: string | null;
      };
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  },

  async registerCustomer(dto: RegisterCustomerDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await authRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(dto.password);

    // Generate email verification token
    const { token: verificationToken, expiresAt } = generateTokenWithExpiry(24);

    // Create user
    const user = await authRepository.createUser({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: 'CUSTOMER',
    });

    // Save verification token
    await authRepository.updateEmailVerificationToken(user.id, verificationToken, expiresAt);

    // Initialize onboarding
    await onboardingRepository.initializeUserOnboarding(user.id, 'CUSTOMER');

    // Send verification email (don't wait for it)
    emailService.sendVerificationEmail(dto.email, verificationToken, dto.fullName).catch((err) => {
      console.error('Failed to send verification email:', err);
    });

    // Generate tokens
    const tokens = {
      accessToken: this.generateAccessToken(user.id, user.email, user.role, user.companyId),
      refreshToken: this.generateRefreshToken(user.id, user.email, user.role, user.companyId),
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  },

  async registerCompanyAdmin(dto: RegisterCompanyAdminDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await authRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Check if company slug already exists
    const existingCompanies = await prisma.company.findMany({
      select: { slug: true },
    });
    const existingSlugs = existingCompanies.map((c) => c.slug);
    const slug = generateUniqueSlug(dto.companyName, existingSlugs);

    // Hash password
    const passwordHash = await this.hashPassword(dto.password);

    // Generate email verification token
    const { token: verificationToken, expiresAt } = generateTokenWithExpiry(24);

    // Create user with company
    const { user, companyId } = await authRepository.createUserWithCompany(
      {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: 'COMPANY_ADMIN',
      },
      {
        name: dto.companyName,
        slug,
        description: dto.companyDescription || null,
        country: dto.companyCountry,
        city: dto.companyCity,
        website: dto.companyWebsite || null,
        logoUrl: dto.companyLogoUrl || null,
      }
    );

    // Save verification token
    await authRepository.updateEmailVerificationToken(user.id, verificationToken, expiresAt);

    // Initialize onboarding for user and company
    await onboardingRepository.initializeUserOnboarding(user.id, 'COMPANY_ADMIN');
    await onboardingRepository.initializeCompanyOnboarding(companyId);

    // Send verification email (don't wait for it)
    emailService.sendVerificationEmail(dto.email, verificationToken, dto.fullName).catch((err) => {
      console.error('Failed to send verification email:', err);
    });

    // Generate tokens
    const tokens = {
      accessToken: this.generateAccessToken(user.id, user.email, user.role, companyId),
      refreshToken: this.generateRefreshToken(user.id, user.email, user.role, companyId),
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  },

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Find user
    const user = await authRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await this.comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const tokens = {
      accessToken: this.generateAccessToken(user.id, user.email, user.role, user.companyId),
      refreshToken: this.generateRefreshToken(user.id, user.email, user.role, user.companyId),
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  },

  async refreshToken(dto: RefreshTokenDto): Promise<AuthTokens> {
    // Verify refresh token
    const decoded = this.verifyRefreshToken(dto.refreshToken);

    // Verify user still exists
    const user = await authRepository.findById(decoded.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Generate new tokens
    return {
      accessToken: this.generateAccessToken(user.id, user.email, user.role, user.companyId),
      refreshToken: this.generateRefreshToken(user.id, user.email, user.role, user.companyId),
    };
  },

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    // Always return success for security (don't reveal if email exists)
    const user = await authRepository.findByEmail(dto.email);
    
    if (user) {
      // Generate password reset token (expires in 1 hour)
      const { token: resetToken, expiresAt } = generateTokenWithExpiry(1);
      
      // Save reset token
      await authRepository.updatePasswordResetToken(user.id, resetToken, expiresAt);
      
      // Send password reset email (don't wait for it)
      emailService.sendPasswordResetEmail(dto.email, resetToken, user.fullName).catch((err) => {
        console.error('Failed to send password reset email:', err);
      });
    }
    
    // Always return success message
    return {
      message: 'If an account exists with that email, a password reset link has been sent.',
    };
  },

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    // Find user by reset token
    const user = await authRepository.findByPasswordResetToken(dto.token);
    
    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }
    
    // Check if token is expired
    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestError('Reset token has expired. Please request a new one.');
    }
    
    // Hash new password
    const passwordHash = await this.hashPassword(dto.password);
    
    // Update password and clear reset token
    await authRepository.updatePassword(user.id, passwordHash);
    
    return {
      message: 'Password has been reset successfully. You can now login with your new password.',
    };
  },

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    // Find user by verification token
    const user = await authRepository.findByEmailVerificationToken(dto.token);
    
    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }
    
    // Check if token is expired
    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      throw new BadRequestError('Verification token has expired. Please request a new one.');
    }
    
    // Check if already verified
    if (user.isEmailVerified) {
      return {
        message: 'Email has already been verified.',
      };
    }
    
    // Verify email
    await authRepository.verifyEmail(user.id);
    
    // Mark email verification step as complete in onboarding
    await onboardingRepository.updateUserOnboardingStep(user.id, 'email_verification', true);
    
    return {
      message: 'Email verified successfully.',
    };
  },

  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    // Find user by email
    const user = await authRepository.findByEmail(dto.email);
    
    if (!user) {
      // Return success for security (don't reveal if email exists)
      return {
        message: 'If an account exists with that email, a verification link has been sent.',
      };
    }
    
    // Check if already verified
    if (user.isEmailVerified) {
      return {
        message: 'Email has already been verified.',
      };
    }
    
    // Generate new verification token
    const { token: verificationToken, expiresAt } = generateTokenWithExpiry(24);
    
    // Save verification token
    await authRepository.updateEmailVerificationToken(user.id, verificationToken, expiresAt);
    
    // Send verification email (don't wait for it)
    emailService.sendVerificationEmail(dto.email, verificationToken, user.fullName).catch((err) => {
      console.error('Failed to send verification email:', err);
    });
    
    return {
      message: 'If an account exists with that email, a verification link has been sent.',
    };
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            isVerified: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      companyId: user.companyId,
      isEmailVerified: user.isEmailVerified,
      phoneNumber: user.phoneNumber,
      city: user.city,
      address: user.address,
      country: user.country,
      preferredShippingMode: user.preferredShippingMode,
      notificationEmail: user.notificationEmail,
      notificationSMS: user.notificationSMS,
      onboardingCompleted: user.onboardingCompleted,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            slug: user.company.slug,
            isVerified: user.company.isVerified,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },

  async acceptInvitation(token: string, password: string, fullName: string): Promise<AuthResponse> {
    // Find invitation by token
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      throw new NotFoundError('Invitation not found');
    }

    // Check if invitation is still valid
    if (invitation.status !== 'PENDING') {
      throw new BadRequestError('Invitation has already been used or cancelled');
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await invitationRepository.updateStatus(invitation.id, 'EXPIRED');
      throw new BadRequestError('Invitation has expired');
    }

    // Check if user already exists
    const existingUser = await authRepository.findByEmail(invitation.email);
    if (existingUser) {
      // If user exists and is already part of the company, reject
      if (existingUser.companyId === invitation.companyId) {
        throw new BadRequestError('You are already a member of this company');
      }

      // If user exists but is not part of the company, update their company
      const passwordHash = await this.hashPassword(password);
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          companyId: invitation.companyId,
          role: invitation.role,
          passwordHash, // Update password
          fullName, // Update name
          isEmailVerified: true, // Auto-verify email when accepting invitation
        },
      });

      // Mark invitation as accepted
      await invitationRepository.updateStatus(invitation.id, 'ACCEPTED', updatedUser.id);

      // Initialize onboarding if not already initialized
      const userOnboarding = await onboardingRepository.getUserOnboarding(updatedUser.id);
      if (!userOnboarding?.onboardingSteps) {
        await onboardingRepository.initializeUserOnboarding(updatedUser.id, invitation.role);
      }

      // If user already has a name, mark profile_completion as complete
      if (fullName && fullName.trim()) {
        await onboardingRepository.updateUserOnboardingStep(updatedUser.id, 'profile_completion', true);
      }

      // Mark email_verification as complete (email is verified via invitation acceptance)
      await onboardingRepository.updateUserOnboardingStep(updatedUser.id, 'email_verification', true);

      // Generate tokens
      const tokens = this.generateTokens(updatedUser);

      return {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          fullName: updatedUser.fullName,
          role: updatedUser.role,
          companyId: updatedUser.companyId,
          isEmailVerified: updatedUser.isEmailVerified,
          onboardingCompleted: updatedUser.onboardingCompleted,
        },
        tokens,
      };
    }

    // Create new user
    const passwordHash = await this.hashPassword(password);
    const user = await authRepository.createUser({
      email: invitation.email,
      passwordHash,
      fullName,
      role: invitation.role,
      companyId: invitation.companyId,
      isEmailVerified: true, // Auto-verify email when accepting invitation
    });

    // Mark invitation as accepted
    await invitationRepository.updateStatus(invitation.id, 'ACCEPTED', user.id);

    // Initialize onboarding
    await onboardingRepository.initializeUserOnboarding(user.id, invitation.role);

    // If user already has a name, mark profile_completion as complete
    if (fullName && fullName.trim()) {
      await onboardingRepository.updateUserOnboardingStep(user.id, 'profile_completion', true);
    }

    // Mark email_verification as complete (email is verified via invitation acceptance)
    await onboardingRepository.updateUserOnboardingStep(user.id, 'email_verification', true);

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        isEmailVerified: user.isEmailVerified,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  },

  async deleteAccount(userId: string, password: string): Promise<{ message: string }> {
    // Verify user exists
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify password
    const isPasswordValid = await this.comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    // Check if user is a company admin and get company name if applicable
    const adminStatus = await authRepository.checkCompanyAdminStatus(userId);
    let companyName: string | undefined;
    if (adminStatus.isAdmin && adminStatus.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: adminStatus.companyId },
        select: { name: true },
      });
      companyName = company?.name;
    }

    // Store user email and name before deletion (needed for email notification)
    const userEmail = user.email;
    const userName = user.fullName;
    
    // Delete/anonymize the account
    // If user is a company admin:
    // - All staff members will be anonymized
    // - The company will be deleted (cascading to all company-related data)
    // - The admin user will be anonymized
    // If user is a regular customer or staff:
    // - User personal information will be anonymized
    // - Booking contact information will be anonymized
    // - Reviews will remain linked to anonymized user
    // - Notifications will be deleted
    // - Pending team invitations sent by user will be cancelled
    await authRepository.deleteAccount(
      userId,
      adminStatus.isAdmin,
      adminStatus.companyId
    );
    
    // Send account deletion confirmation email
    // Note: Send this after deletion since we're anonymizing the user
    // We use the original email and name stored before deletion
    emailService.sendAccountDeletionEmail(
      userEmail,
      userName,
      adminStatus.isAdmin,
      companyName
    ).catch((err) => {
      console.error('Failed to send account deletion email:', err);
      // Don't throw - account deletion is already complete
    });
    
    return {
      message: adminStatus.isAdmin
        ? 'Account and company deleted successfully. All personal data and company data have been removed.'
        : 'Account deleted successfully. All personal data has been removed.',
    };
  },
};

