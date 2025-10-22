/**
 * ErrorMessage Component
 *
 * Displays OAuth authentication errors with user-friendly messaging and retry functionality.
 *
 * Features:
 * - User-friendly error messages (no technical jargon)
 * - Retry button for retryable errors
 * - Countdown timer for delayed retries
 * - Expandable cache clearing instructions
 * - Support contact info for fatal errors
 * - Technical details in collapsible section (for debugging)
 *
 * @module components/ErrorMessage
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  MappedOAuthError,
  formatRetryCountdown,
  isCacheRelatedError,
  OAuthError
} from '../utils/oauthErrorMapper';

export interface ErrorMessageProps {
  /** Mapped OAuth error with user message and retry info */
  error: MappedOAuthError;
  /** Original OAuth error object (for technical details) */
  originalError?: OAuthError | string;
  /** Callback when user clicks retry button */
  onRetry?: () => void;
  /** Callback when user dismisses the error */
  onDismiss?: () => void;
  /** Show cache clearing guidance (optional) */
  showCacheGuidance?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ErrorMessage Component
 *
 * Displays authentication errors with actionable guidance
 *
 * @example
 * <ErrorMessage
 *   error={mappedError}
 *   originalError={oauthError}
 *   onRetry={() => retryAuthentication()}
 *   onDismiss={() => setError(null)}
 * />
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  originalError,
  onRetry,
  onDismiss,
  showCacheGuidance = false,
  className = '',
}) => {
  const [countdown, setCountdown] = useState(error.retryAfterSeconds);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showCacheInstructions, setShowCacheInstructions] = useState(false);

  // Countdown timer for retry delay
  useEffect(() => {
    if (!error.retryable || countdown <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [error.retryable, countdown]);

  // Reset countdown when error changes
  useEffect(() => {
    setCountdown(error.retryAfterSeconds);
  }, [error]);

  const canRetry = error.retryable && countdown === 0;
  const isRetryPending = error.retryable && countdown > 0;
  const shouldShowCacheGuidance = showCacheGuidance &&
                                   error.cacheGuidance &&
                                   isCacheRelatedError(originalError || '');

  return (
    <div
      className={`
        bg-red-50 border border-red-200 rounded-lg p-4 shadow-md
        ${className}
      `}
      role="alert"
      aria-live="assertive"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-900 mb-1">
              Authentication Error
            </h3>
            <p className="text-sm text-red-800 whitespace-pre-line leading-relaxed">
              {error.userMessage}
            </p>
          </div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="
              text-red-400 hover:text-red-600 transition-colors
              p-1 rounded hover:bg-red-100
            "
            aria-label="Dismiss error"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mt-4">
        {/* Retry button */}
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            disabled={!canRetry}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all
              ${canRetry
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md'
                : 'bg-red-300 text-red-100 cursor-not-allowed'
              }
            `}
            aria-label={isRetryPending ? `Retry in ${formatRetryCountdown(countdown)}` : 'Retry authentication'}
          >
            <RefreshCw className={`w-4 h-4 ${isRetryPending ? 'animate-spin' : ''}`} />
            {isRetryPending ? (
              <span>Retrying in {formatRetryCountdown(countdown)}...</span>
            ) : (
              <span>Try Again</span>
            )}
          </button>
        )}

        {/* Contact support button (for non-retryable errors) */}
        {!error.retryable && (
          <a
            href="mailto:airestoreassist@gmail.com?subject=Authentication%20Error"
            className="
              flex items-center gap-2 px-4 py-2 rounded-md font-medium
              bg-blue-600 hover:bg-blue-700 text-white
              shadow-sm hover:shadow-md transition-all
            "
          >
            Contact Support
          </a>
        )}
      </div>

      {/* Cache clearing guidance (collapsible) */}
      {shouldShowCacheGuidance && error.cacheGuidance && (
        <div className="mt-4 border-t border-red-200 pt-4">
          <button
            onClick={() => setShowCacheInstructions(!showCacheInstructions)}
            className="
              flex items-center justify-between w-full text-left
              text-sm font-medium text-red-900 hover:text-red-700
              transition-colors
            "
            aria-expanded={showCacheInstructions}
          >
            <span>Troubleshooting: Clear Browser Cache</span>
            {showCacheInstructions ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showCacheInstructions && (
            <div className="mt-3 text-sm text-red-800 space-y-2">
              <p className="font-medium">{error.cacheGuidance.browserName}:</p>
              <pre className="whitespace-pre-line bg-red-100 p-3 rounded border border-red-200 text-xs">
                {error.cacheGuidance.instructions}
              </pre>
              {error.cacheGuidance.keyboardShortcut && (
                <p className="text-xs text-red-600">
                  <strong>Quick shortcut:</strong> {error.cacheGuidance.keyboardShortcut}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Technical details (collapsible, for developers) */}
      <div className="mt-4 border-t border-red-200 pt-4">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="
            flex items-center justify-between w-full text-left
            text-xs font-medium text-red-700 hover:text-red-900
            transition-colors
          "
          aria-expanded={showTechnicalDetails}
        >
          <span>Technical Details (for support)</span>
          {showTechnicalDetails ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {showTechnicalDetails && (
          <div className="mt-2 text-xs text-red-700 space-y-1">
            <p>
              <strong>Error Type:</strong> {error.technicalMessage}
            </p>
            {originalError && typeof originalError === 'object' && (
              <>
                {originalError.error && (
                  <p>
                    <strong>Error Code:</strong> {originalError.error}
                  </p>
                )}
                {originalError.error_description && (
                  <p>
                    <strong>Description:</strong> {originalError.error_description}
                  </p>
                )}
                {originalError.type && (
                  <p>
                    <strong>Type:</strong> {originalError.type}
                  </p>
                )}
              </>
            )}
            {originalError && typeof originalError === 'string' && (
              <p>
                <strong>Error Code:</strong> {originalError}
              </p>
            )}
            <p>
              <strong>Retryable:</strong> {error.retryable ? 'Yes' : 'No'}
            </p>
            {error.retryAfterSeconds > 0 && (
              <p>
                <strong>Retry Delay:</strong> {error.retryAfterSeconds}s
              </p>
            )}
            <p className="text-xs text-red-600 mt-2">
              When contacting support, please include this information to help diagnose the issue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
