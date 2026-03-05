import type { Metadata } from "next"
import { JsonLd } from "@/components/seo/JsonLd"
import { faqPageSchema, breadcrumbSchema } from "@/components/seo/schemas"
import GuideClient from "./guide-client"

const SITE_URL = "https://restoreassist.com.au"

export const metadata: Metadata = {
  title: "AS-IICRC S500:2025 Complete Guide — Water Damage Restoration Standard Australia",
  description:
    "The definitive guide to AS-IICRC S500:2025 for Australian restoration contractors. Water damage categories, drying classes, psychrometric principles, documentation requirements, and IICRC certification explained.",
  keywords: [
    "AS-IICRC S500 2025",
    "IICRC S500 guide",
    "water damage restoration standard Australia",
    "S500 2025 changes",
    "water damage categories",
    "IICRC certification Australia",
    "WRT certification",
    "restoration compliance",
    "psychrometric principles restoration",
    "S500 documentation requirements",
  ],
  openGraph: {
    title: "AS-IICRC S500:2025 Complete Guide — Water Damage Restoration Standard",
    description:
      "Comprehensive guide to AS-IICRC S500:2025 for Australian contractors. Categories, classes, documentation, and certification requirements.",
    type: "article",
    locale: "en_AU",
    siteName: "Restore Assist",
    url: `${SITE_URL}/guides/iicrc-s500-2025`,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AS-IICRC S500:2025 Complete Guide",
    description: "The definitive Australian guide to IICRC S500:2025 water damage restoration standard.",
  },
  alternates: { canonical: "/guides/iicrc-s500-2025" },
  robots: { index: true, follow: true },
}

const faqs = [
  {
    question: "What is AS-IICRC S500:2025?",
    answer:
      "AS-IICRC S500:2025 is the Australian-adopted edition of the IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration. It establishes the procedural standards for water damage inspection, mitigation, and restoration work performed by qualified contractors in Australia.",
  },
  {
    question: "What are the three water damage categories under S500?",
    answer:
      "Category 1 (Clean Water) originates from a sanitary source such as a burst pipe. Category 2 (Grey Water) contains significant contamination such as washing machine overflow. Category 3 (Black Water) is grossly contaminated and may contain pathogenic agents, such as sewage backflow or floodwater.",
  },
  {
    question: "Do Australian restoration contractors need IICRC certification?",
    answer:
      "While IICRC certification is not a legal requirement in all Australian states, it is considered the industry standard. Most insurers and loss adjusters require contractors to hold current Water Damage Restoration Technician (WRT) certification. Some states reference IICRC standards in their building and plumbing codes.",
  },
  {
    question: "What changed between S500:2021 and S500:2025?",
    answer:
      "Key changes include expanded antimicrobial guidance, updated psychrometric calculations for modern building materials, enhanced documentation requirements including digital moisture mapping, clearer Category 2 to Category 3 escalation timelines, and strengthened requirements for personal protective equipment (PPE) selection.",
  },
  {
    question: "What documentation is required under S500:2025?",
    answer:
      "S500:2025 requires comprehensive documentation including initial moisture readings, atmospheric readings (temperature, relative humidity, GPP), daily drying logs, equipment placement records, photographic evidence at all stages, material inventories, a scope of work, and a final clearance report with post-restoration moisture verification.",
  },
  {
    question: "How does RestoreAssist help with S500:2025 compliance?",
    answer:
      "RestoreAssist provides digital inspection forms mapped to S500:2025 requirements, automated moisture and atmospheric logging, AI-powered report generation with compliant terminology, built-in photo documentation workflows, drying equipment tracking, and exportable compliance reports that meet insurer and loss adjuster expectations.",
  },
  {
    question: "What is the difference between water damage classes and categories?",
    answer:
      "Categories describe the contamination level of the water source (Cat 1 clean, Cat 2 grey, Cat 3 black). Classes describe the rate of evaporation and difficulty of drying (Class 1 slow/small area, Class 2 fast/moderate, Class 3 fastest/large area, Class 4 specialty drying for low-permeance materials like hardwood and concrete).",
  },
]

const breadcrumbs = [
  { name: "Home", url: SITE_URL },
  { name: "Guides", url: `${SITE_URL}/guides` },
  { name: "AS-IICRC S500:2025 Guide", url: `${SITE_URL}/guides/iicrc-s500-2025` },
]

function articleSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The Complete Guide to AS-IICRC S500:2025 — Water Damage Restoration Standard",
    description:
      "Comprehensive guide to AS-IICRC S500:2025 for Australian restoration contractors covering water damage categories, drying classes, psychrometric principles, and compliance requirements.",
    author: {
      "@type": "Organization",
      name: "RestoreAssist",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "RestoreAssist",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
      },
    },
    datePublished: "2025-03-01",
    dateModified: "2025-03-01",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/guides/iicrc-s500-2025`,
    },
    image: `${SITE_URL}/logo.png`,
    articleSection: "Guides",
    keywords: [
      "AS-IICRC S500",
      "water damage restoration",
      "IICRC certification",
      "Australia restoration standard",
    ],
  }
}

export default function S500GuidePage() {
  return (
    <>
      <JsonLd data={articleSchema()} />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(breadcrumbs)} />
      <GuideClient />
    </>
  )
}
