import { z } from 'zod';

export const updateCompanySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    country: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    website: z.string().url().optional().or(z.literal('')),
    logoUrl: z.string().url().optional().or(z.literal('')),
  }),
});

export const listCompaniesSchema = z.object({
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
    isVerified: z.string().optional(),
  }),
});

export const verifyCompanySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    isVerified: z.boolean(),
  }),
});

export const completeCompanyOnboardingSchema = z.object({
  body: z.object({
    companyDescription: z.string().optional(),
    companyWebsite: z.string().url().optional().or(z.literal('')),
    companyLogoUrl: z.string().url().optional().or(z.literal('')),
    contactPhone: z.string().min(1, 'Contact phone is required'),
    contactEmail: z.string().email('Invalid email address').min(1, 'Contact email is required'),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
  }),
});

export const createWarehouseAddressSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Warehouse name is required'),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().optional(),
    country: z.string().min(1, 'Country is required'),
    postalCode: z.string().optional(),
    isDefault: z.boolean().optional().default(false),
  }),
});

export const updateWarehouseAddressSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid warehouse address ID'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().optional(),
    country: z.string().min(1).optional(),
    postalCode: z.string().optional(),
    isDefault: z.boolean().optional(),
  }),
});

export const deleteWarehouseAddressSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid warehouse address ID'),
  }),
});

export const getCompanyWarehousesSchema = z.object({
  params: z.object({
    companyIdOrSlug: z.string().min(1, 'Company ID or slug is required'),
  }),
});

export const getPublicCompanyProfileSchema = z.object({
  params: z.object({
    companyIdOrSlug: z.string().min(1, 'Company ID or slug is required'),
  }),
});

export const getCompanyShipmentsSchema = z.object({
  params: z.object({
    companyIdOrSlug: z.string().min(1, 'Company ID or slug is required'),
  }),
  query: z.object({
    limit: z.string().optional(),
    offset: z.string().optional(),
  }).optional(),
});

// Staff Restrictions
export const staffRestrictionsSchema = z.object({
  params: z.object({
    memberId: z.string().uuid('Invalid member ID'),
  }),
  body: z.object({
    restrictions: z.record(z.string(), z.boolean()).optional(),
  }),
});

export const getStaffRestrictionsSchema = z.object({
  params: z.object({
    memberId: z.string().uuid('Invalid member ID'),
  }),
});

export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>['body'];
export type VerifyCompanyDto = z.infer<typeof verifyCompanySchema>['body'];
export type CompleteCompanyOnboardingDto = z.infer<typeof completeCompanyOnboardingSchema>['body'];
export type CreateWarehouseAddressDto = z.infer<typeof createWarehouseAddressSchema>['body'];
export type UpdateWarehouseAddressDto = z.infer<typeof updateWarehouseAddressSchema>['body'];
export type StaffRestrictionsDto = z.infer<typeof staffRestrictionsSchema>['body'];

