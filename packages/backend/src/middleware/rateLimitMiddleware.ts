import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware for API endpoints
 * Protects against brute-force attacks and abuse
 */

/**
 * Strict rate limiter for authentication endpoints
 * Limits: 5 requests per 15 minutes per IP
 * Use for: /api/auth/login, /api/auth/register
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'You have exceeded the maximum number of login attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count all requests, even successful ones
  skipFailedRequests: false, // Count failed requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'You have exceeded the maximum number of login attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Medium rate limiter for password change and sensitive operations
 * Limits: 3 requests per 15 minutes per IP
 * Use for: /api/auth/change-password, /api/auth/forgot-password
 */
export const passwordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: {
    error: 'Too many password change attempts',
    message: 'You have exceeded the maximum number of password change attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many password change attempts',
      message: 'You have exceeded the maximum number of password change attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Moderate rate limiter for API endpoints
 * Limits: 100 requests per 15 minutes per IP
 * Use for: General API endpoints
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the maximum number of requests. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the maximum number of requests. Please try again later.',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Lenient rate limiter for token refresh
 * Limits: 20 requests per 15 minutes per IP
 * Use for: /api/auth/refresh
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    error: 'Too many token refresh attempts',
    message: 'You have exceeded the maximum number of token refresh attempts. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many token refresh attempts',
      message: 'You have exceeded the maximum number of token refresh attempts. Please try again later.',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Strict rate limiter for report generation
 * Limits: 30 reports per hour per IP
 * Use for: /api/reports (POST)
 */
export const reportGenerationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Limit each IP to 30 report generations per hour
  message: {
    error: 'Report generation limit exceeded',
    message: 'You have exceeded the maximum number of reports per hour. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Report generation limit exceeded',
      message: 'You have exceeded the maximum number of reports per hour. Please try again later.',
      retryAfter: '1 hour',
    });
  },
});

/**
 * Strict rate limiter for trial auth endpoints (Google OAuth)
 * Limits: 10 requests per 15 minutes per IP
 * Use for: /api/trial-auth/google
 */
export const trialAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many trial authentication attempts',
    message: 'You have exceeded the maximum number of trial authentication attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many trial authentication attempts',
      message: 'You have exceeded the maximum number of trial authentication attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
    });
  },
});
