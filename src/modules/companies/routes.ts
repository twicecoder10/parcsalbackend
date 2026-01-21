import { Router } from 'express';
import { companyController } from './controller';
import { authenticate, requireCompanyAccess } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import { analyticsLimiter } from '../../middleware/rateLimiter';
import { requirePlan } from '../../middleware/entitlements';
import { updateCompanySchema, completeCompanyOnboardingSchema, createWarehouseAddressSchema, updateWarehouseAddressSchema, deleteWarehouseAddressSchema, getCompanyWarehousesSchema, getPublicCompanyProfileSchema, getCompanyShipmentsSchema, browseCompaniesSchema, staffRestrictionsSchema } from './dto';

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

// Analytics (STARTER+ plans only - FREE plan does not have access)
router.get(
  '/analytics',
  authenticate,
  requireCompanyAccess,
  requirePlan('STARTER'), // Analytics only available for STARTER and above
  analyticsLimiter,
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

// Company Usage
router.get(
  '/me/usage',
  authenticate,
  requireCompanyAccess,
  companyController.getMyUsage
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

// Get current user's restrictions (for frontend layout)
router.get(
  '/me/restrictions',
  authenticate,
  requireCompanyAccess,
  companyController.getMyRestrictions
);

// Staff Restrictions Management (per staff member)
router.get(
  '/team/:memberId/restrictions',
  authenticate,
  requireCompanyAccess,
  companyController.getStaffRestrictions
);

router.put(
  '/team/:memberId/restrictions',
  authenticate,
  requireCompanyAccess,
  validate(staffRestrictionsSchema),
  companyController.updateStaffRestrictions
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
  companyController.getInvitations
);

router.get(
  '/team/invitations/pending',
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

router.post(
  '/team/invitations/:invitationId/revoke',
  authenticate,
  requireCompanyAccess,
  companyController.revokeInvitation
);

// Warehouse Addresses (Available to all plans)
router.post(
  '/warehouses',
  authenticate,
  requireCompanyAccess,
  validate(createWarehouseAddressSchema),
  companyController.createWarehouseAddress
);

router.get(
  '/warehouses',
  authenticate,
  requireCompanyAccess,
  companyController.listWarehouseAddresses
);

router.patch(
  '/warehouses/:id',
  authenticate,
  requireCompanyAccess,
  validate(updateWarehouseAddressSchema),
  companyController.updateWarehouseAddress
);

router.delete(
  '/warehouses/:id',
  authenticate,
  requireCompanyAccess,
  validate(deleteWarehouseAddressSchema),
  companyController.deleteWarehouseAddress
);

// Public routes (must be after all specific routes to avoid conflicts)
// Browse route must be before :companyIdOrSlug routes to avoid conflicts
router.get(
  '/browse',
  validate(browseCompaniesSchema),
  companyController.browseCompanies
);

router.get(
  '/:companyIdOrSlug/warehouses',
  validate(getCompanyWarehousesSchema),
  companyController.getCompanyWarehouseAddresses
);

router.get(
  '/:companyIdOrSlug/shipments',
  validate(getCompanyShipmentsSchema),
  companyController.getCompanyShipments
);

router.get(
  '/:companyIdOrSlug',
  validate(getPublicCompanyProfileSchema),
  companyController.getPublicCompanyProfile
);

export default router;

