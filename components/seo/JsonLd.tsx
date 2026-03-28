/**
 * JSON-LD Structured Data Components for SEO
 * Provides rich snippets in search results
 */

interface JsonLdProps {
  data: Record<string, unknown>
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RestoreAssist',
    url: 'https://restoreassist.com.au',
    logo: 'https://restoreassist.com.au/logo.png',
    description:
      'AI-powered restoration report software for Australian water damage and disaster recovery professionals. IICRC S500 compliant.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'AU',
    },
    sameAs: [] as string[],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: 'English',
    },
  }

  return <JsonLd data={schema} />
}

/** Alias — matches the name requested in RA-22 */
export { OrganizationSchema as OrganizationJsonLd }

// ---------------------------------------------------------------------------
// SoftwareApplication
// ---------------------------------------------------------------------------

export function SoftwareApplicationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Restore Assist',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'AUD',
      description: 'Free trial available',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '50',
    },
    description:
      'Professional restoration report software with AI-powered assessment, IICRC S500 compliance, and comprehensive cost estimation for Australian restoration contractors.',
    featureList: [
      'AI-powered report generation',
      'IICRC S500 compliance',
      'Automated cost estimation',
      'Interactive inspection forms',
      'Real-time collaboration',
      'Australian compliance standards',
    ],
  }

  return <JsonLd data={schema} />
}

/** Alias — matches the name requested in RA-22 */
export { SoftwareApplicationSchema as SoftwareApplicationJsonLd }

// ---------------------------------------------------------------------------
// FAQPage
// ---------------------------------------------------------------------------

interface FAQItem {
  question: string
  answer: string
}

export function FAQPageSchema({ questions }: { questions: FAQItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  }

  return <JsonLd data={schema} />
}

/** Alias — matches the name requested in RA-22 */
export { FAQPageSchema as FAQPageJsonLd }

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

interface BreadcrumbItem {
  name: string
  url: string
}

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return <JsonLd data={schema} />
}

/** Alias — matches the name requested in RA-22 */
export { BreadcrumbSchema as BreadcrumbJsonLd }

// ---------------------------------------------------------------------------
// Article (new — RA-22)
// ---------------------------------------------------------------------------

interface ArticleJsonLdProps {
  headline: string
  description: string
  url: string
  imageUrl?: string
  datePublished: string
  dateModified?: string
  authorName: string
  publisherName?: string
  publisherLogoUrl?: string
}

export function ArticleJsonLd({
  headline,
  description,
  url,
  imageUrl,
  datePublished,
  dateModified,
  authorName,
  publisherName = 'RestoreAssist',
  publisherLogoUrl = 'https://restoreassist.com.au/logo.png',
}: ArticleJsonLdProps) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: {
      '@type': 'Person',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: publisherName,
      logo: {
        '@type': 'ImageObject',
        url: publisherLogoUrl,
      },
    },
  }

  if (imageUrl) {
    schema.image = imageUrl
  }

  return <JsonLd data={schema} />
}
