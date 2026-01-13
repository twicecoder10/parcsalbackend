/**
 * Entitlements Middleware
 * 
 * Reusable middleware for feature gating based on company plans
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import prisma from '../config/database';
import { getPlanEntitlements, PlanEntitlements, AnalyticsLevel } from '../modules/billing/plans';
import { CarrierPlan } from '@prisma/client';

/**
 * Get company from auth context
 */
async function getCompanyFromAuth(req: AuthRequest) {
  if (!req.user || !req.user.companyId) {
    throw new ForbiddenError('User must be associated with a company');
  }

  const company = await prisma.company.findUnique({
    where: { id: req.user.companyId },
    select: {
      id: true,
      plan: true,
      planActive: true,
      commissionRateBps: true,
      rankingTier: true,
    },
  });

  if (!company) {
    throw new NotFoundError('Company not found');
  }

  if (!company.planActive) {
    throw new ForbiddenError('Company plan is not active');
  }

  return company;
}

/**
 * Require a specific plan feature
 */
export function requireCompanyPlanFeature(featureKey: keyof PlanEntitlements) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const company = await getCompanyFromAuth(req);
      const entitlements = getPlanEntitlements(company.plan);

      const featureValue = entitlements[featureKey];

      // Handle boolean features
      if (typeof featureValue === 'boolean') {
        if (!featureValue) {
          const planName = company.plan === 'FREE' ? 'Starter' : 
                          company.plan === 'STARTER' ? 'Professional' : 'Enterprise';
          throw new ForbiddenError(
            `This feature requires ${planName} plan or higher.`
          );
        }
        return next();
      }

      // For non-boolean features, just check if it's truthy
      if (!featureValue) {
        throw new ForbiddenError('This feature is not available on your plan.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require minimum plan level
 */
export function requirePlan(minPlan: CarrierPlan) {
  const planOrder: CarrierPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
  
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const company = await getCompanyFromAuth(req);
      const currentPlanIndex = planOrder.indexOf(company.plan);
      const minPlanIndex = planOrder.indexOf(minPlan);

      if (currentPlanIndex < minPlanIndex) {
        throw new ForbiddenError(
          `This feature requires ${minPlan} plan or higher.`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require minimum analytics level
 */
export function requireAnalyticsLevel(minLevel: AnalyticsLevel) {
  const levelOrder: AnalyticsLevel[] = ['BASIC', 'ENHANCED', 'FULL', 'CUSTOM'];
  
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const company = await getCompanyFromAuth(req);
      const entitlements = getPlanEntitlements(company.plan);
      const currentLevelIndex = levelOrder.indexOf(entitlements.analyticsLevel);
      const minLevelIndex = levelOrder.indexOf(minLevel);

      if (currentLevelIndex < minLevelIndex) {
        throw new ForbiddenError(
          `This analytics feature requires ${minLevel} level or higher.`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require team member limit check (used in service layer, not middleware)
 */
export async function checkTeamMemberLimit(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true, planActive: true },
  });

  if (!company || !company.planActive) {
    throw new ForbiddenError('Company plan is not active');
  }

  const entitlements = getPlanEntitlements(company.plan);
  
  if (entitlements.maxTeamMembers === Infinity) {
    return; // Unlimited
  }

  const currentTeamCount = await prisma.user.count({
    where: {
      companyId,
      role: {
        in: ['COMPANY_ADMIN', 'COMPANY_STAFF'],
      },
    },
  });

  const pendingInvitationsCount = await prisma.teamInvitation.count({
    where: {
      companyId,
      status: 'PENDING',
    },
  });

  const total = currentTeamCount + pendingInvitationsCount;

  if (total >= entitlements.maxTeamMembers) {
    const planName = company.plan === 'FREE' ? 'Starter' : 
                    company.plan === 'STARTER' ? 'Professional' : 'Enterprise';
    throw new ForbiddenError(
      `Team member limit reached. Maximum ${entitlements.maxTeamMembers} team members allowed on ${company.plan} plan. Upgrade to ${planName} plan for more team members.`
    );
  }
}

/**
 * Convenience middleware exports
 */
export const requireSlotTemplates = requireCompanyPlanFeature('canUseSlotTemplates');
export const requireAdvancedSlotRules = requireCompanyPlanFeature('canUseAdvancedSlotRules');
export const requireScanWarehouses = requireCompanyPlanFeature('canAccessScanWarehouses');

