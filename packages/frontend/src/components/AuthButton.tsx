/**
 * AuthButton Component
 *
 * Google OAuth authentication button with loading states and retry indicators.
 *
 * Features:
 * - Loading spinner during authentication
 * - Retry countdown timer
 * - Retry attempt counter
 * - Disabled state during loading
 * - Google branding compliance
 *
 * @module components/AuthButton
 */

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatRetryCountdown } from '../utils/oauthErrorMapper';

export interface AuthButtonProps {
  /** Click handler for button */
  onClick?: () => void;
  /** Whether authentication is in progress */
  isLoading?: boolean;
  /** Whether a retry is in progress */
  isRetrying?: boolean;
  /** Current retry attempt number (0-indexed) */
  retryCount?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Seconds until next retry */
  nextRetryIn?: number;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Button text (default: "Sign in with Google") */
  children?: React.ReactNode;
}

/**
 * AuthButton Component
 *
 * Displays Google OAuth button with loading and retry states
 *
 * @example
 * <AuthButton
 *   onClick={() => login()}
 *   isLoading={isLoading}
 *   isRetrying={isRetrying}
 *   retryCount={retryCount}
 *   nextRetryIn={nextRetryIn}
 * />
 */
export const AuthButton: React.FC<AuthButtonProps> = ({
  onClick,
  isLoading = false,
  isRetrying = false,
  retryCount = 0,
  maxRetries = 3,
  nextRetryIn = 0,
  disabled = false,
  className = '',
  children = 'Sign in with Google',
}) => {
  const isDisabled = disabled || isLoading || isRetrying;

  /**
   * Get button text based on current state
   */
  const getButtonText = (): React.ReactNode => {
    if (isRetrying && nextRetryIn > 0) {
      return (
        <span className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Retrying in {formatRetryCountdown(nextRetryIn)}...
        </span>
      );
    }

    if (isRetrying || isLoading) {
      const attemptText = retryCount > 0 ? ` (attempt ${retryCount + 1}/${maxRetries})` : '';
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {isRetrying ? `Retrying${attemptText}...` : 'Signing in...'}
        </span>
      );
    }

    return children;
  };

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        relative flex items-center justify-center gap-3
        px-6 py-3 rounded-lg font-medium
        transition-all duration-200
        ${
          isDisabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-sm hover:shadow-md'
        }
        ${className}
      `}
      aria-label={isLoading ? 'Signing in...' : 'Sign in with Google'}
      aria-disabled={isDisabled}
    >
      {/* Google Logo (only show when not loading/retrying) */}
      {!isLoading && !isRetrying && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g fill="none" fillRule="evenodd">
            <path
              d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
              fill="#EA4335"
            />
          </g>
        </svg>
      )}

      {/* Button text with loading/retry states */}
      <span className="text-sm font-medium">{getButtonText()}</span>
    </button>
  );
};

export default AuthButton;
