import prisma from '../../config/database';
import { User, Company } from '@prisma/client';

export interface OnboardingSteps {
  [stepName: string]: {
    completed: boolean;
    completedAt?: string;
  };
}

export const onboardingRepository = {
  async getUserOnboarding(userId: string): Promise<{ onboardingSteps: OnboardingSteps | null; onboardingCompleted: boolean } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingSteps: true,
        onboardingCompleted: true,
      },
    });

    if (!user) return null;

    return {
      onboardingSteps: user.onboardingSteps as OnboardingSteps | null,
      onboardingCompleted: user.onboardingCompleted,
    };
  },

  async updateUserOnboardingStep(
    userId: string,
    stepName: string,
    completed: boolean
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingSteps: true, role: true, companyId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentSteps = (user.onboardingSteps as OnboardingSteps) || {};
    const updatedSteps: OnboardingSteps = {
      ...currentSteps,
      [stepName]: {
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
      },
    };

    // Check if all required user steps are completed
    const requiredUserSteps = this.getRequiredUserSteps(user.role);
    const allUserStepsCompleted = requiredUserSteps.every(
      (step) => updatedSteps[step]?.completed === true
    );

    // For COMPANY_ADMIN and COMPANY_STAFF, also check company onboarding
    let finalOnboardingCompleted = allUserStepsCompleted;
    if ((user.role === 'COMPANY_ADMIN' || user.role === 'COMPANY_STAFF') && user.companyId) {
      const companyOnboarding = await this.getCompanyOnboarding(user.companyId);
      finalOnboardingCompleted = allUserStepsCompleted && (companyOnboarding?.onboardingCompleted ?? false);
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        onboardingSteps: updatedSteps,
        onboardingCompleted: finalOnboardingCompleted,
      },
    });
  },

  async getCompanyOnboarding(companyId: string): Promise<{ onboardingSteps: OnboardingSteps | null; onboardingCompleted: boolean } | null> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        onboardingSteps: true,
        onboardingCompleted: true,
      },
    });

    if (!company) return null;

    return {
      onboardingSteps: company.onboardingSteps as OnboardingSteps | null,
      onboardingCompleted: company.onboardingCompleted,
    };
  },

  async updateCompanyOnboardingStep(
    companyId: string,
    stepName: string,
    completed: boolean
  ): Promise<Company> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { onboardingSteps: true },
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const currentSteps = (company.onboardingSteps as OnboardingSteps) || {};
    const updatedSteps: OnboardingSteps = {
      ...currentSteps,
      [stepName]: {
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
      },
    };

    // Check if all required steps are completed
    const requiredSteps = this.getRequiredCompanySteps();
    const allStepsCompleted = requiredSteps.every(
      (step) => updatedSteps[step]?.completed === true
    );

    return prisma.company.update({
      where: { id: companyId },
      data: {
        onboardingSteps: updatedSteps,
        onboardingCompleted: allStepsCompleted,
      },
    });
  },

  async initializeUserOnboarding(userId: string, role: string): Promise<void> {
    const requiredSteps = this.getRequiredUserSteps(role);
    const initialSteps: OnboardingSteps = {};

    requiredSteps.forEach((step) => {
      initialSteps[step] = {
        completed: false,
      };
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingSteps: initialSteps,
        onboardingCompleted: false,
      },
    });
  },

  async initializeCompanyOnboarding(companyId: string): Promise<void> {
    const requiredSteps = this.getRequiredCompanySteps();
    const initialSteps: OnboardingSteps = {};

    // Initialize required steps
    requiredSteps.forEach((step) => {
      initialSteps[step] = {
        completed: false,
      };
    });

    // Also initialize optional step (first_shipment_slot) for tracking
    initialSteps['first_shipment_slot'] = {
      completed: false,
    };

    await prisma.company.update({
      where: { id: companyId },
      data: {
        onboardingSteps: initialSteps,
        onboardingCompleted: false,
      },
    });
  },

  getRequiredUserSteps(role?: string): string[] {
    const baseSteps = ['email_verification', 'profile_completion'];
    
    if (role === 'CUSTOMER') {
      return [...baseSteps, 'first_booking'];
    }
    
    return baseSteps;
  },

  getRequiredCompanySteps(): string[] {
    return [
      'company_profile',
      'payment_setup',
    ];
  },
};

