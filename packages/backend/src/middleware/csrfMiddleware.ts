import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * CSRF Protection Middleware
 * Implements synchronizer token pattern for CSRF protection
 */

interface CSRFToken {
  token: string;
  createdAt: number;
  used: boolean;
}

// Token storage (use Redis in production)
const csrfTokens = new Map<string, CSRFToken>();

// Token configuration
const TOKEN_EXPIRY = 30 * 60 * 1000; // 30 minutes
const TOKEN_LENGTH = 32;

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (now - value.createdAt > TOKEN_EXPIRY) {
      csrfTokens.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Generate a new CSRF token for a session
 */
export function generateCSRFToken(sessionId?: string): string {
  const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  const key = sessionId || token;

  csrfTokens.set(key, {
    token,
    createdAt: Date.now(),
    used: false
  });

  return token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string, sessionId?: string): boolean {
  if (!token) return false;

  // Check by session ID first, then by token itself
  const key = sessionId || token;
  const stored = csrfTokens.get(key) || csrfTokens.get(token);

  if (!stored) return false;

  const now = Date.now();

  // Check if token is expired
  if (now - stored.createdAt > TOKEN_EXPIRY) {
    csrfTokens.delete(key);
    return false;
  }

  // Check if token matches
  if (stored.token !== token) return false;

  // Token is valid
  return true;
}

/**
 * Middleware to generate and attach CSRF token to response
 */
export function csrfTokenGenerator(req: Request, res: Response, next: NextFunction) {
  // Generate new token
  const sessionId = (req as any).session?.id || req.ip;
  const token = generateCSRFToken(sessionId);

  // Attach to response locals for templates
  res.locals.csrfToken = token;

  // Send in response header for API calls
  res.setHeader('X-CSRF-Token', token);

  next();
}

/**
 * Middleware to validate CSRF token on state-changing requests
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for webhook endpoints (they have their own validation)
  if (req.path.includes('/webhook')) {
    return next();
  }

  // Get token from request
  const token = req.headers['x-csrf-token'] as string ||
                req.body?._csrf ||
                req.query?._csrf as string;

  // Get session ID
  const sessionId = (req as any).session?.id || req.ip;

  // Validate token
  if (!validateCSRFToken(token, sessionId)) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'Invalid or missing CSRF token'
    });
  }

  next();
}

/**
 * Express middleware configuration
 */
export default {
  generateToken: csrfTokenGenerator,
  validateToken: csrfProtection
};