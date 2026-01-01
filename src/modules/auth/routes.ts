import { Router } from 'express';
import { authController } from './controller';
import { validate } from '../../middleware/validator';
import { authenticate } from '../../middleware/auth';
import {
  authLimiter,
  registrationLimiter,
  refreshTokenLimiter,
} from '../../middleware/rateLimiter';
import {
  registerCustomerSchema,
  registerCompanyAdminSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  acceptInvitationSchema,
} from './dto';

const router = Router();

// Registration routes
router.post(
  '/register/customer',
  registrationLimiter,
  validate(registerCustomerSchema),
  authController.registerCustomer
);

router.post(
  '/register/company',
  registrationLimiter,
  validate(registerCompanyAdminSchema),
  authController.registerCompanyAdmin
);

// Login
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

// Token management
router.post(
  '/refresh-token',
  refreshTokenLimiter,
  validate(refreshTokenSchema),
  authController.refreshToken
);

router.post('/logout', authController.logout);

// Password management
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

// Email verification
router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  authController.resendVerification
);

// Get current user profile
router.get('/me', authenticate, authController.getMe);

// Delete account
router.delete('/account', authenticate, authController.deleteAccount);

// Accept team invitation
router.post(
  '/accept-invitation',
  validate(acceptInvitationSchema),
  authController.acceptInvitation
);

export default router;

