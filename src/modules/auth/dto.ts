import { z } from 'zod';

export const registerCustomerSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }).email('Invalid email address'),
    password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters'),
    fullName: z.string({ required_error: 'Full name is required' }).min(1, 'Full name is required'),
  }),
});

export const registerCompanyAdminSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }).email('Invalid email address'),
    password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters'),
    fullName: z.string({ required_error: 'Full name is required' }).min(1, 'Full name is required'),
    companyName: z.string({ required_error: 'Company name is required' }).min(1, 'Company name is required'),
    companyDescription: z.string().optional(),
    companyCountry: z.string({ required_error: 'Company country is required' }).min(1, 'Company country is required'),
    companyCity: z.string({ required_error: 'Company city is required' }).min(1, 'Company city is required'),
    companyWebsite: z.string().url('Invalid website URL').optional().or(z.literal('')),
    companyLogoUrl: z.string().url('Invalid logo URL').optional().or(z.literal('')),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const acceptInvitationSchema = z.object({
  query: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
  body: z.object({
    password: z.string({ required_error: 'Password is required' }).min(8, 'Password must be at least 8 characters'),
    fullName: z.string({ required_error: 'Full name is required' }).min(1, 'Full name is required'),
  }),
});

export type RegisterCustomerDto = z.infer<typeof registerCustomerSchema>['body'];
export type RegisterCompanyAdminDto = z.infer<typeof registerCompanyAdminSchema>['body'];
export type LoginDto = z.infer<typeof loginSchema>['body'];
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>['body'];
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>['body'];
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>['body'];
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>['body'];
export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>['body'];

