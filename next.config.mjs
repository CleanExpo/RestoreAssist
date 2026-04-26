import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    // Shared security headers applied to every route
    // RA-1589 — static Content-Security-Policy stopgap.
    //
    // The original plan was a middleware-generated nonce-based CSP; that
    // middleware was never written (see security audit 2026-04-22). This
    // static policy gives us defence-in-depth against stored XSS while the
    // nonce migration is scoped. Anything that would be a stricter policy
    // (removing 'unsafe-inline' for scripts, removing 'unsafe-eval') needs
    // the nonce path + a pass over the 13 dangerouslySetInnerHTML sites
    // and every Stripe/Cloudinary inline widget.
    //
    // Key decisions:
    //   - frame-ancestors 'none' — clickjacking defence (paired with XFO).
    //   - form-action 'self'   — prevents form-submission redirects to
    //                             attacker domains.
    //   - base-uri 'self'      — stops <base> tag hijacks.
    //   - object-src 'none'    — no Flash/Java plugin injection.
    //   - upgrade-insecure-requests — auto-upgrade http:// subresources.
    const cspDirectives = [
      "default-src 'self'",
      // 'unsafe-inline' + 'unsafe-eval' retained until nonce migration. Allow
      // Stripe (checkout), Vercel Analytics, Cloudflare Turnstile, Cloudinary.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com https://widget.cloudinary.com https://upload-widget.cloudinary.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://res.cloudinary.com https://*.stripe.com https://lh3.googleusercontent.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://api.stripe.com https://*.supabase.co https://*.upstash.io wss://*.supabase.co https://api.cloudinary.com https://vitals.vercel-insights.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    const sharedHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
      { key: "Content-Security-Policy", value: cspDirectives },
    ];

    return [
      {
        // Public/marketing routes — block camera, mic, and geolocation
        source: "/(.*)",
        headers: [
          ...sharedHeaders,
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
      {
        // Portal and Dashboard routes — allow camera, mic, and geolocation.
        // Required for: NIR photo documentation (S500 §5.3), voice notes, GPS address auto-fill.
        // This overrides the restrictive policy above for authenticated field-use routes only.
        source: "/(portal|dashboard)(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(self), browsing-topics=()",
          },
        ],
      },
    ];
  },
  // Keep heavy server-only packages external — do NOT bundle into serverless functions.
  // Prevents Turbopack from compiling these packages during `next build`, which was
  // the root cause of the 45-minute build timeout. All packages listed here are
  // server-only (only imported in app/api/ or server lib/ files, never in client components).
  //
  // Categories:
  //   Native binaries:   sharp, puppeteer, exifr — platform-specific .node files
  //   AI SDKs:           @anthropic-ai/sdk, openai, @google/generative-ai
  //   Cloud/infra:       firebase-admin, googleapis, cloudinary, stripe, resend, nodemailer
  //   PDF generation:    pdf-lib, jspdf, pdf-parse, pdfjs-dist
  //   Office formats:    exceljs, mammoth
  //   Media/video:       @remotion/lambda
  //   Utilities:         archiver, jsonwebtoken, bcryptjs, qrcode
  serverExternalPackages: [
    // Native binaries (original set)
    "sharp",
    "puppeteer",
    "firebase-admin",
    "exifr",
    // AI SDKs — large dependency trees, server-only
    "@anthropic-ai/sdk",
    "openai",
    "@google/generative-ai",
    // Cloud / infrastructure
    "googleapis",
    "google-auth-library",
    "cloudinary",
    "stripe",
    "resend",
    "nodemailer",
    // PDF generation / parsing — heavy, server-only
    "pdf-lib",
    "jspdf",
    "pdf-parse",
    "pdfjs-dist",
    // Office formats — server-only
    "exceljs",
    "mammoth",
    // Media / video rendering
    "@remotion/lambda",
    // Utilities — crypto, archiving, QR
    "archiver",
    "jsonwebtoken",
    "bcryptjs",
    "qrcode",
  ],

  // Exclude non-Linux-x64 sharp platform binaries from serverless function bundles.
  // Vercel runs on Linux x64 — the 10 other platform-specific libvips packages
  // add ~140 MB of dead weight that pushes functions over the 250 MB limit.
  // Only @img/sharp-libvips-linux-x64 and @img/sharp-linux-x64 are kept.
  // NOTE: Moved from experimental.outputFileTracingExcludes (deprecated in Next.js 16).
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@img/sharp-libvips-darwin-x64/**",
      "node_modules/@img/sharp-libvips-darwin-arm64/**",
      "node_modules/@img/sharp-libvips-linux-arm/**",
      "node_modules/@img/sharp-libvips-linux-arm64/**",
      "node_modules/@img/sharp-libvips-linux-ppc64/**",
      "node_modules/@img/sharp-libvips-linux-riscv64/**",
      "node_modules/@img/sharp-libvips-linux-s390x/**",
      "node_modules/@img/sharp-libvips-linuxmusl-arm64/**",
      "node_modules/@img/sharp-libvips-linuxmusl-x64/**",
      "node_modules/@img/sharp-wasm32/**",
      // Exclude Darwin/Windows sharp native addons (not needed on Vercel Lambda)
      "node_modules/@img/sharp-darwin-x64/**",
      "node_modules/@img/sharp-darwin-arm64/**",
      "node_modules/@img/sharp-win32-x64/**",
    ],
  },

  experimental: {
    // optimizeCss: true, // Disabled - requires critters

    optimizePackageImports: [
      // Note: packages in serverExternalPackages must NOT be listed here too
      "@hookform/resolvers",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "cmdk",
      "date-fns",
      "framer-motion",
      "lucide-react",
      "react-day-picker",
      "react-hook-form",
      "recharts",
      "zod",
    ],
  },
  images: {
    // Enable Next.js image optimization (disabled: false)
    // This provides automatic WebP/AVIF conversion, lazy loading, and responsive image sizing
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
    // Supported image formats for automatic conversion
    formats: ["image/webp", "image/avif"],
    // Device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // Image sizes for various breakpoints
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

// RA P0-3 — wrap with Sentry's webpack plugin so source maps upload at
// build time and stack traces in Sentry are symbolicated. Sentry-specific
// build steps are no-ops when SENTRY_DSN / SENTRY_AUTH_TOKEN are unset
// (local + preview without DSN — no impact on the build).
const sentryWebpackOptions = {
  org: process.env.SENTRY_ORG ?? undefined,
  project: process.env.SENTRY_PROJECT ?? undefined,
  authToken: process.env.SENTRY_AUTH_TOKEN ?? undefined,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Hide source maps from public traffic — only Sentry can de-symbolicate.
  hideSourceMaps: true,
  // Keep the sentry build wrapper opt-in: when no auth token, skip the
  // upload step but still inject the runtime SDK.
  disableLogger: true,
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackOptions);
