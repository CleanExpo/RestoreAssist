import type { Metadata } from "next"
import ArticleClient from "./article-client"

export const metadata: Metadata = {
  title: "AS-IICRC S500:2025 Complete Guide: Water Damage Compliance for Australian Contractors",
  description:
    "The definitive AS-IICRC S500:2025 guide for Australian restoration contractors: psychrometric data requirements, EMC targets, equipment audit trails, and calibration documentation.",
  keywords: [
    "AS-IICRC S500:2025",
    "S500 2025 water damage standard Australia",
    "IICRC S500 compliance",
    "water damage restoration compliance Australia",
    "psychrometric data restoration",
    "vapor pressure drying validation",
    "EMC targets building materials",
    "moisture meter calibration S500",
    "equipment audit trail IICRC",
    "insurance water damage report compliance",
    "restoration contractor IICRC certified",
    "drying validation VP differential",
  ],
  openGraph: {
    title: "AS-IICRC S500:2025 Complete Guide: Water Damage Compliance for Australian Contractors",
    description:
      "Psychrometric data requirements, EMC targets, equipment audit trails, calibration documentation — everything Australian restoration contractors need to know about S500:2025.",
    type: "article",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AS-IICRC S500:2025 Complete Guide for Australian Restoration Contractors",
    description:
      "The definitive compliance guide: psychrometric data, EMC targets, equipment audit trails, and calibration records under S500:2025.",
  },
  alternates: {
    canonical: "/blog/as-iicrc-s500-2025-guide",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline:
      "AS-IICRC S500:2025 Complete Guide: Water Damage Compliance for Australian Contractors",
    description:
      "The definitive AS-IICRC S500:2025 guide for Australian restoration contractors covering psychrometric data requirements, EMC targets per material, equipment audit trail obligations, moisture meter calibration documentation, and drying validation using vapor pressure differentials.",
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
    datePublished: "2026-03-29",
    dateModified: "2026-03-29",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": "https://restoreassist.com.au/blog/as-iicrc-s500-2025-guide",
    },
    keywords: [
      "AS-IICRC S500:2025",
      "water damage restoration compliance",
      "psychrometric data",
      "vapor pressure differential",
      "EMC targets",
      "moisture meter calibration",
      "equipment audit trail",
      "IICRC certified",
      "Australia",
    ],
    about: {
      "@type": "Thing",
      name: "AS-IICRC S500:2025",
      description: "Australian Standard for professional water damage restoration, published jointly by Standards Australia and the IICRC.",
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
        name: "AS-IICRC S500:2025 Complete Guide",
        item: "https://restoreassist.com.au/blog/as-iicrc-s500-2025-guide",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the difference between AS-IICRC S500:2025 and the previous 2021 edition?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The 2025 edition strengthens psychrometric documentation requirements — contractors must now record vapor pressure in Pascals, grains per pound (GPP), and dew point at every moisture reading, not just initial and final measurements. Equipment audit trail requirements are more prescriptive, requiring serial numbers, room location logs, and hours operated for each dehumidifier and air mover. EMC targets for common building materials are also more tightly defined, and the standard explicitly requires calibration certificate documentation for all moisture measurement instruments.",
        },
      },
      {
        "@type": "Question",
        name: "Who is required to comply with AS-IICRC S500:2025 in Australia?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Any contractor performing water damage restoration work in Australia that is funded through an insurance claim should comply with S500:2025. This includes IICRC-certified firms, contractors on insurer preferred contractor panels, and businesses that tender for institutional or commercial restoration work. While there is no statutory mandate in most Australian jurisdictions, virtually all major insurers now require S500-compliant documentation as a condition of claim acceptance.",
        },
      },
      {
        "@type": "Question",
        name: "What are the psychrometric data fields required by S500:2025?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "S500:2025 requires documentation of temperature (°C), relative humidity (% RH), vapor pressure (Pa), grains per pound (GPP), dew point (°C), and equilibrium moisture content (EMC) at every measurement point and every visit. These readings must be taken both inside the affected structure and outside as a reference. The standard requires that drying validation be demonstrated through a downward trend in vapor pressure differential between inside and outside readings across consecutive days.",
        },
      },
      {
        "@type": "Question",
        name: "What EMC targets does S500:2025 set for different building materials?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "S500:2025 defines material-specific EMC targets: structural timber 12–19%, hardwood flooring 10–14%, engineered timber 10–15%, gypsum wallboard 0.2–0.5%, concrete slab below 3–4%, fibre cement 10–16%, and particle board/MDF subfloor 8–12%. The standard requires documentation of the target EMC used and its justification, and recommends taking a dry reference reading from unaffected material at the start of each job.",
        },
      },
      {
        "@type": "Question",
        name: "How should equipment be documented under S500:2025?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Each piece of drying equipment must be logged with its make, model, and serial number; the room or zone it was deployed in; the date and time it was placed and removed; total hours operated per day; and its rated capacity (litres per day for dehumidifiers, CFM for air movers). This equipment audit trail must be present in the report to support equipment charges on the invoice.",
        },
      },
      {
        "@type": "Question",
        name: "What moisture meter calibration records does S500:2025 require?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "S500:2025 requires that all moisture measurement instruments used on a job are documented with their serial number, the date of their most recent calibration, and a reference to the calibration certificate. In-field verification must also be recorded at the start of each day's readings. Calibration records can be challenged by insurers during claim review.",
        },
      },
      {
        "@type": "Question",
        name: "How can RestoreAssist help me comply with AS-IICRC S500:2025?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "RestoreAssist automates the most demanding documentation requirements of S500:2025. The platform records psychrometric readings (temperature, RH, vapor pressure, GPP, dew point, EMC) at every data point and links them to room plans. Equipment audit trails are maintained with serial numbers, deployment dates, and hours operated. Calibration records for moisture meters are stored in the equipment register and automatically attached to reports. The system calculates VP differentials and generates a drying validation trend chart.",
        },
      },
    ],
  },
]

export default function S500GuideArticlePage() {
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
