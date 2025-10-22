/**
 * useGoogleAuth Custom Hook
 *
 * Wraps Google OAuth authentication with automatic retry logic and error mapping.
 *
 * Features:
 * - Integrates @react-oauth/google library
 * - Automatic retry with exponential backoff
 * - OAuth error mapping to user-friendly messages
 * - Loading state management
 * - Retry count tracking
 * - Success/error callbacks
 *
 * @module hooks/useGoogleAuth
 */

import { useState, useCallback } from 'react';
import { useRetry } from './useRetry';
import { mapOAuthError, type OAuthError, type MappedOAuthError } from '../utils/oauthErrorMapper';
import {
  recordAuthFailure,
  resetAuthFailures,
  shouldShowCacheGuidance,
} from '../utils/authFailureTracker';

/**
 * Google OAuth success response
 */
export interface GoogleAuthSuccessResponse {
  /** Google ID token (JWT) */
  credential: string;
  /** Client ID that initiated the request */
  clientId?: string;
  /** Selected hint (email) */
  select_by?: string;
}

/**
 * Google Auth hook state
 */
export interface GoogleAuthState {
  /** Whether authentication is in progress */
  isLoading: boolean;
  /** Current OAuth error (if any) */
  error: OAuthError | string | null;
  /** Mapped user-friendly error */
  mappedError: MappedOAuthError | null;
  /** Current retry attempt number */
  retryCount: number;
  /** Whether a retry is in progress */
  isRetrying: boolean;
  /** Seconds until next retry */
  nextRetryIn: number;
  /** Whether max retries have been exhausted */
  retriesExhausted: boolean;
  /** Whether to show cache clearing guidance */
  showCacheGuidance: boolean;
}

/**
 * Google Auth hook return value
 */
export interface GoogleAuthHook extends GoogleAuthState {
  /** Initiate Google OAuth login */
  login: () => void;
  /** Handle successful OAuth response */
  handleSuccess: (response: GoogleAuthSuccessResponse) => void;
  /** Handle OAuth error */
  handleError: () => void;
  /** Manually trigger retry */
  retry: () => void;
  /** Clear error state */
  clearError: () => void;
  /** Reset authentication state */
  reset: () => void;
}

/**
 * Google Auth configuration
 */
export interface GoogleAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** Callback on successful authentication */
  onSuccess?: (credential: string) => void | Promise<void>;
  /** Callback on authentication error */
  onError?: (error: MappedOAuthError, originalError: OAuthError | string) => void;
  /** Enable automatic retry (default: true) */
  autoRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Custom retry delays in ms (default: [2000, 4000, 8000]) */
  retryDelays?: number[];
}

/**
 * useGoogleAuth Hook
 *
 * Manages Google OAuth authentication with retry logic
 *
 * @param config - Google Auth configuration
 * @returns Google Auth state and control functions
 *
 * @example
 * const {
 *   login,
 *   handleSuccess,
 *   handleError,
 *   isLoading,
 *   error,
 *   mappedError,
 *   retryCount,
 *   retry
 * } = useGoogleAuth({
 *   clientId: 'YOUR_CLIENT_ID',
 *   onSuccess: async (credential) => {
 *     await authenticateWithBackend(credential);
 *   },
 *   onError: (mappedError) => {
 *     console.error('OAuth failed:', mappedError.userMessage);
 *   }
 * });
 */
export function useGoogleAuth(config: GoogleAuthConfig): GoogleAuthHook {
  const {
    clientId,
    onSuccess,
    onError,
    autoRetry = true,
    maxRetries = 3,
    retryDelays = [2000, 4000, 8000],
  } = config;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<OAuthError | string | null>(null);
  const [mappedError, setMappedError] = useState<MappedOAuthError | null>(null);
  const [lastCredential, setLastCredential] = useState<string | null>(null);
  const [showCacheGuidance, setShowCacheGuidance] = useState(false);

  /**
   * Handle authentication error
   */
  const handleAuthError = useCallback(
    (errorInput: OAuthError | string) => {
      setError(errorInput);
      const mapped = mapOAuthError(errorInput);
      setMappedError(mapped);
      setIsLoading(false);

      // Record failure in localStorage
      const errorCode = typeof errorInput === 'string' ? errorInput : (errorInput.error || errorInput.type || 'unknown_error');
      recordAuthFailure(errorCode);

      // Check if cache guidance should be shown
      const shouldShowCache = shouldShowCacheGuidance();
      setShowCacheGuidance(shouldShowCache);

      // Call error callback
      if (onError) {
        onError(mapped, errorInput);
      }
    },
    [onError]
  );

  /**
   * Retry callback for useRetry hook
   */
  const retryCallback = useCallback(async () => {
    if (!lastCredential) {
      console.warn('Cannot retry: No credential available');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMappedError(null);

    try {
      if (onSuccess) {
        await onSuccess(lastCredential);
      }
      setIsLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      handleAuthError(errorMessage);
    }
  }, [lastCredential, onSuccess, handleAuthError]);

  /**
   * Initialize retry logic
   */
  const {
    retryCount,
    isRetrying,
    nextRetryIn,
    retriesExhausted,
    retry: manualRetry,
    reset: resetRetry,
  } = useRetry(
    retryCallback,
    mappedError?.retryable ?? false,
    {
      maxAttempts: maxRetries,
      delays: retryDelays,
      autoRetry,
    }
  );

  /**
   * Initiate Google OAuth login
   * (This would typically trigger the Google OAuth popup)
   */
  const login = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setMappedError(null);
    resetRetry();

    // The actual OAuth flow is handled by the GoogleOAuthProvider
    // This function prepares the state for the flow
  }, [resetRetry]);

  /**
   * Handle successful OAuth response
   */
  const handleSuccess = useCallback(
    async (response: GoogleAuthSuccessResponse) => {
      setIsLoading(true);
      setError(null);
      setMappedError(null);
      setLastCredential(response.credential);

      try {
        if (onSuccess) {
          await onSuccess(response.credential);
        }
        setIsLoading(false);
        resetRetry();

        // Reset failure tracking on successful auth
        resetAuthFailures();
        setShowCacheGuidance(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
        handleAuthError(errorMessage);
      }
    },
    [onSuccess, handleAuthError, resetRetry]
  );

  /**
   * Handle OAuth error
   * Called when Google OAuth popup fails or user cancels
   */
  const handleError = useCallback(() => {
    handleAuthError('popup_closed_by_user');
  }, [handleAuthError]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
    setMappedError(null);
    setShowCacheGuidance(false);
    resetRetry();
  }, [resetRetry]);

  /**
   * Reset all authentication state
   */
  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setMappedError(null);
    setLastCredential(null);
    setShowCacheGuidance(false);
    resetRetry();
  }, [resetRetry]);

  /**
   * Manual retry trigger
   */
  const retry = useCallback(() => {
    manualRetry();
  }, [manualRetry]);

  return {
    // State
    isLoading,
    error,
    mappedError,
    retryCount,
    isRetrying,
    nextRetryIn,
    retriesExhausted,
    showCacheGuidance,

    // Actions
    login,
    handleSuccess,
    handleError,
    retry,
    clearError,
    reset,
  };
}

export default useGoogleAuth;
