import type { Metadata } from "next"
import ArticleClient from "./article-client"

export const metadata: Metadata = {
  title:
    "IICRC Certifications for Australian Restoration Contractors — Complete Guide 2025",
  description:
    "Complete guide to IICRC certifications for Australian restoration contractors. Covers WRT, ASD, FSRT, AMRT, OCT, UFT, and CDS certifications — how to get certified, costs, exams, and CEC renewal.",
  keywords: [
    "IICRC certification australia",
    "WRT certification australia",
    "IICRC exam australia",
    "AMRT certification",
    "ASD certification",
    "FSRT certification",
    "IICRC CEC renewal",
    "restoration certification australia",
  ],
  openGraph: {
    title:
      "IICRC Certifications for Australian Restoration Contractors — Complete Guide 2025",
    description:
      "Complete guide to IICRC certifications in Australia. WRT, ASD, FSRT, AMRT, OCT, UFT, CDS — costs, exams, and CEC renewal requirements.",
    type: "article",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "IICRC Certifications for Australian Restoration Contractors — Complete Guide 2025",
    description:
      "Complete guide to IICRC certifications in Australia for restoration contractors.",
  },
  alternates: {
    canonical: "/blog/iicrc-certifications-australia-2025",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline:
      "IICRC Certifications for Australian Restoration Contractors — Complete Guide 2025",
    description:
      "Complete guide to IICRC certifications for Australian restoration contractors. Covers WRT, ASD, FSRT, AMRT, OCT, UFT, and CDS certifications.",
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
    datePublished: "2025-03-05",
    dateModified: "2025-03-05",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id":
        "https://restoreassist.com.au/blog/iicrc-certifications-australia-2025",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://restoreassist.com.au",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://restoreassist.com.au/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "IICRC Certifications Australia 2025",
        item: "https://restoreassist.com.au/blog/iicrc-certifications-australia-2025",
      },
    ],
  },
]

export default function IICRCCertificationsArticlePage() {
  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <ArticleClient />
    </>
  )
}
