/**
 * YouTube Metadata Generator
 *
 * Generates YouTube-specific title, description, tags, and category
 * from a ContentJob's fields.
 */

export interface YouTubeMetadata {
  title: string
  description: string
  tags: string[]
  categoryId: string // YouTube category ID
}

/**
 * Generate YouTube metadata from ContentJob fields.
 *
 * @param hook - The opening hook (used as title basis)
 * @param caption - The post caption (used in description)
 * @param hashtags - JSON string array of hashtags (used as tags)
 * @param product - The product/feature being promoted
 * @param voiceoverText - Full voiceover (used for long description)
 */
export function generateYouTubeMetadata(params: {
  hook: string | null
  caption: string | null
  hashtags: string | null
  product: string
  voiceoverText: string | null
  cta: string | null
}): YouTubeMetadata {
  const { hook, caption, hashtags, product, voiceoverText, cta } = params

  // ── Title ────────────────────────────────────────────────────────────────
  // Use hook as title, trimmed to 100 chars (YouTube max)
  // Fall back to product name if hook is empty
  let title = (hook || `${product} — RestoreAssist`).trim()
  if (title.length > 100) {
    title = title.slice(0, 97) + '...'
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  let tags: string[] = []
  if (hashtags) {
    try {
      const parsed = JSON.parse(hashtags)
      if (Array.isArray(parsed)) {
        tags = parsed.map((t: string) => t.replace(/^#/, '').trim()).filter(Boolean)
      }
    } catch {
      // If hashtags is not valid JSON, split by commas or spaces
      tags = hashtags.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean)
    }
  }

  // Always include core RestoreAssist tags
  const coreTags = [
    'RestoreAssist',
    'water damage restoration',
    'IICRC S500',
    'restoration contractor',
    'scope of works',
    'insurance claim',
    'Australian restoration',
  ]
  tags = [...new Set([...tags, ...coreTags])].slice(0, 30) // YouTube max 30 tags

  // ── Description ──────────────────────────────────────────────────────────
  const descriptionParts: string[] = []

  if (caption) {
    descriptionParts.push(caption)
  }

  descriptionParts.push('') // blank line
  descriptionParts.push('📋 About RestoreAssist')
  descriptionParts.push(
    'RestoreAssist is the all-in-one platform built for Australian restoration professionals. ' +
    'AI-powered scope generation, IICRC S500/S520/S700 compliance, one-click export to Xero, ' +
    'Ascora & ServiceM8, and professional PDF reports — all in one system.'
  )

  descriptionParts.push('')
  descriptionParts.push('🚀 Start your free trial — 3 free reports, no credit card required')
  descriptionParts.push('👉 https://restoreassist.app')

  if (cta) {
    descriptionParts.push('')
    descriptionParts.push(`💡 ${cta}`)
  }

  descriptionParts.push('')
  descriptionParts.push('─────────────────────')
  descriptionParts.push(tags.map(t => `#${t}`).join(' '))

  const description = descriptionParts.join('\n').slice(0, 5000) // YouTube max 5000 chars

  // ── Category ─────────────────────────────────────────────────────────────
  // 28 = Science & Technology (best fit for SaaS/tech product)
  // Alternative: 22 = People & Blogs
  const categoryId = '28'

  return { title, description, tags, categoryId }
}
