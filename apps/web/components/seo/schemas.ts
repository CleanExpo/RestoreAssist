/**
 * Typed JSON-LD schema builders for RestoreAssist SEO
 */

const SITE_URL = 'https://restoreassist.com.au'

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RestoreAssist',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Australia's compliance platform for disaster restoration contractors. AI-powered restoration reports backed by IICRC standards.",
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
}

export function softwareApplicationSchema() {
  return {
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
}

export function faqPageSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'RestoreAssist',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      'AI-powered damage assessment and restoration report platform for Australian professionals.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'AU',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: -33.8688,
      longitude: 151.2093,
    },
    areaServed: {
      '@type': 'Country',
      name: 'Australia',
    },
    priceRange: '$$',
  }
}
