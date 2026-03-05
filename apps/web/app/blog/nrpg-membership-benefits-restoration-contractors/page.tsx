import type { Metadata } from "next"
import ArticleClient from "./article-client"

export const metadata: Metadata = {
  title:
    "NRPG Membership: What It Means for Restoration Contractors and Why It Matters",
  description:
    "Understand NRPG membership for restoration contractors in Australia. Covers membership requirements, rate boundaries, how NRPG protects contractors and property owners, and RestoreAssist integration.",
  keywords: [
    "NRPG membership restoration contractors",
    "NRPG rate boundaries",
    "National Restoration Pricing Guide",
    "NRPG Australia",
    "restoration contractor pricing",
    "NRPG compliance",
  ],
  openGraph: {
    title:
      "NRPG Membership: What It Means for Restoration Contractors and Why It Matters",
    description:
      "Understand NRPG membership for restoration contractors. Covers requirements, rate boundaries, and how NRPG protects both contractors and property owners.",
    type: "article",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: {
    canonical: "/blog/nrpg-membership-benefits-restoration-contractors",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "NRPG Membership: What It Means for Restoration Contractors and Why It Matters",
  description:
    "Understand NRPG membership for restoration contractors in Australia. Covers membership requirements, rate boundaries, how NRPG protects contractors and property owners, and RestoreAssist integration.",
  author: {
    "@type": "Organization",
    name: "RestoreAssist",
    url: "https://restoreassist.com.au",
  },
  publisher: {
    "@type": "Organization",
    name: "RestoreAssist",
    logo: {
      "@type": "ImageObject",
      url: "https://restoreassist.com.au/logo.png",
    },
  },
  datePublished: "2025-03-01",
  dateModified: "2025-03-01",
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id":
      "https://restoreassist.com.au/blog/nrpg-membership-benefits-restoration-contractors",
  },
}

export default function NRPGArticlePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleClient />
    </>
  )
}
