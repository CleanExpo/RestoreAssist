import type { Metadata } from "next"
import ArticleClient from "./article-client"

export const metadata: Metadata = {
  title: "Water Damage Restoration Costs in Australia: 2025 Price Guide",
  description:
    "Understand water damage restoration costs in Australia for 2025. Covers pricing by damage category (Cat 1/2/3), factors affecting cost, NRPG rate boundaries, and the insurance claim process.",
  keywords: [
    "water damage restoration cost Australia",
    "water damage repair cost",
    "restoration pricing Australia",
    "flood damage restoration cost",
    "water damage insurance claim Australia",
    "NRPG rate boundaries",
  ],
  openGraph: {
    title: "Water Damage Restoration Costs in Australia: 2025 Price Guide",
    description:
      "Understand water damage restoration costs in Australia for 2025. Covers pricing by damage category, NRPG rate boundaries, and the insurance claim process.",
    type: "article",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: {
    canonical: "/blog/water-damage-restoration-cost-australia",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Water Damage Restoration Costs in Australia: 2025 Price Guide",
  description:
    "Understand water damage restoration costs in Australia for 2025. Covers pricing by damage category (Cat 1/2/3), factors affecting cost, NRPG rate boundaries, and the insurance claim process.",
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
      "https://restoreassist.com.au/blog/water-damage-restoration-cost-australia",
  },
}

export default function WaterDamageCostArticlePage() {
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
