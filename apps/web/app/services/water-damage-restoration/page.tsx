import type { Metadata } from "next"
import WaterDamageClient from "./water-damage-client"

export const metadata: Metadata = {
  title:
    "Water Damage Restoration Services — IICRC S500 Compliant | RestoreAssist",
  description:
    "Professional water damage restoration following IICRC S500 standards. Learn about water damage categories, drying classes, and how certified contractors restore properties across Australia.",
  keywords: [
    "water damage restoration australia",
    "water damage restoration service",
    "flood restoration contractor",
    "IICRC S500",
    "water damage categories",
    "drying classes",
    "water extraction",
    "structural drying australia",
  ],
  openGraph: {
    title:
      "Water Damage Restoration Services — IICRC S500 Compliant | RestoreAssist",
    description:
      "Professional water damage restoration following IICRC S500 standards. Categories, drying classes, and certified contractor services across Australia.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Water Damage Restoration Services — IICRC S500 Compliant | RestoreAssist",
    description:
      "Professional water damage restoration following IICRC S500 standards across Australia.",
  },
  alternates: {
    canonical: "/services/water-damage-restoration",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Water Damage Restoration Services — IICRC S500 Compliant",
    description:
      "Professional water damage restoration following IICRC S500 standards. Categories, drying classes, and certified contractor services across Australia.",
    url: "https://restoreassist.com.au/services/water-damage-restoration",
    publisher: {
      "@type": "Organization",
      name: "RestoreAssist",
      logo: {
        "@type": "ImageObject",
        url: "https://restoreassist.com.au/logo.png",
      },
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
        name: "Services",
        item: "https://restoreassist.com.au/services",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Water Damage Restoration",
        item: "https://restoreassist.com.au/services/water-damage-restoration",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the IICRC S500 standard?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The IICRC S500 is the internationally recognised Standard and Reference Guide for Professional Water Damage Restoration. It defines the criteria for water damage inspection, mitigation, and restoration to ensure a safe and healthy environment.",
        },
      },
      {
        "@type": "Question",
        name: "What are the three categories of water damage?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Category 1 (Clean Water) originates from a sanitary source. Category 2 (Grey Water) contains significant contamination. Category 3 (Black Water) is grossly contaminated and may contain pathogens.",
        },
      },
      {
        "@type": "Question",
        name: "How long does water damage restoration take?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Typical residential drying takes 3 to 5 days depending on severity, materials affected, and drying class. Category 3 events and large commercial losses can take significantly longer.",
        },
      },
      {
        "@type": "Question",
        name: "Why should I choose an IICRC-certified contractor?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "IICRC-certified contractors have completed formal training in water damage restoration principles. Insurers prefer certified professionals because it reduces secondary damage risk and leads to faster claim approvals.",
        },
      },
    ],
  },
]

export default function WaterDamageRestorationPage() {
  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <WaterDamageClient />
    </>
  )
}
