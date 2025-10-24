/**
 * OAuth Security Utilities
 *
 * Provides security functions for OAuth implementation including:
 * - CSRF state generation and validation
 * - PKCE challenge generation
 * - Secure token validation
 * - XSS prevention utilities
 */

/**
 * Generate a cryptographically secure random state for CSRF protection
 */
export function generateOAuthState(): string {
  if (!window.crypto || !window.crypto.randomUUID) {
    throw new Error('Crypto API not available - cannot generate secure OAuth state');
  }
  return window.crypto.randomUUID();
}

/**
 * Generate PKCE challenge for OAuth 2.0
 * @returns code verifier and challenge for PKCE flow
 */
export async function generatePKCEChallenge(): Promise<{
  verifier: string;
  challenge: string;
}> {
  // Generate random verifier
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Generate challenge from verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { verifier, challenge };
}

/**
 * Validate OAuth state parameter for CSRF protection
 */
export function validateOAuthState(
  receivedState: string | null,
  expectedState: string | null
): boolean {
  if (!receivedState || !expectedState) {
    console.error('OAuth state validation failed: missing state');
    return false;
  }

  if (receivedState !== expectedState) {
    console.error('OAuth state mismatch - potential CSRF attack');
    return false;
  }

  return true;
}

/**
 * Sanitize redirect URLs to prevent open redirect vulnerabilities
 */
export function sanitizeRedirectUrl(url: string): string {
  const allowedDomains = [
    'https://restoreassist.app',
    'https://www.restoreassist.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ];

  try {
    const urlObj = new URL(url);
    const origin = urlObj.origin;

    if (!allowedDomains.includes(origin)) {
      console.error(`Redirect to unauthorized domain blocked: ${origin}`);
      return '/';
    }

    return url;
  } catch (error) {
    console.error('Invalid redirect URL:', error);
    return '/';
  }
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(expiresAt: number | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return Date.now() >= expiry;
}

/**
 * Secure token storage with expiration
 */
export class SecureTokenStorage {
  private static readonly TOKEN_KEY = 'auth_tokens';
  private static readonly USER_KEY = 'user_public';
  private static readonly EXPIRY_TIME = 15 * 60 * 1000; // 15 minutes

  static async storeTokens(tokens: {
    accessToken: string;
    refreshToken: string;
    sessionToken?: string;
  }): Promise<void> {
    // WARNING: This uses localStorage which is vulnerable to XSS
    // TODO: Implement httpOnly cookie storage
    console.warn('⚠️ Storing tokens in localStorage - vulnerable to XSS');

    const tokenData = {
      ...tokens,
      expiresAt: Date.now() + this.EXPIRY_TIME,
      timestamp: Date.now()
    };

    try {
      localStorage.setItem(this.TOKEN_KEY, JSON.stringify(tokenData));

      // Auto-clear after expiration
      setTimeout(() => {
        this.clearTokens();
      }, this.EXPIRY_TIME);
    } catch (error) {
      console.error('Failed to store tokens:', error);
      throw new Error('Token storage failed');
    }
  }

  static getTokens(): {
    accessToken: string;
    refreshToken: string;
    sessionToken?: string;
  } | null {
    try {
      const stored = localStorage.getItem(this.TOKEN_KEY);
      if (!stored) return null;

      const tokenData = JSON.parse(stored);

      // Check expiration
      if (isTokenExpired(tokenData.expiresAt)) {
        this.clearTokens();
        return null;
      }

      return {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        sessionToken: tokenData.sessionToken
      };
    } catch (error) {
      console.error('Failed to retrieve tokens:', error);
      return null;
    }
  }

  static clearTokens(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_nonce');
    sessionStorage.removeItem('pkce_verifier');
  }

  static storeUserInfo(user: {
    userId: string;
    email: string;
    name?: string;
    role?: string;
  }): void {
    // Store only non-sensitive user information
    const publicInfo = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role
    };

    localStorage.setItem(this.USER_KEY, JSON.stringify(publicInfo));
  }

  static getUserInfo(): any | null {
    try {
      const stored = localStorage.getItem(this.USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Content Security Policy configuration for OAuth pages
 */
export function getOAuthCSPHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com https://apis.google.com 'unsafe-inline'",
      "style-src 'self' https://accounts.google.com 'unsafe-inline'",
      "img-src 'self' https://*.googleusercontent.com https://accounts.google.com data:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://restoreassist.app",
      "frame-src https://accounts.google.com",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

/**
 * Validate Google OAuth client ID format
 */
export function validateGoogleClientId(clientId: string): boolean {
  // Google OAuth client IDs follow a specific pattern
  const pattern = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
  return pattern.test(clientId);
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeErrorMessage(error: Error | string): string {
  const errorStr = error instanceof Error ? error.message : error;

  // Map technical errors to user-friendly messages
  const errorMap: Record<string, string> = {
    'network': 'Network error. Please check your connection.',
    'token': 'Authentication failed. Please try again.',
    'expired': 'Session expired. Please sign in again.',
    'invalid': 'Invalid credentials. Please try again.',
    'forbidden': 'Access denied. Please contact support.',
    'server': 'Server error. Please try again later.'
  };

  for (const [key, message] of Object.entries(errorMap)) {
    if (errorStr.toLowerCase().includes(key)) {
      return message;
    }
  }

  // Generic error message for unknown errors
  return 'An error occurred. Please try again.';
}

export default {
  generateOAuthState,
  generatePKCEChallenge,
  validateOAuthState,
  sanitizeRedirectUrl,
  isTokenExpired,
  SecureTokenStorage,
  getOAuthCSPHeaders,
  validateGoogleClientId,
  sanitizeErrorMessage
};