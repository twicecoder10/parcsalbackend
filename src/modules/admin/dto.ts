import { z } from 'zod';

const userRoleEnum = z.enum(['CUSTOMER', 'COMPANY_ADMIN', 'COMPANY_STAFF', 'SUPER_ADMIN']);
const shipmentStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);
const bookingStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'IN_TRANSIT', 'DELIVERED']);

// Dashboard
export const dashboardStatsSchema = z.object({
  query: z.object({}).optional(),
});

export const dashboardAnalyticsSchema = z.object({
  query: z.object({
    period: z.enum(['week', 'month', 'year']).optional(),
    metric: z.enum(['users', 'bookings', 'revenue']).optional(),
  }),
});

// Companies
export const listCompaniesSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    search: z.string().optional(),
    verified: z.enum(['true', 'false', 'all']).optional(),
    plan: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const verifyCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const unverifyCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deactivateCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const activateCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const getCompanyShipmentsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: shipmentStatusEnum.optional(),
    sortBy: z.string().optional(),
  }),
});

export const getCompanyBookingsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: bookingStatusEnum.optional(),
    sortBy: z.string().optional(),
  }),
});

export const getCompanyStatsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

// Users
export const listUsersSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    search: z.string().optional(),
    role: z.string().optional(),
    companyId: z.string().uuid().optional(),
    isActive: z.enum(['true', 'false', 'all']).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getUserSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const activateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deactivateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

export const changeUserRoleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    role: userRoleEnum,
  }),
});

export const getUserBookingsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    status: bookingStatusEnum.optional(),
    sortBy: z.string().optional(),
  }),
});

export const getUserStatsSchema = z.object({
  query: z.object({}).optional(),
});

// Shipments
export const listShipmentsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    mode: z.string().optional(), // Allows 'all' or any shipment mode
    companyId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getShipmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const getShipmentStatsSchema = z.object({
  query: z.object({}).optional(),
});

export const closeShipmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

// Bookings
export const listBookingsSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    search: z.string().optional(),
    status: z.string().optional(), // Allows 'all' or any booking status
    customerId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    shipmentId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getBookingSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const getBookingStatsSchema = z.object({
  query: z.object({}).optional(),
});

export const confirmBookingSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const cancelBookingSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

// Settings
export const getSettingsSchema = z.object({
  query: z.object({}).optional(),
});

export const updateSettingsSchema = z.object({
  body: z.object({
    platformName: z.string().optional(),
    supportEmail: z.string().email().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    minCommission: z.number().min(0).optional(),
    maxCommission: z.number().min(0).optional(),
    autoVerifyCompanies: z.boolean().optional(),
    requireEmailVerification: z.boolean().optional(),
    allowCompanyRegistration: z.boolean().optional(),
    allowCustomerRegistration: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
  }),
});

// Reports
export const userReportSchema = z.object({
  query: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
});

export const bookingReportSchema = z.object({
  query: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
});

export const revenueReportSchema = z.object({
  query: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    format: z.enum(['json', 'csv']).optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional(),
  }),
});

export const companyReportSchema = z.object({
  query: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
});

