import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://restoreassist.com.au'
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/(dashboard)/'] },
      { userAgent: ['AhrefsBot', 'SemrushBot', 'DotBot', 'MJ12bot'], disallow: '/' },
      // Explicitly allow AI crawlers
      { userAgent: ['GPTBot', 'PerplexityBot', 'ClaudeBot', 'anthropic-ai', 'ChatGPT-User'], allow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
