import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://*.stripe.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co https://*.stripe.com https://api.anthropic.com https://api.deepseek.com https://generativelanguage.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://go.servicem8.com https://api.servicem8.com https://login.xero.com https://identity.xero.com https://api.xero.com https://appcenter.intuit.com https://oauth.platform.intuit.com https://quickbooks.api.intuit.com https://secure.myob.com https://api.myob.com https://api.ascora.com.au",
              "frame-src 'self' https://*.firebaseapp.com https://*.stripe.com https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
  experimental: {
    // optimizeCss: true, // Disabled - requires critters
    optimizePackageImports: [
      '@anthropic-ai/sdk',
      '@google/generative-ai',
      '@hookform/resolvers',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'cmdk',
      'date-fns',
      'exceljs',
      'framer-motion',
      'lucide-react',
      'pdfjs-dist',
      'react-day-picker',
      'react-hook-form',
      'recharts',
      'zod',
    ],
  },
  images: {
    // Enable Next.js image optimization (disabled: false)
    // This provides automatic WebP/AVIF conversion, lazy loading, and responsive image sizing
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      }
    ],
    // Supported image formats for automatic conversion
    formats: ['image/webp', 'image/avif'],
    // Device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // Image sizes for various breakpoints
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
}

export default withBundleAnalyzer(nextConfig)
