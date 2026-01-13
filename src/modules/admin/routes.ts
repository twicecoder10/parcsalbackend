import { Router } from 'express';
import { adminController } from './controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validator';
import {
  dashboardStatsSchema,
  dashboardAnalyticsSchema,
  listCompaniesSchema,
  getCompanySchema,
  verifyCompanySchema,
  unverifyCompanySchema,
  deactivateCompanySchema,
  activateCompanySchema,
  getCompanyShipmentsSchema,
  getCompanyBookingsSchema,
  getCompanyStatsSchema,
  listUsersSchema,
  getUserSchema,
  activateUserSchema,
  deactivateUserSchema,
  changeUserRoleSchema,
  getUserBookingsSchema,
  getUserStatsSchema,
  listShipmentsSchema,
  getShipmentSchema,
  getShipmentStatsSchema,
  closeShipmentSchema,
  listBookingsSchema,
  getBookingSchema,
  getBookingStatsSchema,
  confirmBookingSchema,
  cancelBookingSchema,
  getSettingsSchema,
  updateSettingsSchema,
  userReportSchema,
  bookingReportSchema,
  revenueReportSchema,
  companyReportSchema,
  updateCompanyPlanSchema,
  topupCompanyCreditsSchema,
  getCompanyUsageSchema,
  runMonthlyRolloverSchema,
} from './dto';

const router = Router();

// All admin routes require SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

// Dashboard
router.get('/dashboard/summary', adminController.getDashboardSummary);
router.get('/dashboard/stats', validate(dashboardStatsSchema), adminController.getDashboardStats);
router.get('/dashboard/analytics', validate(dashboardAnalyticsSchema), adminController.getDashboardAnalytics);

// Companies
router.get('/companies', validate(listCompaniesSchema), adminController.listCompanies);
router.get('/companies/:id', validate(getCompanySchema), adminController.getCompany);
router.post('/companies/:id/verify', validate(verifyCompanySchema), adminController.verifyCompany);
router.post('/companies/:id/unverify', validate(unverifyCompanySchema), adminController.unverifyCompany);
router.post('/companies/:id/deactivate', validate(deactivateCompanySchema), adminController.deactivateCompany);
router.post('/companies/:id/activate', validate(activateCompanySchema), adminController.activateCompany);
router.get('/companies/:id/shipments', validate(getCompanyShipmentsSchema), adminController.getCompanyShipments);
router.get('/companies/:id/bookings', validate(getCompanyBookingsSchema), adminController.getCompanyBookings);
router.get('/companies/:id/stats', validate(getCompanyStatsSchema), adminController.getCompanyStats);

// Users
router.get('/users', validate(listUsersSchema), adminController.listUsers);
router.get('/users/stats', validate(getUserStatsSchema), adminController.getUserStats);
router.get('/users/:id', validate(getUserSchema), adminController.getUser);
router.post('/users/:id/activate', validate(activateUserSchema), adminController.activateUser);
router.post('/users/:id/deactivate', validate(deactivateUserSchema), adminController.deactivateUser);
router.post('/users/:id/change-role', validate(changeUserRoleSchema), adminController.changeUserRole);
router.get('/users/:id/bookings', validate(getUserBookingsSchema), adminController.getUserBookings);

// Shipments
router.get('/shipments', validate(listShipmentsSchema), adminController.listShipments);
router.get('/shipments/stats', validate(getShipmentStatsSchema), adminController.getShipmentStats);
router.get('/shipments/:id', validate(getShipmentSchema), adminController.getShipment);
router.post('/shipments/:id/close', validate(closeShipmentSchema), adminController.closeShipment);

// Bookings
router.get('/bookings', validate(listBookingsSchema), adminController.listBookings);
router.get('/bookings/stats', validate(getBookingStatsSchema), adminController.getBookingStats);
router.get('/bookings/:id', validate(getBookingSchema), adminController.getBooking);
router.post('/bookings/:id/confirm', validate(confirmBookingSchema), adminController.confirmBooking);
router.post('/bookings/:id/cancel', validate(cancelBookingSchema), adminController.cancelBooking);

// Settings
router.get('/settings', validate(getSettingsSchema), adminController.getSettings);
router.put('/settings', validate(updateSettingsSchema), adminController.updateSettings);

// Reports
router.get('/reports/users', validate(userReportSchema), adminController.getUserReport);
router.get('/reports/bookings', validate(bookingReportSchema), adminController.getBookingReport);
router.get('/reports/revenue', validate(revenueReportSchema), adminController.getRevenueReport);
router.get('/reports/companies', validate(companyReportSchema), adminController.getCompanyReport);

// Billing Management
router.patch('/companies/:id/plan', validate(updateCompanyPlanSchema), adminController.updateCompanyPlan);
router.post('/companies/:id/credits/topup', validate(topupCompanyCreditsSchema), adminController.topupCompanyCredits);
router.get('/companies/:id/usage', validate(getCompanyUsageSchema), adminController.getCompanyUsage);
router.post('/billing/run-monthly-rollover', validate(runMonthlyRolloverSchema), adminController.runMonthlyRollover);

export default router;
