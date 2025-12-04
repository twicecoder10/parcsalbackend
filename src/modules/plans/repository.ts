import prisma from '../../config/database';
import { CompanyPlan } from '@prisma/client';

export const planRepository = {
  async findAll(): Promise<CompanyPlan[]> {
    return prisma.companyPlan.findMany({
      orderBy: {
        priceMonthly: 'asc',
      },
    });
  },

  async findById(id: string): Promise<CompanyPlan | null> {
    return prisma.companyPlan.findUnique({
      where: { id },
    });
  },

  async findDefault(): Promise<CompanyPlan | null> {
    return prisma.companyPlan.findFirst({
      where: { isDefault: true },
    });
  },
};

