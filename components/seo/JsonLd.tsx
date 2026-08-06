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
    // "used by certified restorers" removed. It is a social-proof claim and
    // nothing in this repo substantiates it — there is no customer registry, no
    // review system, no case-study data. That is the same class of claim as the
    // aggregateRating omitted above, for the same reason, and this one is
    // machine-readable so it is consumed directly rather than read in context.
    // Restore it when there is something to cite, not before.
    description:
      "Restoration report software with AI-assisted assessment, IICRC S500 alignment, and comprehensive cost estimation for Australian restoration contractors.",
    // "Real-time collaboration" was removed: nothing implements it. Searched
    // app/, lib/ and components/ for supabase.channel, .channel(, WebSocket,
    // socket.io, yjs, CRDT, presence and broadcast. The only hits are a comment
    // reading "no WebSocket required" (lib/heygen/client.ts:148), "broadcast"
    // as an IP range in a URL blocklist (lib/branding/url-validator.ts:3), and
    // "env-presence" env-var checks. The same standard as the aggregateRating
    // note above: do not emit structured data asserting something that is not
    // there. This one is machine-readable, so it is consumed directly.
    featureList: [
      "AI-assisted report generation for restorers",
      "IICRC S500 alignment",
      "Automated cost estimation",
      "Interactive inspection forms",
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
