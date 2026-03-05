import type React from "react"
import type { Metadata } from "next"
import { NexusSiblingBar } from "@/components/nexus"

export const metadata: Metadata = {
  title: {
    default: "Restore Assist - AI-Powered Restoration Reports for Australia",
    template: "%s | Restore Assist",
  },
  description:
    "Generate comprehensive, legally defensible inspection reports and cost estimates for property restoration claims backed by IICRC standards and Australian compliance.",
  keywords: [
    "restoration reports",
    "IICRC compliance",
    "property damage assessment",
    "insurance claims",
    "water damage restoration",
    "cost estimation",
    "inspection reports",
    "Australian building standards",
  ],
  openGraph: {
    title: "Restore Assist - AI-Powered Restoration Reports for Australia",
    description:
      "Generate comprehensive, legally defensible inspection reports backed by IICRC standards.",
    type: "website",
    locale: "en_AU",
    siteName: "Restore Assist",
  },
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <NexusSiblingBar darkMode />
      {children}
    </>
  )
}
