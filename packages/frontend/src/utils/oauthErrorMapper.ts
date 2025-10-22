/**
 * OAuth Error Mapper
 *
 * Maps technical OAuth error codes to user-friendly messages with actionable guidance.
 *
 * Features:
 * - Converts error codes to plain-language explanations
 * - Determines if errors are retryable
 * - Calculates retry delay for transient errors
 * - Provides browser-specific cache clearing instructions
 *
 * Error Types Covered:
 * - idpiframe_initialization_failed (propagation delay / cache)
 * - popup_closed_by_user (user cancelled)
 * - access_denied (user denied permissions)
 * - invalid_client (configuration error)
 * - redirect_uri_mismatch (configuration error)
 * - invalid_grant (expired/revoked token)
 * - temporarily_unavailable (Google API downtime)
 *
 * @module utils/oauthErrorMapper
 */

/**
 * Mapped OAuth error with user-friendly messaging
 */
export interface MappedOAuthError {
  /** User-friendly error message (plain language) */
  userMessage: string;
  /** Technical error message (for developers/support) */
  technicalMessage: string;
  /** Whether error can be retried */
  retryable: boolean;
  /** Seconds to wait before retrying (0 = immediate) */
  retryAfterSeconds: number;
  /** Browser-specific cache clearing instructions (optional) */
  cacheGuidance?: {
    browserName: string;
    instructions: string;
    keyboardShortcut?: string;
  };
}

/**
 * OAuth error object from Google OAuth library
 */
export interface OAuthError {
  error?: string;
  error_description?: string;
  type?: string;
  details?: string;
}

/**
 * Browser detection result
 */
interface BrowserInfo {
  name: 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Unknown';
  version: string;
}

/**
 * Detect browser from user agent
 */
function detectBrowser(): BrowserInfo {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Edg/')) {
    return { name: 'Edge', version: userAgent.match(/Edg\/([\d.]+)/)?.[1] || 'Unknown' };
  }
  if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    return { name: 'Chrome', version: userAgent.match(/Chrome\/([\d.]+)/)?.[1] || 'Unknown' };
  }
  if (userAgent.includes('Firefox/')) {
    return { name: 'Firefox', version: userAgent.match(/Firefox\/([\d.]+)/)?.[1] || 'Unknown' };
  }
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return { name: 'Safari', version: userAgent.match(/Version\/([\d.]+)/)?.[1] || 'Unknown' };
  }

  return { name: 'Unknown', version: 'Unknown' };
}

/**
 * Get browser-specific cache clearing instructions
 */
function getCacheGuidance(browserName: string): MappedOAuthError['cacheGuidance'] {
  switch (browserName) {
    case 'Chrome':
      return {
        browserName: 'Google Chrome',
        instructions: '1. Click the three-dot menu (⋮) in the top-right corner\n2. Go to Settings → Privacy and security → Clear browsing data\n3. Select "Cookies and other site data" and "Cached images and files"\n4. Choose "All time" from the time range dropdown\n5. Click "Clear data"',
        keyboardShortcut: 'Ctrl+Shift+Delete (Windows/Linux) or Cmd+Shift+Delete (Mac)',
      };

    case 'Firefox':
      return {
        browserName: 'Mozilla Firefox',
        instructions: '1. Click the menu button (☰) and select Settings\n2. Click Privacy & Security in the left sidebar\n3. Scroll to "Cookies and Site Data"\n4. Click "Clear Data..."\n5. Check both boxes and click "Clear"',
        keyboardShortcut: 'Ctrl+Shift+Delete (Windows/Linux) or Cmd+Shift+Delete (Mac)',
      };

    case 'Safari':
      return {
        browserName: 'Safari',
        instructions: '1. Go to Safari menu → Preferences (or Settings)\n2. Click the Privacy tab\n3. Click "Manage Website Data..."\n4. Click "Remove All"\n5. Click "Done"',
        keyboardShortcut: 'Option+Cmd+E (to empty cache)',
      };

    case 'Edge':
      return {
        browserName: 'Microsoft Edge',
        instructions: '1. Click the three-dot menu (...) in the top-right corner\n2. Go to Settings → Privacy, search, and services\n3. Under "Clear browsing data", click "Choose what to clear"\n4. Select "Cookies and other site data" and "Cached images and files"\n5. Choose "All time" and click "Clear now"',
        keyboardShortcut: 'Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)',
      };

    default:
      return {
        browserName: 'Your Browser',
        instructions: 'Please refer to your browser\'s documentation for instructions on clearing cookies and cache.\n\nGenerally, you can find this option in:\nSettings → Privacy → Clear browsing data',
        keyboardShortcut: 'Ctrl+Shift+Delete or Cmd+Shift+Delete (on most browsers)',
      };
  }
}

/**
 * Map OAuth error code to user-friendly message
 *
 * @param error - OAuth error object from Google OAuth library
 * @returns Mapped error with user message, retry info, and cache guidance
 *
 * @example
 * const error = { error: 'popup_closed_by_user' };
 * const mapped = mapOAuthError(error);
 * console.log(mapped.userMessage); // "Sign-in was cancelled..."
 * console.log(mapped.retryable); // true
 */
export function mapOAuthError(error: OAuthError | string): MappedOAuthError {
  // Normalize error to string
  const errorCode = typeof error === 'string' ? error : (error.error || error.type || 'unknown_error');
  const errorDescription = typeof error === 'string' ? '' : (error.error_description || error.details || '');

  const browser = detectBrowser();

  // Map error codes to user-friendly messages
  switch (errorCode) {
    case 'idpiframe_initialization_failed':
    case '[GSI_LOGGER]: origin not allowed':
      return {
        userMessage:
          'Authentication is being set up. Please wait 10-15 minutes and try again.\n\n' +
          'This happens when Google OAuth is recently configured and needs time to propagate across their servers.',
        technicalMessage: `Google OAuth origin propagation delay (${errorCode})`,
        retryable: true,
        retryAfterSeconds: 600, // 10 minutes
        cacheGuidance: getCacheGuidance(browser.name),
      };

    case 'popup_closed_by_user':
      return {
        userMessage:
          'Sign-in was cancelled. Click the "Sign in with Google" button again when you\'re ready to continue.',
        technicalMessage: 'User closed OAuth popup window',
        retryable: true,
        retryAfterSeconds: 0, // Immediate retry allowed
      };

    case 'access_denied':
      return {
        userMessage:
          'You denied permission to sign in with Google. To use RestoreAssist, please click the button again and allow access to your Google account.',
        technicalMessage: 'User denied OAuth permissions',
        retryable: true,
        retryAfterSeconds: 0,
      };

    case 'access_blocked':
    case 'org_internal':
      return {
        userMessage:
          'Access Restricted: This application is currently in testing mode and only available to whitelisted users.\n\n' +
          'If you need access, please contact support@restoreassist.com.au with your Google email address and we\'ll add you to the test user list.',
        technicalMessage: `OAuth app in Testing mode - user not whitelisted (${errorCode})`,
        retryable: false, // Cannot retry until user is whitelisted
        retryAfterSeconds: 0,
      };

    case 'invalid_client':
    case 'invalid_request':
      return {
        userMessage:
          'Authentication configuration error. Our team has been notified and is working on a fix.\n\n' +
          'Please try again in a few minutes, or contact support if the issue persists.',
        technicalMessage: `Invalid OAuth client configuration (${errorCode})`,
        retryable: false, // User cannot fix this
        retryAfterSeconds: 0,
      };

    case 'redirect_uri_mismatch':
      return {
        userMessage:
          'Authentication configuration error (redirect URI mismatch). Our development team has been notified.\n\n' +
          'Please contact support@restoreassist.com.au if you continue to see this message.',
        technicalMessage: 'OAuth redirect URI not whitelisted in Google Cloud Console',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'invalid_grant':
    case 'authorization_expired':
      return {
        userMessage:
          'Your authorization has expired or been revoked. Please sign in again.',
        technicalMessage: `OAuth grant expired or revoked (${errorCode})`,
        retryable: true,
        retryAfterSeconds: 0,
      };

    case 'temporarily_unavailable':
    case 'server_error':
      return {
        userMessage:
          'Google\'s authentication service is temporarily unavailable. We\'ll automatically retry in a few seconds.\n\n' +
          'If the issue persists, please try again later.',
        technicalMessage: `Google OAuth API temporarily unavailable (${errorCode})`,
        retryable: true,
        retryAfterSeconds: 5, // Retry after 5 seconds
      };

    case 'rate_limit_exceeded':
      return {
        userMessage:
          'Too many sign-in attempts. Please wait a few minutes before trying again.',
        technicalMessage: 'OAuth rate limit exceeded',
        retryable: true,
        retryAfterSeconds: 60, // 1 minute
      };

    case 'cookies_disabled':
      return {
        userMessage:
          'Third-party cookies are disabled in your browser. Google OAuth requires cookies to function.\n\n' +
          'Please enable cookies for this site and try again.',
        technicalMessage: 'Third-party cookies blocked or disabled',
        retryable: false,
        retryAfterSeconds: 0,
        cacheGuidance: getCacheGuidance(browser.name),
      };

    // Network / connection errors
    case 'network_error':
    case 'fetch_error':
    case 'connection_failed':
      return {
        userMessage:
          'Unable to connect to authentication service. Please check your internet connection and try again.',
        technicalMessage: `Network connection error (${errorCode})`,
        retryable: true,
        retryAfterSeconds: 3,
      };

    // Trial / Fraud Detection Errors
    case 'email_trial_limit_exceeded':
      return {
        userMessage:
          'You have already used your free trial. Each email address is eligible for one free trial only.\n\n' +
          'To continue using RestoreAssist, please subscribe to one of our paid plans.',
        technicalMessage: 'Trial limit exceeded: Email already used for trial',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'device_trial_limit_exceeded':
      return {
        userMessage:
          'This device has already been used for a free trial. Each device is eligible for one free trial only.\n\n' +
          'To continue using RestoreAssist, please subscribe to one of our paid plans.',
        technicalMessage: 'Trial limit exceeded: Device already used for trial',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'device_blocked':
      return {
        userMessage:
          'This device has been blocked from creating new trials due to suspicious activity.\n\n' +
          'If you believe this is an error, please contact support@restoreassist.com.au',
        technicalMessage: 'Device blocked from trial creation',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'disposable_email':
      return {
        userMessage:
          'Disposable or temporary email addresses are not eligible for free trials.\n\n' +
          'Please sign up with a permanent email address to access your free trial.',
        technicalMessage: 'Disposable email domain detected',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'rapid_re_registration':
      return {
        userMessage:
          'Multiple trial activation attempts detected in a short time period.\n\n' +
          'Please wait a few hours before trying again, or contact support if you need immediate assistance.',
        technicalMessage: 'Rapid re-registration attempt detected',
        retryable: true,
        retryAfterSeconds: 3600, // 1 hour
      };

    case 'ip_rate_limit_exceeded':
      return {
        userMessage:
          'Too many trial activations from your network. Please try again later.\n\n' +
          'If you\'re on a shared network, this limit helps prevent abuse.',
        technicalMessage: 'IP rate limit exceeded for trial activations',
        retryable: true,
        retryAfterSeconds: 3600, // 1 hour
      };

    case 'fraud_score_too_high':
      return {
        userMessage:
          'We\'re unable to activate your free trial at this time due to automated fraud detection.\n\n' +
          'Please contact support@restoreassist.com.au for manual review and assistance.',
        technicalMessage: 'Fraud score exceeds threshold',
        retryable: false,
        retryAfterSeconds: 0,
      };

    case 'trial_denied':
      return {
        userMessage:
          'Your free trial activation was not approved. This may be due to previous trial usage or security restrictions.\n\n' +
          'Please contact support@restoreassist.com.au for assistance.',
        technicalMessage: 'Trial activation denied by fraud detection',
        retryable: false,
        retryAfterSeconds: 0,
      };

    // Unknown errors
    default:
      const hasDescription = errorDescription.length > 0;
      return {
        userMessage:
          'An unexpected error occurred during sign-in. Please try again.\n\n' +
          (hasDescription ? `Details: ${errorDescription}\n\n` : '') +
          'If the problem persists, please contact support@restoreassist.com.au',
        technicalMessage: `Unknown OAuth error: ${errorCode}${hasDescription ? ` - ${errorDescription}` : ''}`,
        retryable: true,
        retryAfterSeconds: 5,
      };
  }
}

/**
 * Check if error is related to browser cache
 *
 * @param error - OAuth error object or code
 * @returns True if cache clearing might help resolve the error
 */
export function isCacheRelatedError(error: OAuthError | string): boolean {
  const errorCode = typeof error === 'string' ? error : (error.error || error.type || '');

  return errorCode === 'idpiframe_initialization_failed' ||
         errorCode === '[GSI_LOGGER]: origin not allowed' ||
         errorCode === 'cookies_disabled';
}

/**
 * Format countdown timer display
 *
 * @param seconds - Seconds remaining
 * @returns Formatted time string (e.g., "2m 30s", "45s")
 */
export function formatRetryCountdown(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}
