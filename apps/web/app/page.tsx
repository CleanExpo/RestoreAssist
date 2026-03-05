import type { Metadata } from "next"
import HomeClient from "./home-client"

export const metadata: Metadata = {
  title: "RestoreAssist — Australia's Compliance Platform for Restoration Contractors",
  description:
    "Restoration contractor platform for IICRC-compliant inspections, scoping, estimating and invoicing. Built for Australian restoration professionals.",
  openGraph: {
    title: "RestoreAssist — Australia's Compliance Platform for Restoration Contractors",
    description:
      "Restoration contractor platform for IICRC-compliant inspections, scoping, estimating and invoicing.",
    type: "website",
    locale: "en_AU",
    siteName: "RestoreAssist",
  },
}

export default function Home() {
  return <HomeClient />
}
