// Sentry Initialization - MUST be imported first
// This file initializes Sentry before any other modules to ensure proper auto-instrumentation

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Only initialize Sentry if DSN is provided
const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment configuration
    environment: process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Integrations
    integrations: [
      // Performance profiling
      nodeProfilingIntegration(),

      // HTTP instrumentation
      Sentry.httpIntegration(),

      // Express instrumentation (will be automatically detected)
      Sentry.expressIntegration(),

      // Capture console logs
      Sentry.captureConsoleIntegration({
        levels: ['error', 'warn'],
      }),

      // Module loading instrumentation
      Sentry.modulesIntegration(),

      // Context lines for better error context
      Sentry.contextLinesIntegration(),
    ],

    // Error filtering
    beforeSend(event, hint) {
      // Don't send certain expected errors to Sentry
      const error = hint.originalException;

      if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message).toLowerCase();

        // Filter out expected authentication errors
        if (message.includes('authentication required') ||
            message.includes('invalid token') ||
            message.includes('token expired')) {
          return null; // Don't send to Sentry
        }

        // Filter out validation errors (they're expected)
        if (message.includes('validation error') ||
            message.includes('validation failed')) {
          return null;
        }
      }

      return event;
    },

    // Enhance error context
    beforeSendTransaction(event) {
      // Add custom data to all transactions
      if (event.contexts) {
        event.contexts.runtime = {
          name: 'node',
          version: process.version,
        };
      }
      return event;
    },

    // Set default tags
    initialScope: {
      tags: {
        platform: process.platform,
        nodeVersion: process.version,
      },
    },
  });

  console.log('✅ Sentry error monitoring initialized');
} else {
  console.log('⚠️  Sentry DSN not provided - error monitoring disabled');
  console.log('   Set SENTRY_DSN environment variable to enable');
}

// Export Sentry for use in other modules
export { Sentry };
