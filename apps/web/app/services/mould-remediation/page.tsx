import type { Metadata } from "next"
import MouldRemediationClient from "./mould-remediation-client"

export const metadata: Metadata = {
  title: "Mould Remediation — IICRC S520 Standard | RestoreAssist",
  description:
    "Professional mould remediation following IICRC S520 standards. Learn about health risks, containment protocols, AMRT certification, and clearance testing for Australian contractors.",
  keywords: [
    "mould remediation australia",
    "mould removal contractor",
    "IICRC mould certification",
    "IICRC S520",
    "AMRT certification",
    "mould assessment",
    "mould containment",
    "clearance testing mould",
  ],
  openGraph: {
    title: "Mould Remediation — IICRC S520 Standard | RestoreAssist",
    description:
      "Professional mould remediation following IICRC S520 standards. Health risks, containment protocols, and AMRT certification for Australian contractors.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mould Remediation — IICRC S520 Standard | RestoreAssist",
    description:
      "Professional mould remediation following IICRC S520 standards across Australia.",
  },
  alternates: {
    canonical: "/services/mould-remediation",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Mould Remediation — IICRC S520 Standard",
    description:
      "Professional mould remediation following IICRC S520 standards. Health risks, containment protocols, and AMRT certification for Australian contractors.",
    url: "https://restoreassist.com.au/services/mould-remediation",
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
        name: "Mould Remediation",
        item: "https://restoreassist.com.au/services/mould-remediation",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the IICRC S520 standard?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The IICRC S520 is the Standard and Reference Guide for Professional Mould Remediation. It provides a framework for assessment, containment, removal, and post-remediation verification of mould contamination.",
        },
      },
      {
        "@type": "Question",
        name: "What is an AMRT certification?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AMRT (Applied Microbial Remediation Technician) is an IICRC certification qualifying professionals to perform mould remediation in accordance with the S520 standard.",
        },
      },
      {
        "@type": "Question",
        name: "Is mould dangerous to health?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Mould exposure can cause respiratory issues, allergic reactions, and in severe cases chronic health conditions. Certain species produce mycotoxins that pose serious health risks.",
        },
      },
      {
        "@type": "Question",
        name: "What is clearance testing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Clearance testing is post-remediation verification where an independent assessor confirms mould levels have been reduced to acceptable levels through visual inspection and sampling.",
        },
      },
    ],
  },
]

export default function MouldRemediationPage() {
  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <MouldRemediationClient />
    </>
  )
}
