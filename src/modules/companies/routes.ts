import { Router } from 'express';
import { companyController } from './controller';
import { authenticate, requireCompanyAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { updateCompanySchema, completeCompanyOnboardingSchema } from './dto';

const router = Router();

// Company profile routes (authenticated company users)
router.get(
  '/me',
  authenticate,
  requireCompanyAccess,
  companyController.getMyCompany
);

router.patch(
  '/me',
  authenticate,
  requireCompanyAccess,
  validate(updateCompanySchema),
  companyController.updateMyCompany
);

router.put(
  '/profile/onboarding',
  authenticate,
  requireCompanyAccess,
  validate(completeCompanyOnboardingSchema),
  companyController.completeOnboarding
);

// Overview/Dashboard
router.get(
  '/overview/stats',
  authenticate,
  requireCompanyAccess,
  companyController.getOverviewStats
);

router.get(
  '/overview/recent-bookings',
  authenticate,
  requireCompanyAccess,
  companyController.getRecentBookings
);

router.get(
  '/overview/upcoming-shipments',
  authenticate,
  requireCompanyAccess,
  companyController.getUpcomingShipments
);

// Analytics
router.get(
  '/analytics',
  authenticate,
  requireCompanyAccess,
  companyController.getAnalytics
);

// Company Profile (matching FE requirements)
router.get(
  '/profile',
  authenticate,
  requireCompanyAccess,
  companyController.getMyCompany
);

router.put(
  '/profile',
  authenticate,
  requireCompanyAccess,
  validate(updateCompanySchema),
  companyController.updateMyCompany
);

// Team Management
router.get(
  '/team',
  authenticate,
  requireCompanyAccess,
  companyController.getTeamMembers
);

router.put(
  '/team/:memberId/role',
  authenticate,
  requireCompanyAccess,
  companyController.updateTeamMemberRole
);

router.delete(
  '/team/:memberId',
  authenticate,
  requireCompanyAccess,
  companyController.removeTeamMember
);

// Company Settings
router.get(
  '/settings',
  authenticate,
  requireCompanyAccess,
  companyController.getSettings
);

router.put(
  '/settings',
  authenticate,
  requireCompanyAccess,
  companyController.updateSettings
);

router.post(
  '/profile/logo',
  authenticate,
  requireCompanyAccess,
  companyController.uploadLogo
);

// Team Invitations
router.post(
  '/team/invite',
  authenticate,
  requireCompanyAccess,
  companyController.inviteTeamMember
);

router.get(
  '/team/invitations',
  authenticate,
  requireCompanyAccess,
  companyController.getPendingInvitations
);

router.delete(
  '/team/invitations/:invitationId',
  authenticate,
  requireCompanyAccess,
  companyController.cancelInvitation
);

export default router;

