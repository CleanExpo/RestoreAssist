import type { Metadata } from "next"
import ArticleClient from "./article-client"

export const metadata: Metadata = {
  title:
    "How to Find an IICRC-Certified Restoration Contractor in Australia (2025 Guide)",
  description:
    "Learn how to find and verify IICRC-certified restoration contractors in Australia. Covers certification meaning, insurance claim benefits, verification steps, and red flags to watch for.",
  keywords: [
    "IICRC certified restoration contractor Australia",
    "IICRC certification Australia",
    "certified restoration contractor",
    "water damage restoration contractor",
    "IICRC S500 certified",
    "find restoration contractor Australia",
  ],
  openGraph: {
    title:
      "How to Find an IICRC-Certified Restoration Contractor in Australia (2025 Guide)",
    description:
      "Learn how to find and verify IICRC-certified restoration contractors in Australia. Covers certification meaning, insurance claim benefits, verification steps, and red flags.",
    type: "article",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: {
    canonical: "/blog/find-iicrc-certified-restoration-contractor-australia",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "How to Find an IICRC-Certified Restoration Contractor in Australia (2025 Guide)",
  description:
    "Learn how to find and verify IICRC-certified restoration contractors in Australia. Covers certification meaning, insurance claim benefits, verification steps, and red flags to watch for.",
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
      "https://restoreassist.com.au/blog/find-iicrc-certified-restoration-contractor-australia",
  },
}

export default function IICRCArticlePage() {
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
