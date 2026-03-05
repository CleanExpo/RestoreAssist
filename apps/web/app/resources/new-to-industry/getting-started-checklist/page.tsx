import type { Metadata } from "next"
import ChecklistClient from "./checklist-client"

export const metadata: Metadata = {
  title: "Getting Started Checklist — Launch Your Restoration Business | RestoreAssist",
  description:
    "The complete step-by-step checklist to start a restoration business in Australia. ABN registration, IICRC certification, NRPG membership, equipment, insurance, and more.",
  keywords: [
    "restoration business checklist",
    "start restoration company Australia",
    "restoration contractor setup",
    "IICRC WRT checklist",
    "restoration business requirements",
  ],
  openGraph: {
    title: "Getting Started Checklist — RestoreAssist",
    description:
      "Step-by-step checklist to launch your restoration business in Australia.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  alternates: { canonical: "/resources/new-to-industry/getting-started-checklist" },
}

export default function GettingStartedChecklistPage() {
  return <ChecklistClient />
}
