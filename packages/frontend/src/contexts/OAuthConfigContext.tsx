/**
 * OAuth Configuration Context
 *
 * Validates Google OAuth configuration at app startup and provides
 * config state to all components via React Context.
 *
 * Features:
 * - Fetches backend config validation on mount
 * - Validates frontend VITE_GOOGLE_CLIENT_ID
 * - Logs validation results to console
 * - Provides config state to disable OAuth buttons if misconfigured
 *
 * @module contexts/OAuthConfigContext
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  validateCurrentOAuthConfig,
  formatValidationErrors,
  ConfigValidationResult,
} from '../utils/configValidator';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

/**
 * Backend config response structure
 */
interface BackendConfigResponse {
  client_id?: string;
  is_valid: boolean;
  allowed_origins: string[];
  errors: string[];
  warnings: string[];
  config_status: 'ready' | 'misconfigured';
}

/**
 * Combined OAuth configuration state
 */
export interface OAuthConfigState {
  frontendValid: boolean;
  backendValid: boolean;
  isFullyValid: boolean;
  frontendErrors: string[];
  backendErrors: string[];
  frontendWarnings: string[];
  backendWarnings: string[];
  isLoading: boolean;
  lastChecked: Date | null;
}

/**
 * Context value provided to consumers
 */
interface OAuthConfigContextValue {
  config: OAuthConfigState;
  recheckConfig: () => Promise<void>;
}

const OAuthConfigContext = createContext<OAuthConfigContextValue | undefined>(undefined);

/**
 * OAuth Configuration Provider
 *
 * Validates OAuth config on mount and provides state to child components.
 */
export const OAuthConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<OAuthConfigState>({
    frontendValid: false,
    backendValid: false,
    isFullyValid: false,
    frontendErrors: [],
    backendErrors: [],
    frontendWarnings: [],
    backendWarnings: [],
    isLoading: true,
    lastChecked: null,
  });

  /**
   * Validates OAuth configuration from both frontend and backend
   */
  const validateConfig = async (): Promise<void> => {
    setConfig((prev) => ({ ...prev, isLoading: true }));

    try {
      // 1. Validate Frontend Configuration
      const frontendValidation: ConfigValidationResult = validateCurrentOAuthConfig();

      // 2. Fetch Backend Configuration Validation
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

      // 3. Combine Results
      const frontendValid = frontendValidation.isValid;
      const backendValid = backendValidation?.is_valid ?? false;
      const isFullyValid = frontendValid && backendValid;

      const newConfig: OAuthConfigState = {
        frontendValid,
        backendValid,
        isFullyValid,
        frontendErrors: frontendValidation.errors,
        backendErrors: backendValidation?.errors ?? [],
        frontendWarnings: frontendValidation.warnings,
        backendWarnings: backendValidation?.warnings ?? [],
        isLoading: false,
        lastChecked: new Date(),
      };

      setConfig(newConfig);

      // 4. Log Configuration Status to Console
      console.group('🔐 OAuth Configuration Validation');
      console.log('Timestamp:', new Date().toISOString());
      console.log('');

      // Frontend Validation
      console.log('📱 Frontend Configuration:');
      if (frontendValid) {
        console.log('  ✅ Valid - VITE_GOOGLE_CLIENT_ID is properly configured');
      } else {
        console.log('  ❌ Invalid - Frontend configuration errors detected');
        frontendValidation.errors.forEach((error, idx) => {
          console.log(`    ${idx + 1}. ${error}`);
        });
      }

      if (frontendValidation.warnings.length > 0) {
        console.log('  ⚠️  Warnings:');
        frontendValidation.warnings.forEach((warning, idx) => {
          console.log(`    ${idx + 1}. ${warning}`);
        });
      }
      console.log('');

      // Backend Validation
      console.log('🖥️  Backend Configuration:');
      if (backendValidation) {
        if (backendValid) {
          console.log('  ✅ Valid - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are properly configured');
          console.log(`  Client ID Preview: ${backendValidation.client_id || 'N/A'}`);
        } else {
          console.log('  ❌ Invalid - Backend configuration errors detected');
          backendValidation.errors.forEach((error, idx) => {
            console.log(`    ${idx + 1}. ${error}`);
          });
        }

        if (backendValidation.warnings.length > 0) {
          console.log('  ⚠️  Warnings:');
          backendValidation.warnings.forEach((warning, idx) => {
            console.log(`    ${idx + 1}. ${warning}`);
          });
        }

        if (backendValidation.allowed_origins.length > 0) {
          console.log('  Allowed Origins:', backendValidation.allowed_origins);
        }
      } else {
        console.log('  ⚠️  Could not reach backend - server may be offline');
      }
      console.log('');

      // Overall Status
      console.log('📊 Overall Status:');
      if (isFullyValid) {
        console.log('  ✅ OAuth Authentication: Ready');
        console.log('  "Sign in with Google" buttons are enabled and functional');
      } else {
        console.log('  ❌ OAuth Authentication: Misconfigured');
        console.log('  "Sign in with Google" buttons may not work correctly');
        console.log('');
        console.log('  🔧 Troubleshooting Steps:');
        console.log('    1. Verify VITE_GOOGLE_CLIENT_ID in packages/frontend/.env.local');
        console.log('    2. Verify GOOGLE_CLIENT_ID in packages/backend/.env.local');
        console.log('    3. Verify GOOGLE_CLIENT_SECRET in packages/backend/.env.local');
        console.log('    4. Check Client ID format: [numbers]-[random].apps.googleusercontent.com');
        console.log('    5. Ensure credentials are from Google Cloud Console: https://console.cloud.google.com/apis/credentials');
        console.log('');
        console.log('  📚 Documentation: https://docs.restoreassist.com/troubleshooting/oauth-setup');
      }

      console.groupEnd();
    } catch (error) {
      console.error('❌ OAuth config validation failed:', error);
      setConfig({
        frontendValid: false,
        backendValid: false,
        isFullyValid: false,
        frontendErrors: ['Unexpected error during validation'],
        backendErrors: [],
        frontendWarnings: [],
        backendWarnings: [],
        isLoading: false,
        lastChecked: new Date(),
      });
    }
  };

  // Validate config on mount
  useEffect(() => {
    validateConfig();
  }, []);

  const contextValue: OAuthConfigContextValue = {
    config,
    recheckConfig: validateConfig,
  };

  return (
    <OAuthConfigContext.Provider value={contextValue}>
      {children}
    </OAuthConfigContext.Provider>
  );
};

/**
 * Hook to access OAuth configuration state
 *
 * @returns OAuth config state and recheck function
 * @throws Error if used outside OAuthConfigProvider
 *
 * @example
 * const { config, recheckConfig } = useOAuthConfig();
 *
 * if (!config.isFullyValid) {
 *   return <div>OAuth is misconfigured. Cannot sign in.</div>;
 * }
 */
export const useOAuthConfig = (): OAuthConfigContextValue => {
  const context = useContext(OAuthConfigContext);

  if (!context) {
    throw new Error('useOAuthConfig must be used within OAuthConfigProvider');
  }

  return context;
};

export default OAuthConfigContext;
