import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry for error tracking in production
 */
export function initializeSentry() {
  // Only initialize Sentry in production
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,

      // Set environment
      environment: import.meta.env.MODE || 'production',

      // Enable performance monitoring
      integrations: [
        // Browser tracing
        Sentry.browserTracingIntegration({
          // Set sampling rate for performance monitoring
          tracePropagationTargets: [
            'localhost',
            /^https:\/\/restoreassist\.app/,
            /^https:\/\/api\.restoreassist\.app/,
          ],
        }),
        // Replay integration for session replay
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

      // Session Replay
      replaysSessionSampleRate: 0.1, // 10% of sessions
      replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || 'development',

      // Filter out sensitive information
      beforeSend(event, hint) {
        // Remove sensitive data from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            // Remove authorization headers
            if (breadcrumb.data?.headers) {
              delete breadcrumb.data.headers.Authorization;
              delete breadcrumb.data.headers.authorization;
            }
            return breadcrumb;
          });
        }

        // Remove sensitive request data
        if (event.request) {
          if (event.request.headers) {
            delete event.request.headers.Authorization;
            delete event.request.headers.authorization;
          }

          // Remove cookies
          delete event.request.cookies;
        }

        return event;
      },

      // Ignore specific errors
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'chrome-extension://',
        'moz-extension://',

        // Network errors
        'Network Error',
        'NetworkError',
        'Failed to fetch',

        // React DevTools
        '__REACT_DEVTOOLS_GLOBAL_HOOK__',

        // Random plugins/extensions
        'Can\'t find variable: ZiteReader',
        'jigsaw is not defined',
        'ComboSearch is not defined',

        // Facebook errors
        'fb_xd_fragment',

        // Google OAuth errors that are user-initiated
        'popup_closed_by_user',

        // AbortController errors (normal cancellations)
        'AbortError',
      ],

      // Denylist for URLs to ignore
      denyUrls: [
        // Browser extensions
        /extensions\//i,
        /^chrome:\/\//i,
        /^moz-extension:\/\//i,

        // Social media widgets
        /graph\.facebook\.com/i,
        /connect\.facebook\.net/i,
      ],
    });

    console.log('✅ Sentry initialized in production mode');
  } else {
    console.log('ℹ️ Sentry disabled (development mode or missing DSN)');
  }
}

/**
 * Capture exception with additional context
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  } else {
    console.error('Error:', error, context);
  }
}

/**
 * Capture message with additional context
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  } else {
    console.log(`[${level}] ${message}`, context);
  }
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id: string; email?: string; username?: string } | null) {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.setUser(user);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}
