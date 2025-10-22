/**
 * Unit Tests: OAuth Error Mapper
 *
 * Tests OAuth error code mapping to user-friendly messages.
 *
 * Coverage:
 * - All 7 main error codes mapped correctly
 * - Retryable flag set correctly (transient vs fatal errors)
 * - Retry delay calculation for different error types
 * - Browser detection and cache guidance
 * - Format countdown timer
 * - Unknown error handling
 *
 * @module utils/oauthErrorMapper.test
 */

import { describe, it, expect } from 'vitest';
import {
  mapOAuthError,
  isCacheRelatedError,
  formatRetryCountdown,
  type OAuthError,
  type MappedOAuthError
} from './oauthErrorMapper';

describe('OAuth Error Mapper', () => {
  describe('mapOAuthError - Error Code Mapping', () => {
    it('should map idpiframe_initialization_failed to propagation delay message', () => {
      const result = mapOAuthError({ error: 'idpiframe_initialization_failed' });

      expect(result.userMessage).toContain('Authentication is being set up');
      expect(result.userMessage).toContain('10-15 minutes');
      expect(result.technicalMessage).toContain('propagation delay');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(600); // 10 minutes
      expect(result.cacheGuidance).toBeDefined();
    });

    it('should map [GSI_LOGGER]: origin not allowed to propagation delay message', () => {
      const result = mapOAuthError('[GSI_LOGGER]: origin not allowed');

      expect(result.userMessage).toContain('Authentication is being set up');
      expect(result.userMessage).toContain('10-15 minutes');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(600);
    });

    it('should map popup_closed_by_user to user cancellation message', () => {
      const result = mapOAuthError({ error: 'popup_closed_by_user' });

      expect(result.userMessage).toContain('Sign-in was cancelled');
      expect(result.userMessage).toContain('button again');
      expect(result.technicalMessage).toBe('User closed OAuth popup window');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(0); // Immediate retry
      expect(result.cacheGuidance).toBeUndefined(); // No cache guidance for user cancellation
    });

    it('should map access_denied to permission denial message', () => {
      const result = mapOAuthError({ error: 'access_denied' });

      expect(result.userMessage).toContain('denied permission');
      expect(result.userMessage).toContain('allow access');
      expect(result.technicalMessage).toBe('User denied OAuth permissions');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should map invalid_client to configuration error message', () => {
      const result = mapOAuthError({ error: 'invalid_client' });

      expect(result.userMessage).toContain('configuration error');
      expect(result.userMessage).toContain('team has been notified');
      expect(result.technicalMessage).toContain('Invalid OAuth client configuration');
      expect(result.retryable).toBe(false); // User cannot fix this
    });

    it('should map redirect_uri_mismatch to redirect URI error message', () => {
      const result = mapOAuthError({ error: 'redirect_uri_mismatch' });

      expect(result.userMessage).toContain('redirect URI mismatch');
      expect(result.userMessage).toContain('contact support');
      expect(result.technicalMessage).toContain('redirect URI not whitelisted');
      expect(result.retryable).toBe(false);
    });

    it('should map invalid_grant to expired authorization message', () => {
      const result = mapOAuthError({ error: 'invalid_grant' });

      expect(result.userMessage).toContain('authorization has expired');
      expect(result.userMessage).toContain('sign in again');
      expect(result.technicalMessage).toContain('grant expired or revoked');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should map temporarily_unavailable to Google API downtime message', () => {
      const result = mapOAuthError({ error: 'temporarily_unavailable' });

      expect(result.userMessage).toContain('temporarily unavailable');
      expect(result.userMessage).toContain('automatically retry');
      expect(result.technicalMessage).toContain('Google OAuth API temporarily unavailable');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(5); // 5 second retry
    });
  });

  describe('mapOAuthError - Additional Error Codes', () => {
    it('should map rate_limit_exceeded to rate limit message', () => {
      const result = mapOAuthError({ error: 'rate_limit_exceeded' });

      expect(result.userMessage).toContain('Too many sign-in attempts');
      expect(result.userMessage).toContain('wait a few minutes');
      expect(result.technicalMessage).toBe('OAuth rate limit exceeded');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(60); // 1 minute
    });

    it('should map cookies_disabled to third-party cookies message', () => {
      const result = mapOAuthError({ error: 'cookies_disabled' });

      expect(result.userMessage).toContain('Third-party cookies are disabled');
      expect(result.userMessage).toContain('enable cookies');
      expect(result.technicalMessage).toBe('Third-party cookies blocked or disabled');
      expect(result.retryable).toBe(false);
      expect(result.cacheGuidance).toBeDefined();
    });

    it('should map network_error to connection error message', () => {
      const result = mapOAuthError({ error: 'network_error' });

      expect(result.userMessage).toContain('Unable to connect');
      expect(result.userMessage).toContain('internet connection');
      expect(result.technicalMessage).toContain('Network connection error');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(3);
    });

    it('should map server_error to temporary unavailability message', () => {
      const result = mapOAuthError({ error: 'server_error' });

      expect(result.userMessage).toContain('temporarily unavailable');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(5);
    });

    it('should map authorization_expired to expired authorization message', () => {
      const result = mapOAuthError({ error: 'authorization_expired' });

      expect(result.userMessage).toContain('authorization has expired');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });
  });

  describe('mapOAuthError - Unknown Errors', () => {
    it('should handle unknown error codes with generic message', () => {
      const result = mapOAuthError({ error: 'unknown_custom_error' });

      expect(result.userMessage).toContain('unexpected error occurred');
      expect(result.userMessage).toContain('try again');
      expect(result.technicalMessage).toContain('Unknown OAuth error: unknown_custom_error');
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(5);
    });

    it('should include error description in unknown error message', () => {
      const result = mapOAuthError({
        error: 'custom_error',
        error_description: 'This is a detailed error message'
      });

      expect(result.userMessage).toContain('This is a detailed error message');
      expect(result.technicalMessage).toContain('custom_error - This is a detailed error message');
    });

    it('should handle string error codes', () => {
      const result = mapOAuthError('popup_closed_by_user');

      expect(result.userMessage).toContain('Sign-in was cancelled');
      expect(result.retryable).toBe(true);
    });

    it('should handle empty error objects', () => {
      const result = mapOAuthError({});

      expect(result.userMessage).toContain('unexpected error occurred');
      expect(result.technicalMessage).toContain('Unknown OAuth error: unknown_error');
    });
  });

  describe('mapOAuthError - Retryable Flag', () => {
    it('should mark transient errors as retryable', () => {
      const transientErrors = [
        'popup_closed_by_user',
        'access_denied',
        'invalid_grant',
        'temporarily_unavailable',
        'network_error',
        'rate_limit_exceeded'
      ];

      transientErrors.forEach((errorCode) => {
        const result = mapOAuthError({ error: errorCode });
        expect(result.retryable, `${errorCode} should be retryable`).toBe(true);
      });
    });

    it('should mark fatal configuration errors as non-retryable', () => {
      const fatalErrors = [
        'invalid_client',
        'redirect_uri_mismatch',
        'cookies_disabled',
        'invalid_request'
      ];

      fatalErrors.forEach((errorCode) => {
        const result = mapOAuthError({ error: errorCode });
        expect(result.retryable, `${errorCode} should NOT be retryable`).toBe(false);
      });
    });

    it('should mark propagation delay errors as retryable', () => {
      const result = mapOAuthError({ error: 'idpiframe_initialization_failed' });
      expect(result.retryable).toBe(true);
    });
  });

  describe('mapOAuthError - Retry Delay Calculation', () => {
    it('should set 0 second delay for immediate retries', () => {
      const immediateRetryErrors = [
        'popup_closed_by_user',
        'access_denied',
        'invalid_grant',
        'authorization_expired'
      ];

      immediateRetryErrors.forEach((errorCode) => {
        const result = mapOAuthError({ error: errorCode });
        expect(result.retryAfterSeconds, `${errorCode} should have 0 second delay`).toBe(0);
      });
    });

    it('should set 5 second delay for transient API errors', () => {
      const shortDelayErrors = [
        'temporarily_unavailable',
        'server_error',
        'unknown_error'
      ];

      shortDelayErrors.forEach((errorCode) => {
        const result = mapOAuthError({ error: errorCode });
        expect(result.retryAfterSeconds, `${errorCode} should have 5 second delay`).toBe(5);
      });
    });

    it('should set 60 second delay for rate limiting', () => {
      const result = mapOAuthError({ error: 'rate_limit_exceeded' });
      expect(result.retryAfterSeconds).toBe(60);
    });

    it('should set 600 second delay for propagation delay errors', () => {
      const result = mapOAuthError({ error: 'idpiframe_initialization_failed' });
      expect(result.retryAfterSeconds).toBe(600); // 10 minutes
    });
  });

  describe('mapOAuthError - Cache Guidance', () => {
    it('should include cache guidance for idpiframe_initialization_failed', () => {
      const result = mapOAuthError({ error: 'idpiframe_initialization_failed' });

      expect(result.cacheGuidance).toBeDefined();
      expect(result.cacheGuidance?.browserName).toBeDefined();
      expect(result.cacheGuidance?.instructions).toBeDefined();
    });

    it('should include cache guidance for cookies_disabled', () => {
      const result = mapOAuthError({ error: 'cookies_disabled' });

      expect(result.cacheGuidance).toBeDefined();
      expect(result.cacheGuidance?.browserName).toBeDefined();
      expect(result.cacheGuidance?.instructions).toContain('cookies');
    });

    it('should NOT include cache guidance for user cancellation errors', () => {
      const result = mapOAuthError({ error: 'popup_closed_by_user' });

      expect(result.cacheGuidance).toBeUndefined();
    });

    it('should NOT include cache guidance for configuration errors', () => {
      const result = mapOAuthError({ error: 'invalid_client' });

      expect(result.cacheGuidance).toBeUndefined();
    });

    it('should generate different cache instructions based on browser (integration test)', () => {
      // Note: This test may require mocking navigator.userAgent
      const result = mapOAuthError({ error: 'idpiframe_initialization_failed' });

      expect(result.cacheGuidance).toBeDefined();
      expect(result.cacheGuidance?.instructions).toContain('cookies');
      expect(result.cacheGuidance?.keyboardShortcut).toBeDefined();
    });
  });

  describe('isCacheRelatedError', () => {
    it('should identify cache-related errors', () => {
      const cacheErrors = [
        'idpiframe_initialization_failed',
        '[GSI_LOGGER]: origin not allowed',
        'cookies_disabled'
      ];

      cacheErrors.forEach((errorCode) => {
        expect(isCacheRelatedError(errorCode), `${errorCode} should be cache-related`).toBe(true);
        expect(isCacheRelatedError({ error: errorCode }), `Object ${errorCode} should be cache-related`).toBe(true);
      });
    });

    it('should NOT identify non-cache-related errors', () => {
      const nonCacheErrors = [
        'popup_closed_by_user',
        'access_denied',
        'invalid_client',
        'rate_limit_exceeded'
      ];

      nonCacheErrors.forEach((errorCode) => {
        expect(isCacheRelatedError(errorCode), `${errorCode} should NOT be cache-related`).toBe(false);
        expect(isCacheRelatedError({ error: errorCode }), `Object ${errorCode} should NOT be cache-related`).toBe(false);
      });
    });

    it('should handle empty error objects', () => {
      expect(isCacheRelatedError('')).toBe(false);
      expect(isCacheRelatedError({})).toBe(false);
    });
  });

  describe('formatRetryCountdown', () => {
    it('should format seconds under 1 minute', () => {
      expect(formatRetryCountdown(45)).toBe('45s');
      expect(formatRetryCountdown(30)).toBe('30s');
      expect(formatRetryCountdown(5)).toBe('5s');
      expect(formatRetryCountdown(1)).toBe('1s');
    });

    it('should format exact minutes', () => {
      expect(formatRetryCountdown(60)).toBe('1m');
      expect(formatRetryCountdown(120)).toBe('2m');
      expect(formatRetryCountdown(600)).toBe('10m'); // 10 minutes for propagation delay
    });

    it('should format minutes with seconds', () => {
      expect(formatRetryCountdown(90)).toBe('1m 30s');
      expect(formatRetryCountdown(150)).toBe('2m 30s');
      expect(formatRetryCountdown(605)).toBe('10m 5s');
    });

    it('should handle zero seconds', () => {
      expect(formatRetryCountdown(0)).toBe('0s');
    });
  });

  describe('Error Message Quality', () => {
    it('should use plain language (no technical jargon in user messages)', () => {
      const errors = [
        'popup_closed_by_user',
        'access_denied',
        'invalid_client',
        'temporarily_unavailable'
      ];

      errors.forEach((errorCode) => {
        const result = mapOAuthError({ error: errorCode });

        // User message should not contain error codes or raw technical terms
        expect(result.userMessage).not.toContain(errorCode);
        expect(result.userMessage).not.toContain('idpiframe');
      });

      // Note: "Google OAuth" is acceptable in context (e.g., "Google OAuth is being set up")
      // but raw error codes should never appear in user messages
    });

    it('should provide actionable guidance in user messages', () => {
      const result = mapOAuthError({ error: 'popup_closed_by_user' });

      expect(result.userMessage).toMatch(/click|try|again|button/i);
    });

    it('should include contact info for fatal errors', () => {
      const fatalResult = mapOAuthError({ error: 'invalid_client' });

      expect(fatalResult.userMessage).toMatch(/support|contact/i);
    });

    it('should preserve technical details in technicalMessage', () => {
      const testCases = [
        { errorCode: 'idpiframe_initialization_failed', expectedTerm: 'idpiframe' },
        { errorCode: 'invalid_client', expectedTerm: 'invalid' },
        { errorCode: 'redirect_uri_mismatch', expectedTerm: 'redirect uri' }
      ];

      testCases.forEach(({ errorCode, expectedTerm }) => {
        const result = mapOAuthError({ error: errorCode });

        // Technical message should contain error-related terms
        expect(result.technicalMessage.toLowerCase()).toContain(expectedTerm.toLowerCase());
      });
    });
  });
});
