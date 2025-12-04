import { onboardingRepository, OnboardingSteps } from './repository';
import { CompleteOnboardingStepDto, GetOnboardingStatusDto } from './dto';
import { AuthRequest } from '../../middleware/auth';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import prisma from '../../config/database';

export const onboardingService = {
  async getOnboardingStatus(req: AuthRequest, query: GetOnboardingStatusDto) {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const type = query.type || 'user';
    let result;

    if (type === 'user') {
      result = await onboardingRepository.getUserOnboarding(req.user.id);
      if (!result) {
        throw new NotFoundError('User not found');
      }
    } else if (type === 'company') {
      if (!req.user.companyId) {
        throw new ForbiddenError('User is not associated with a company');
      }
      result = await onboardingRepository.getCompanyOnboarding(req.user.companyId);
      if (!result) {
        throw new NotFoundError('Company not found');
      }
    } else {
      throw new BadRequestError('Invalid type. Must be "user" or "company"');
    }

    return {
      steps: result.onboardingSteps || {},
      completed: result.onboardingCompleted,
      progress: this.calculateProgress(result.onboardingSteps, type, req.user.role),
    };
  },

  async completeStep(req: AuthRequest, dto: CompleteOnboardingStepDto) {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { step } = dto;

    // Validate step name
    const validUserSteps = onboardingRepository.getRequiredUserSteps(req.user.role);
    const validCompanySteps = onboardingRepository.getRequiredCompanySteps();
    const allValidSteps = [...validUserSteps, ...validCompanySteps];

    if (!allValidSteps.includes(step)) {
      throw new BadRequestError(`Invalid step name. Valid steps are: ${allValidSteps.join(', ')}`);
    }

    // Determine if it's a user step or company step
    const isUserStep = validUserSteps.includes(step);
    const isCompanyStep = validCompanySteps.includes(step);

    if (isUserStep) {
      await onboardingRepository.updateUserOnboardingStep(req.user.id, step, true);
    }

    if (isCompanyStep) {
      if (!req.user.companyId) {
        throw new ForbiddenError('User is not associated with a company');
      }
      // Check if user has permission to update company onboarding
      if (req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Only company admins can update company onboarding');
      }
      await onboardingRepository.updateCompanyOnboardingStep(req.user.companyId, step, true);
    }

    // For COMPANY_ADMIN users, check if both user and company onboarding are complete
    // If so, update the user's onboardingCompleted field
    if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'COMPANY_STAFF') {
      if (req.user.companyId) {
        const userOnboarding = await onboardingRepository.getUserOnboarding(req.user.id);
        const companyOnboarding = await onboardingRepository.getCompanyOnboarding(req.user.companyId);

        if (userOnboarding?.onboardingCompleted && companyOnboarding?.onboardingCompleted) {
          // Both are complete, update user's onboardingCompleted
          await prisma.user.update({
            where: { id: req.user.id },
            data: { onboardingCompleted: true },
          });
        } else {
          // Not both complete, ensure user's onboardingCompleted is false
          await prisma.user.update({
            where: { id: req.user.id },
            data: { onboardingCompleted: false },
          });
        }
      }
    }

    // Get updated status
    return this.getOnboardingStatus(req, { type: isUserStep ? 'user' : 'company' });
  },

  calculateProgress(steps: OnboardingSteps | null, type: string, role?: string): number {
    if (!steps) return 0;

    const requiredSteps =
      type === 'user'
        ? onboardingRepository.getRequiredUserSteps(role)
        : onboardingRepository.getRequiredCompanySteps();

    if (requiredSteps.length === 0) return 100;

    const completedSteps = requiredSteps.filter((step) => steps[step]?.completed === true);
    return Math.round((completedSteps.length / requiredSteps.length) * 100);
  },
};

