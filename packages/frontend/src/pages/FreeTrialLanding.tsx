import React, { useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { LandingPage } from '../components/LandingPage';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface FreeTrialLandingProps {
  onTrialActivated: (userData: any) => void;
}

export function FreeTrialLanding({ onTrialActivated }: FreeTrialLandingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const loginData = await loginResponse.json();

      if (!loginData.success) {
        setError(loginData.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      // Store tokens
      localStorage.setItem('accessToken', loginData.tokens.accessToken);
      localStorage.setItem('refreshToken', loginData.tokens.refreshToken);
      localStorage.setItem('sessionToken', loginData.sessionToken);

      // Step 2: Generate device fingerprint
      const fingerprint = await generateDeviceFingerprint();

      // Step 3: Activate free trial
      const trialResponse = await fetch(`${API_URL}/api/trial-auth/activate-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorisation': `Bearer ${loginData.tokens.accessToken}`,
        },
        body: JSON.stringify({
          fingerprintHash: fingerprint.fingerprintHash,
          deviceData: fingerprint.deviceData,
          ipAddress: '',
          userAgent: navigator.userAgent,
        }),
      });

      const trialData = await trialResponse.json();

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
      onTrialActivated({
        user: loginData.user,
        trial: {
          tokenId: trialData.tokenId,
          reportsRemaining: trialData.reportsRemaining,
          expiresAt: trialData.expiresAt,
        },
      });

    } catch (error) {
      console.error('Trial activation error:', error);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

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

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="relative">
        <LandingPage onLoginSuccess={handleLoginSuccess} />

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
