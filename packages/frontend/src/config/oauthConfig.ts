/**
 * OAuth Configuration
 *
 * Centralized configuration for Google OAuth with security best practices
 */

// Environment-based configuration
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/**
 * Google OAuth Configuration
 */
export const GOOGLE_OAUTH_CONFIG = {
  // Client ID from environment variable
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // Redirect URIs based on environment
  redirectUri: isProduction
    ? 'https://restoreassist.app'
    : isDevelopment
    ? 'http://localhost:5173'
    : window.location.origin,

  // OAuth scopes - minimal required
  scopes: [
    'openid',
    'profile',
    'email'
  ].join(' '),

  // Security settings
  responseType: 'id_token',
  accessType: 'online',
  prompt: 'select_account',

  // Disable One Tap for security
  useOneTap: false,
  autoSelect: false,

  // Cookie configuration for state
  stateCookieDomain: isProduction ? '.restoreassist.app' : undefined,

  // Additional security settings
  uxMode: 'popup',
  cookiePolicy: 'single_host_origin',

  // Hosted domain restriction (optional)
  hostedDomain: undefined,

  // Login hint (optional)
  loginHint: undefined
};

/**
 * OAuth Security Configuration
 */
export const OAUTH_SECURITY_CONFIG = {
  // State parameter settings
  stateExpiration: 10 * 60 * 1000, // 10 minutes

  // Token expiration settings
  accessTokenExpiration: 15 * 60 * 1000, // 15 minutes
  refreshTokenExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days

  // PKCE settings
  enablePKCE: true,

  // Storage settings
  useSecureStorage: isProduction, // Use secure storage in production

  // CSRF protection
  requireStateValidation: true,

  // XSS protection
  sanitizeTokens: true,

  // Rate limiting
  maxRetries: 3,
  retryDelay: 2000,

  // Allowed redirect domains
  allowedRedirectDomains: [
    'https://restoreassist.app',
    'https://www.restoreassist.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ]
};

/**
 * Validate OAuth configuration
 */
export function validateOAuthConfig(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check client ID
  if (!GOOGLE_OAUTH_CONFIG.clientId) {
    errors.push('Google OAuth Client ID is not configured');
  } else if (!GOOGLE_OAUTH_CONFIG.clientId.endsWith('.apps.googleusercontent.com')) {
    errors.push('Invalid Google OAuth Client ID format');
  }

  // Check redirect URI
  if (!GOOGLE_OAUTH_CONFIG.redirectUri) {
    errors.push('OAuth redirect URI is not configured');
  }

  // Production-specific checks
  if (isProduction) {
    if (!GOOGLE_OAUTH_CONFIG.redirectUri.startsWith('https://')) {
      errors.push('Production redirect URI must use HTTPS');
    }

    if (!OAUTH_SECURITY_CONFIG.useSecureStorage) {
      errors.push('Secure storage must be enabled in production');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get Content Security Policy for OAuth pages
 */
export function getOAuthCSP(): string {
  const policies = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com https://apis.google.com",
    "style-src 'self' https://accounts.google.com 'unsafe-inline'",
    "img-src 'self' https://*.googleusercontent.com https://accounts.google.com data:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://restoreassist.app",
    "frame-src https://accounts.google.com",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'"
  ];

  if (isProduction) {
    policies.push('upgrade-insecure-requests');
  }

  return policies.join('; ');
}

/**
 * Security headers for OAuth pages
 */
export const OAUTH_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

export default {
  GOOGLE_OAUTH_CONFIG,
  OAUTH_SECURITY_CONFIG,
  validateOAuthConfig,
  getOAuthCSP,
  OAUTH_SECURITY_HEADERS
};