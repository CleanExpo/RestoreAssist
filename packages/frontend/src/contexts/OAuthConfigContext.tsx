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

  /**
   * Validates authentication configuration from backend
   */
  const validateConfig = async (): Promise<void> => {
    setConfig((prev) => ({ ...prev, isLoading: true }));

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

      // Log Configuration Status to Console
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
    } catch (error) {
      console.error('❌ Auth config validation failed:', error);
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