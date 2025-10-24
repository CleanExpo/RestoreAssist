/**
 * Enhanced Authentication Middleware
 * Phase 1: HttpOnly cookie support with localStorage fallback
 *
 * Migration path:
 * 1. Support both httpOnly cookies AND Authorization header (current)
 * 2. Gradually move frontend to use cookies
 * 3. Eventually deprecate localStorage/header approach
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days for refresh token
  path: '/',
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000, // 15 minutes for access token
};

/**
 * Helper to set JWT tokens in httpOnly cookies
 */
export const setTokenCookies = (res: Response, accessToken: string, refreshToken?: string) => {
  // Set access token cookie
  res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS);

  // Set refresh token cookie if provided
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, COOKIE_OPTIONS);
  }

  // Also return tokens in response for backward compatibility
  return {
    accessToken,
    refreshToken,
    cookiesSet: true,
  };
};

/**
 * Helper to clear JWT cookies
 */
export const clearTokenCookies = (res: Response) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
};

/**
 * Enhanced authentication middleware
 * Checks both httpOnly cookies and Authorization header
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    let source: 'cookie' | 'header' | undefined;

    // 1. First check httpOnly cookie (preferred)
    if (req.cookies?.access_token) {
      token = req.cookies.access_token;
      source = 'cookie';
    }
    // 2. Fallback to Authorization header (for backward compatibility)
    else {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        if (headerValue.startsWith('Bearer ')) {
          token = headerValue.substring(7);
          source = 'header';
        }
      }
    }

    // No token found
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No valid authentication token provided',
        hint: 'Please login to continue',
      });
    }

    // Verify token
    const userPayload = authService.verifyAccessToken(token);

    // Attach user to request
    req.user = userPayload;

    // Add token source to request for logging
    (req as any).tokenSource = source;

    // Update last activity
    authService.updateLastLogin(userPayload.userId);

    // Log token source in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 Auth: User ${userPayload.userId} authenticated via ${source}`);
    }

    next();
  } catch (error) {
    // Check if token expired and we have a refresh token
    if (error instanceof jwt.TokenExpiredError && req.cookies?.refresh_token) {
      // Try to refresh automatically
      return handleTokenRefresh(req, res, next);
    }

    return res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid token',
      code: error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }
}

/**
 * Handle automatic token refresh using refresh token from cookie
 */
async function handleTokenRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Authentication expired',
        message: 'Please login again',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'secret') as any;
    const user = await authService.getUserById(decoded.userId);

    if (!user || (user as any).refreshToken !== refreshToken) {
      clearTokenCookies(res);
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Please login again',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    // Generate new tokens using authService methods
    const tokens = await authService.refreshAccessToken(refreshToken);

    // Set new cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    // Attach user to request
    req.user = {
      userId: (user as any).userId || (user as any).id,
      email: (user as any).email,
      name: (user as any).name || '',
      role: (user as any).role,
    };

    // Continue with request
    next();
  } catch (error) {
    clearTokenCookies(res);
    return res.status(401).json({
      error: 'Token refresh failed',
      message: 'Please login again',
      code: 'REFRESH_FAILED',
    });
  }
}

/**
 * Middleware to check if user has required role
 */
export function authorizeRole(...allowedRoles: string[]) {
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
        currentRole: req.user.role,
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
    let token: string | undefined;

    // Check cookie first
    if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    }
    // Fallback to header
    else {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        if (headerValue.startsWith('Bearer ')) {
          token = headerValue.substring(7);
        }
      }
    }

    if (token) {
      const userPayload = authService.verifyAccessToken(token);
      req.user = userPayload;
    }
  } catch (error) {
    // Ignore errors for optional auth
    // User remains undefined
  }

  next();
}

/**
 * Middleware to ensure cookies are parsed
 */
export function ensureCookieParser(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies) {
    console.warn('⚠️ Cookie parser not configured. HttpOnly cookie authentication will not work.');
  }
  next();
}

// Export legacy names for backward compatibility
export const authenticate = authenticateToken;
export const authorise = authorizeRole;