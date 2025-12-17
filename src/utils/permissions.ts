import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ForbiddenError } from './errors';
import prisma from '../config/database';

/**
 * Check if a user has permission to perform a specific action
 * Admins always have permission, staff are checked against company restrictions
 */
export async function checkStaffPermission(
  req: AuthRequest,
  action: string
): Promise<void> {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  // Admins and super admins always have permission
  if (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'SUPER_ADMIN') {
    return;
  }

  // Only check restrictions for staff
  if (req.user.role !== 'COMPANY_STAFF') {
    return; // Other roles (like CUSTOMER) are handled by route-level middleware
  }

  if (!req.user.companyId) {
    throw new ForbiddenError('User must be associated with a company');
  }

  // Get user-specific restrictions
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { restrictions: true },
  });

  if (!user) {
    throw new ForbiddenError('User not found');
  }

  const restrictions = (user.restrictions as Record<string, boolean> | null) || {};

  // If the action is explicitly set to false, deny access
  if (restrictions[action] === false) {
    throw new ForbiddenError(`You do not have permission to ${action}`);
  }

  // If not explicitly set or set to true, allow access
  // Default behavior is to allow (restrictions are opt-in for disabling)
}

/**
 * Middleware factory to check staff permissions for a specific action
 */
export function requireStaffPermission(action: string) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await checkStaffPermission(req, action);
      next();
    } catch (error) {
      next(error);
    }
  };
}

