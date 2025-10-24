import React, { useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { LandingPage } from './LandingPage';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { ErrorMessage } from '../components/ErrorMessage';
import { mapOAuthError, type OAuthError, type MappedOAuthError } from '../utils/oauthErrorMapper';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { useOAuthConfig } from '../contexts/OAuthConfigContext';
import type { UserData, GoogleLoginResponse, TrialActivationResponse } from '../types/auth';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_BASE_URL = getApiBaseUrl();

// Security: Ensure redirect URI matches production domain
const REDIRECT_URI = import.meta.env.PROD
  ? 'https://restoreassist.app'
  : window.location.origin;

interface FreeTrialLandingProps {
  onTrialActivated: (userData: UserData) => void;
}

export function FreeTrialLanding({ onTrialActivated }: FreeTrialLandingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<OAuthError | string | null>(null);
  const [mappedError, setMappedError] = useState<MappedOAuthError | null>(null);
  const [showGoogleOAuth, setShowGoogleOAuth] = useState(false);
  const { config: oauthConfig } = useOAuthConfig();

  /**
   * Handle error with automatic OAuth error mapping
   */
  const handleError = (errorInput: OAuthError | string) => {
    setError(errorInput);
    const mapped = mapOAuthError(errorInput);
    setMappedError(mapped);
  };

  /**
   * Clear error state
   */
  const clearError = () => {
    setError(null);
    setMappedError(null);
  };

  /**
   * Retry authentication flow
   */
  const retryAuth = () => {
    clearError();
    // The user will need to click the Google OAuth button again
  };

  const handleLoginSuccess = async (googleCredential: string) => {
    setIsLoading(true);
    clearError();

    try {
      // Step 1: Google OAuth Login
      const loginResponse = await fetch(`${API_BASE_URL}/trial-auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: googleCredential,
          ipAddress: '', // Optional - backend will use req.ip
          userAgent: navigator.userAgent,
        }),
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        let errorMessage = 'Login failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        handleError(errorMessage);
        setIsLoading(false);
        return;
      }

      const loginData = await loginResponse.json() as GoogleLoginResponse;

      if (!loginData.success) {
        handleError(loginData.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      // Store tokens and user data
      // CRITICAL SECURITY WARNING: Tokens should be stored in httpOnly cookies
      // localStorage is vulnerable to XSS attacks. This is a temporary implementation.
      // TODO: Implement secure httpOnly cookie storage in backend with:
      // - SameSite=Strict for CSRF protection
      // - Secure flag for HTTPS-only transmission
      // - Short expiration times with refresh token rotation

      // Log security warning in development
      if (import.meta.env.DEV) {
        console.warn('⚠️ SECURITY: Storing tokens in localStorage is vulnerable to XSS attacks');
        console.warn('📝 TODO: Migrate to httpOnly cookies for production deployment');
      }

      // Temporary token storage with XSS mitigation attempts
      try {
        // Add token expiration metadata
        const tokenExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes
        const secureTokenData = {
          accessToken: loginData.tokens.accessToken,
          refreshToken: loginData.tokens.refreshToken,
          sessionToken: loginData.sessionToken,
          expiresAt: tokenExpiry,
          fingerprint: (await generateDeviceFingerprint()).fingerprintHash
        };

        // Store with expiration check
        localStorage.setItem('auth_tokens', JSON.stringify(secureTokenData));

        // Set up automatic token cleanup
        setTimeout(() => {
          localStorage.removeItem('auth_tokens');
          console.log('Tokens expired and removed from storage');
        }, 15 * 60 * 1000);

        // Store non-sensitive user info separately
        const publicUserInfo = {
          userId: loginData.user.userId,
          email: loginData.user.email,
          name: loginData.user.name || '',
          role: loginData.user.role
        };
        localStorage.setItem('user_public', JSON.stringify(publicUserInfo));

      } catch (storageError) {
        console.error('Failed to store authentication data:', storageError);
        handleError('Failed to save authentication data. Please try again.');
        return;
      }

      // Step 2: Generate device fingerprint
      const fingerprint = await generateDeviceFingerprint();

      // Step 3: Activate free trial
      const trialResponse = await fetch(`${API_BASE_URL}/trial-auth/activate-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.tokens.accessToken}`,
        },
        body: JSON.stringify({
          fingerprintHash: fingerprint.fingerprintHash,
          deviceData: fingerprint.deviceData,
          ipAddress: '',
          userAgent: navigator.userAgent,
        }),
      });

      const trialData = await trialResponse.json() as TrialActivationResponse;

      if (!trialData.success) {
        // Show fraud flags if any
        if (trialData.fraudFlags && trialData.fraudFlags.length > 0) {
          console.error('Fraud detection flags:', trialData.fraudFlags);
          handleError(`Trial activation denied: ${trialData.error}. Please contact support.`);
        } else {
          handleError(trialData.error || 'Failed to activate trial');
        }

        setIsLoading(false);
        return;
      }

      // Success! Pass user data to parent component
      const userData: UserData = {
        user: loginData.user,
        trial: {
          tokenId: trialData.tokenId,
          reportsRemaining: trialData.reportsRemaining,
          expiresAt: trialData.expiresAt,
        },
      };

      onTrialActivated(userData);

    } catch (error) {
      console.error('Trial activation error:', error);

      // Extract error message if available
      let errorMessage = 'An unexpected error occurred during sign-in. Please try again.';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      handleError(errorMessage);
      setIsLoading(false);
    }
  };

  // Development-only bypass for screenshot capture
  // This code is tree-shaken out in production builds via import.meta.env.DEV check
  const handleDevLogin = import.meta.env.DEV
    ? async () => {
        // Only allow on localhost for security
        if (!window.location.hostname.includes('localhost')) {
          console.error('Dev login only works on localhost');
          return;
        }

        console.log('🚀 DEV MODE: Bypassing Google OAuth for screenshot capture');

        // Create mock tokens
        const mockAccessToken = `dev-access-token-${Date.now()}`;
        const mockRefreshToken = `dev-refresh-token-${Date.now()}`;
        const mockSessionToken = `dev-session-${Date.now()}`;

        // Store mock tokens in localStorage
        localStorage.setItem('accessToken', mockAccessToken);
        localStorage.setItem('refreshToken', mockRefreshToken);
        localStorage.setItem('sessionToken', mockSessionToken);

        // SECURITY: API keys should NEVER be stored in localStorage
        // This was previously storing a mock API key for screenshot testing
        // TODO: Implement secure httpOnly cookie-based authentication for API keys
        // For now, the UI will show "not set" for API keys during dev mode testing
        console.log('🔒 SECURITY: API key storage in localStorage has been removed');
        console.log('📝 TODO: Implement httpOnly cookie authentication for sensitive credentials');

        // Create mock user data with trial
        const mockUserData: UserData = {
          user: {
            userId: 'dev-user-001',
            email: 'dev@restoreassist.com',
            name: 'Dev User (Screenshot Mode)',
            role: 'user',
            emailVerified: true,
          },
          trial: {
            tokenId: 'dev-trial-token-001',
            reportsRemaining: 100, // Plenty for screenshots
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
          },
        };

        console.log('✅ DEV MODE: Mock authentication successful', mockUserData);
        console.log('🔄 DEV MODE: Calling onTrialActivated to trigger dashboard redirect...');

        // Small delay to ensure state updates properly
        await new Promise(resolve => setTimeout(resolve, 100));

        // Activate the mock trial
        onTrialActivated(mockUserData);

        console.log('✅ DEV MODE: onTrialActivated called successfully');
      }
    : undefined;

  // If Google OAuth is not configured on backend, show landing page without OAuth provider
  // This allows email/password flow to work independently
  const shouldUseGoogleOAuth = GOOGLE_CLIENT_ID && oauthConfig.isValid && showGoogleOAuth;

  // If Google OAuth not loaded yet or not configured, show landing page without OAuth provider
  if (!shouldUseGoogleOAuth) {
    return (
      <div className="relative">
        <LandingPage
          onLoginSuccess={handleLoginSuccess}
          onDevLogin={handleDevLogin}
          onShowGoogleOAuth={() => setShowGoogleOAuth(true)}
        />
      </div>
    );
  }

  // Once user clicks sign up AND OAuth is configured, load GoogleOAuthProvider
  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID!}
      onScriptLoadError={() => console.error('Google OAuth script failed to load')}
      onScriptLoadSuccess={() => {
        // CRITICAL: Disable Google One Tap immediately when script loads
        if (window.google?.accounts?.id) {
          window.google.accounts.id.disableAutoSelect();
          window.google.accounts.id.cancel();
        }
      }}
    >
      <div className="relative">
        <LandingPage
          onLoginSuccess={handleLoginSuccess}
          onDevLogin={handleDevLogin}
          onShowGoogleOAuth={() => setShowGoogleOAuth(true)}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-8 max-w-md text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold mb-2">Activating Your Free Trial</h3>
              <p className="text-gray-600">Please wait while we set up your account...</p>
            </div>
          </div>
        )}

        {/* Error Modal with OAuth Error Mapping */}
        {mappedError && error && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <ErrorMessage
                error={mappedError}
                originalError={error}
                onRetry={retryAuth}
                onDismiss={clearError}
                showCacheGuidance={true}
                className="shadow-none border-0"
              />
            </div>
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  );
}
