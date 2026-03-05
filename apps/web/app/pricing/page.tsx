import type { Metadata } from "next"
import PricingClient from "./pricing-client"

export const metadata: Metadata = {
  title: "RestoreAssist Pricing — Plans for Restoration Contractors",
  description:
    "Affordable plans for Australian restoration contractors. Start free, then scale with monthly or annual subscriptions for inspections and invoicing.",
}

export default function PricingPage() {
  return <PricingClient />
}
