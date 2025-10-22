import { sentryVitePlugin } from '@sentry/vite-plugin';

/**
 * Sentry Vite Plugin Configuration
 * This configuration enables source map uploading to Sentry for better error debugging
 *
 * Usage: Import this in vite.config.ts when building for production
 */

export const sentryPlugin = sentryVitePlugin({
  // Sentry organization and project
  org: process.env.SENTRY_ORG || 'restoreassist',
  project: process.env.SENTRY_PROJECT || 'restoreassist-frontend',

  // Authentication token for uploading source maps
  // Generate at: https://sentry.io/settings/account/api/auth-tokens/
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps configuration
  sourcemaps: {
    // Assets to upload
    assets: './dist/**',

    // Clean up source maps after upload (security best practice)
    filesToDeleteAfterUpload: ['./dist/**/*.map'],
  },

  // Release configuration
  release: {
    // Release name (matches the release in Sentry.init)
    name: process.env.VITE_APP_VERSION || 'development',

    // Automatically create release and associate commits
    create: true,

    // Associate commits with release
    setCommits: {
      auto: true,
      ignoreMissing: true,
    },

    // Deploy configuration
    deploy: {
      env: process.env.NODE_ENV || 'production',
      name: process.env.VERCEL_ENV || 'production',
      url: process.env.VERCEL_URL,
    },
  },

  // Telemetry opt-out (for privacy)
  telemetry: false,

  // Only run in production builds
  disable: process.env.NODE_ENV !== 'production',
});

/**
 * Environment variables needed for Sentry source map upload:
 *
 * SENTRY_AUTH_TOKEN=sntrys_xxx...
 * SENTRY_ORG=your-org-slug
 * SENTRY_PROJECT=your-project-slug
 * VITE_APP_VERSION=1.0.0
 *
 * For Vercel deployments, add these to your Vercel project settings
 */