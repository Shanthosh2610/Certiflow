import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { Role } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    districtId?: string | null;
    trainingCentreId?: string | null;
  };
}

/**
 * Middleware to authenticate user via Header:
 * Accepts either:
 * - 'x-user-id': ID or Email of demo user (Anika, Dev, Meera, Kabir, Neha, Farah)
 * - Authorization: Bearer <token> (JWT fallback)
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userIdHeader = req.headers['x-user-id'] as string | undefined;
    const authHeader = req.headers['authorization'];

    let user = null;

    if (userIdHeader) {
      user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userIdHeader }, { email: userIdHeader }],
        },
      });
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // In hackathon mode, bearer token can be email or user ID directly
      user = await prisma.user.findFirst({
        where: {
          OR: [{ id: token }, { email: token }],
        },
      });
    }

    if (!user) {
      // Default to demo persona if none specified, or reject
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required. Provide "x-user-id" header.' },
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      districtId: user.districtId,
      trainingCentreId: user.trainingCentreId,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * RBAC Guard Middleware: Enforces that active user has one of allowed roles
 */
export const requireRoles = (...allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unauthorized. Authentication required.' },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Forbidden: Role "${req.user.role}" does not have permission for this action. Required: ${allowedRoles.join(', ')}`,
        },
      });
    }

    next();
  };
};
