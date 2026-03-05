import type { Metadata } from "next"
import NewToIndustryClient from "./new-to-industry-client"

export const metadata: Metadata = {
  title: "New to the Restoration Industry — Your Complete Guide | RestoreAssist",
  description:
    "Everything you need to know about starting a water, fire, or mould restoration business in Australia. IICRC certification, equipment, insurance, and how to win your first jobs.",
  keywords: [
    "new to restoration industry",
    "start restoration business Australia",
    "IICRC certification Australia",
    "restoration contractor guide",
    "water damage restoration business",
    "fire restoration business",
    "mould remediation business",
    "NRPG membership",
    "restoration equipment",
  ],
  openGraph: {
    title: "New to the Restoration Industry — RestoreAssist",
    description:
      "Your complete guide to starting a restoration business in Australia. Certifications, equipment, insurance, and more.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  alternates: { canonical: "/resources/new-to-industry" },
}

export default function NewToIndustryPage() {
  return <NewToIndustryClient />
}
