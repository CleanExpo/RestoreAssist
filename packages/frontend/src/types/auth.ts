/**
 * Authentication and user data type definitions
 */

/**
 * User authentication data returned from the backend
 */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'trial';
  emailVerified: boolean;
}

/**
 * Trial subscription data
 */
export interface TrialData {
  tokenId: string;
  reportsRemaining: number;
  expiresAt: string;
}

/**
 * Complete user data with trial information
 * Passed to onTrialActivated callback after successful authentication
 */
export interface UserData {
  user: AuthUser;
  trial: TrialData;
}

/**
 * JWT tokens returned from authentication
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Google OAuth login response
 */
export interface GoogleLoginResponse {
  success: boolean;
  user: AuthUser;
  tokens: AuthTokens;
  sessionToken: string;
  error?: string;
}

/**
 * Trial activation response
 */
export interface TrialActivationResponse {
  success: boolean;
  tokenId: string;
  reportsRemaining: number;
  expiresAt: string;
  error?: string;
  fraudFlags?: string[];
}

/**
 * Device fingerprint data for fraud detection
 */
export interface DeviceFingerprint {
  fingerprintHash: string;
  deviceData: {
    userAgent: string;
    platform: string;
    language: string;
    screenResolution: string;
    timezone: string;
    [key: string]: string | number | boolean;
  };
}
