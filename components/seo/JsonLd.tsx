/**
 * JSON-LD Structured Data Components for SEO
 * Provides rich snippets in search results
 */

interface JsonLdProps {
  data: Record<string, any>
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RestoreAssist',
    url: 'https://restoreassist.com.au',
    logo: 'https://restoreassist.com.au/logo.png',
    description: 'AI-powered restoration report software for Australian water damage and disaster recovery professionals. IICRC S500 compliant.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'AU',
    },
    sameAs: [
      // Add social media profiles when available
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: 'English',
    },
  }

  return <JsonLd data={schema} />
}

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
    description: 'Professional restoration report software with AI-powered assessment, IICRC S500 compliance, and comprehensive cost estimation for Australian restoration contractors.',
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

export function FAQPageSchema({ questions }: { questions: Array<{ question: string; answer: string }> }) {
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

export function BreadcrumbSchema({ items }: { items: Array<{ name: string; url: string }> }) {
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
