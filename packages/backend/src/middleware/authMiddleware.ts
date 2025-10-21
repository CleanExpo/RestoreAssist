import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { UserPayload } from '../types';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization header provided',
      });
    }

    // Normalize header to string (Express can return string[])
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    // Check if Bearer token
    if (!headerValue.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Invalid authorization format. Use: Bearer <token>',
      });
    }

    // Extract token
    const token = headerValue.substring(7);

    // Verify token
    const userPayload = authService.verifyAccessToken(token);

    // Attach user to request
    req.user = userPayload;

    // Update last activity
    authService.updateLastLogin(userPayload.userId);

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid token',
    });
  }
}

/**
 * Middleware to check if user has required role
 */
export function authorise(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      // Normalize header to string (Express can return string[])
      const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

      if (headerValue.startsWith('Bearer ')) {
        const token = headerValue.substring(7);
        const userPayload = authService.verifyAccessToken(token);
        req.user = userPayload;
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
}
