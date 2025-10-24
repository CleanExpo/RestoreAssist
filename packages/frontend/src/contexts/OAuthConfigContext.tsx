/**
 * Authentication Configuration Context
 *
 * Validates authentication configuration at app startup and provides
 * auth state to all components via React Context.
 *
 * Features:
 * - Fetches backend auth config validation on mount
 * - Provides config state to components
 * - Email/password authentication only (Google OAuth removed)
 *
 * @module contexts/AuthConfigContext
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

/**
 * Backend auth config response structure
 */
interface BackendConfigResponse {
  auth_method: string;
  is_valid: boolean;
  allowed_origins: string[];
  config_status: 'ready' | 'misconfigured';
  message?: string;
}

/**
 * Authentication configuration state
 */
export interface AuthConfigState {
  isValid: boolean;
  authMethod: string;
  allowedOrigins: string[];
  isLoading: boolean;
  lastChecked: Date | null;
}

/**
 * Context value provided to consumers
 */
interface AuthConfigContextValue {
  config: AuthConfigState;
  recheckConfig: () => Promise<void>;
}

const AuthConfigContext = createContext<AuthConfigContextValue | undefined>(undefined);

/**
 * Authentication Configuration Provider
 *
 * Validates auth config on mount and provides state to child components.
 */
export const AuthConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AuthConfigState>({
    isValid: false,
    authMethod: 'email_password',
    allowedOrigins: [],
    isLoading: true,
    lastChecked: null,
  });

  const [error, setError] = useState<Error | null>(null);

  /**
   * Validates authentication configuration from backend
   */
  const validateConfig = async (): Promise<void> => {
    setConfig((prev) => ({ ...prev, isLoading: true }));
    setError(null);

    try {
      // Fetch Backend Configuration Validation
      let backendValidation: BackendConfigResponse | null = null;
      try {
        const apiUrl = getApiBaseUrl();
        const response = await fetch(`${apiUrl}/auth/config`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include credentials for CORS
        });

        if (response.ok) {
          backendValidation = await response.json();
        } else {
          console.error('❌ Backend config validation failed:', response.status, response.statusText);
        }
      } catch (fetchError) {
        console.error('❌ Failed to fetch backend config:', fetchError);
      }

      // Update config state
      const newConfig: AuthConfigState = {
        isValid: backendValidation?.is_valid ?? false,
        authMethod: backendValidation?.auth_method ?? 'email_password',
        allowedOrigins: backendValidation?.allowed_origins ?? [],
        isLoading: false,
        lastChecked: new Date(),
      };

      setConfig(newConfig);

      // Log Configuration Status to Console (development only)
      if (process.env.NODE_ENV === 'development') {
        console.group('🔐 Authentication Configuration');
        console.log('Timestamp:', new Date().toISOString());
        console.log('');

        if (backendValidation) {
          console.log('📊 Status:', backendValidation.config_status);
          console.log('🔑 Auth Method:', backendValidation.auth_method);
          if (backendValidation.message) {
            console.log('💬 Message:', backendValidation.message);
          }
          if (backendValidation.allowed_origins.length > 0) {
            console.log('🌐 Allowed Origins:', backendValidation.allowed_origins);
          }
        } else {
          console.log('⚠️  Could not reach backend - server may be offline');
        }

        console.groupEnd();
      }
    } catch (error) {
      console.error('❌ Auth config validation failed:', error);
      const errorObj = error instanceof Error ? error : new Error('Auth config validation failed');
      setError(errorObj);
      setConfig({
        isValid: false,
        authMethod: 'email_password',
        allowedOrigins: [],
        isLoading: false,
        lastChecked: new Date(),
      });
    }
  };

  // Validate config on mount
  useEffect(() => {
    validateConfig();
  }, []);

  const contextValue: AuthConfigContextValue = {
    config,
    recheckConfig: validateConfig,
  };

  // Show error state if auth config fails to load
  if (error && !config.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 p-4 rounded-full">
              <svg className="w-12 h-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">
            Configuration Error
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Unable to load authentication configuration. Please check your connection and try again.
          </p>
          <button
            onClick={validateConfig}
            className="w-full inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthConfigContext.Provider value={contextValue}>
      {children}
    </AuthConfigContext.Provider>
  );
};

/**
 * Hook to access authentication configuration state
 *
 * @returns Auth config state and recheck function
 * @throws Error if used outside AuthConfigProvider
 *
 * @example
 * const { config, recheckConfig } = useAuthConfig();
 *
 * if (!config.isValid) {
 *   return <div>Authentication is misconfigured.</div>;
 * }
 */
export const useAuthConfig = (): AuthConfigContextValue => {
  const context = useContext(AuthConfigContext);

  if (!context) {
    throw new Error('useAuthConfig must be used within AuthConfigProvider');
  }

  return context;
};

// Keep old names for backward compatibility during transition
export const OAuthConfigProvider = AuthConfigProvider;
export const useOAuthConfig = useAuthConfig;
export type OAuthConfigState = AuthConfigState;

export default AuthConfigContext;