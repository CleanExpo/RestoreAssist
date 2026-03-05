import type { Metadata } from "next"
import GuidesIndexClient from "./guides-index-client"

export const metadata: Metadata = {
  title: "Industry Guides — Restoration Standards & Compliance",
  description:
    "Authoritative guides for Australian restoration contractors. IICRC standards, compliance requirements, and best practices for water damage restoration professionals.",
  keywords: [
    "restoration guides",
    "IICRC standards guide",
    "water damage restoration guide",
    "Australian restoration compliance",
    "S500 guide",
  ],
  openGraph: {
    title: "Industry Guides — RestoreAssist",
    description:
      "Authoritative guides for Australian restoration contractors covering IICRC standards and compliance.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  alternates: { canonical: "/guides" },
}

export default function GuidesPage() {
  return <GuidesIndexClient />
}
