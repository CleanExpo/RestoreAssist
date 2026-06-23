/**
 * JSON-LD Structured Data Components for SEO
 * Provides rich snippets in search results
 */

interface JsonLdProps {
  data: Record<string, any>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    // SAFE: JSON-LD structured data — JSON.stringify of server-controlled schema object; no user input reaches this
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "RestoreAssist",
    url: "https://restoreassist.app",
    logo: "https://restoreassist.app/logo.png",
    description:
      "Restoration report software used by Australian water damage and disaster recovery professionals. IICRC S500 aligned.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "AU",
    },
    sameAs: [
      // Add social media profiles when available
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      availableLanguage: "English",
    },
  };

  return <JsonLd data={schema} />;
}

export function SoftwareApplicationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Restore Assist",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AUD",
      description: "Free trial available",
    },
    // aggregateRating intentionally omitted: Google's structured-data policy
    // requires ratings to reflect genuine, on-page user reviews. There is no
    // public review system backing a rating here, so emitting one risks a
    // manual action (and is misleading under AU consumer law). Re-add only when
    // wired to real review data.
    description:
      "Restoration report software with AI-assisted assessment used by certified restorers, IICRC S500 alignment, and comprehensive cost estimation for Australian restoration contractors.",
    featureList: [
      "AI-assisted report generation for restorers",
      "IICRC S500 alignment",
      "Automated cost estimation",
      "Interactive inspection forms",
      "Real-time collaboration",
      "Australian standards alignment",
    ],
  };

  return <JsonLd data={schema} />;
}

export function FAQPageSchema({
  questions,
}: {
  questions: Array<{ question: string; answer: string }>;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };

  return <JsonLd data={schema} />;
}

export function BreadcrumbSchema({
  items,
}: {
  items: Array<{ name: string; url: string }>;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return <JsonLd data={schema} />;
}
