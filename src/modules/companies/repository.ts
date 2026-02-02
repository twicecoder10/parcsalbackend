import prisma from '../../config/database';
import { Company } from '@prisma/client';
import { PaginationParams } from '../../utils/pagination';

export interface UpdateCompanyData {
  name?: string;
  description?: string | null;
  country?: string;
  city?: string;
  website?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  state?: string | null;
  postalCode?: string | null;
  onboardingCompleted?: boolean;
}

export const companyRepository = {
  async findById(id: string): Promise<Company | null> {
    return prisma.company.findUnique({
      where: { id },
      include: {
        activePlan: true,
      },
    });
  },

  async findBySlug(slug: string): Promise<Company | null> {
    return prisma.company.findUnique({
      where: { slug },
      include: {
        activePlan: true,
      },
    });
  },

  async findByUserId(userId: string): Promise<Company | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            activePlan: true,
          },
        },
      },
    });

    return user?.company || null;
  },

  async update(id: string, data: UpdateCompanyData): Promise<Company> {
    return prisma.company.update({
      where: { id },
      data,
      include: {
        activePlan: true,
      },
    });
  },

  async listAll(
    params: PaginationParams & { isVerified?: boolean }
  ): Promise<{ companies: Company[]; total: number }> {
    const where = params.isVerified !== undefined ? { isVerified: params.isVerified } : {};

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip: params.offset,
        take: params.limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          activePlan: true,
        },
      }),
      prisma.company.count({ where }),
    ]);

    return { companies, total };
  },

  async verify(id: string, isVerified: boolean): Promise<Company> {
    return prisma.company.update({
      where: { id },
      data: { isVerified },
      include: {
        activePlan: true,
      },
    });
  },
};

