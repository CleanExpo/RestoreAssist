import React, { useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { LandingPage } from './LandingPage';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import type { UserData, GoogleLoginResponse, TrialActivationResponse } from '../types/auth';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface FreeTrialLandingProps {
  onTrialActivated: (userData: UserData) => void;
}

export function FreeTrialLanding({ onTrialActivated }: FreeTrialLandingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleOAuth, setShowGoogleOAuth] = useState(false);

  const handleLoginSuccess = async (googleCredential: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Google OAuth Login
      const loginResponse = await fetch(`${API_URL}/api/trial-auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: googleCredential,
          ipAddress: '', // Optional - backend will use req.ip
          userAgent: navigator.userAgent,
        }),
      });

      const loginData = await loginResponse.json() as GoogleLoginResponse;

      if (!loginData.success) {
        setError(loginData.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      // Store tokens
      // SECURITY TODO: Migrate these to httpOnly cookies to prevent XSS attacks
      // Currently keeping in localStorage to avoid breaking the auth flow
      // Phase 2 will implement secure cookie-based authentication
      localStorage.setItem('accessToken', loginData.tokens.accessToken);
      localStorage.setItem('refreshToken', loginData.tokens.refreshToken);
      localStorage.setItem('sessionToken', loginData.sessionToken); // Session tracking - less sensitive

      // Step 2: Generate device fingerprint
      const fingerprint = await generateDeviceFingerprint();

      // Step 3: Activate free trial
      const trialResponse = await fetch(`${API_URL}/api/trial-auth/activate-trial`, {
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
        setError(trialData.error || 'Failed to activate trial');

        // Show fraud flags if any
        if (trialData.fraudFlags && trialData.fraudFlags.length > 0) {
          console.error('Fraud detection flags:', trialData.fraudFlags);
          setError(`Trial activation denied: ${trialData.error}. Please contact support.`);
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
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  // Development-only bypass for screenshot capture
  // This code is tree-shaken out in production builds via import.meta.env.DEV check
  const handleDevLogin = import.meta.env.DEV
    ? () => {
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

        // Activate the mock trial
        onTrialActivated(mockUserData);
      }
    : undefined;

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
          <p className="text-gray-700">
            Google OAuth Client ID is not configured. Please add VITE_GOOGLE_CLIENT_ID to your .env file.
          </p>
        </div>
      </div>
    );
  }

  // If Google OAuth not loaded yet, show landing page without OAuth provider
  if (!showGoogleOAuth) {
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

  // Once user clicks sign up, load GoogleOAuthProvider
  return (
    <GoogleOAuthProvider
      clientId={GOOGLE_CLIENT_ID}
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

        {/* Error Modal */}
        {error && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-8 max-w-md">
              <h3 className="text-lg font-semibold text-red-600 mb-4">Trial Activation Failed</h3>
              <p className="text-gray-700 mb-6">{error}</p>
              <button
                onClick={() => setError(null)}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  );
}
