import type { Metadata } from "next"
import FeaturesClient from "./features-client"

export const metadata: Metadata = {
  title: "RestoreAssist Features — Compliance, Jobs & Invoicing for Restoration Contractors",
  description:
    "AI-powered inspections, IICRC compliance, job management and invoicing in one platform. Built for Australian restoration contractors.",
}

export default function FeaturesPage() {
  return <FeaturesClient />
}
