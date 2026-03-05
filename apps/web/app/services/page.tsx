import type { Metadata } from "next"
import ServicesClient from "./services-client"

export const metadata: Metadata = {
  title: "Restoration Services — IICRC Compliant | RestoreAssist",
  description:
    "Explore IICRC-compliant restoration services across Australia. Water damage restoration (S500), mould remediation (S520), and more — delivered by certified contractors.",
  keywords: [
    "restoration services australia",
    "water damage restoration",
    "mould remediation",
    "IICRC certified services",
    "restoration contractor australia",
  ],
  openGraph: {
    title: "Restoration Services — IICRC Compliant | RestoreAssist",
    description:
      "Explore IICRC-compliant restoration services across Australia. Water damage, mould remediation, and more.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "RestoreAssist" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Restoration Services — IICRC Compliant | RestoreAssist",
    description:
      "IICRC-compliant restoration services across Australia.",
  },
  alternates: {
    canonical: "/services",
  },
}

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Restoration Services — IICRC Compliant",
    description:
      "Explore IICRC-compliant restoration services across Australia.",
    url: "https://restoreassist.com.au/services",
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
    ],
  },
]

export default function ServicesPage() {
  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <ServicesClient />
    </>
  )
}
