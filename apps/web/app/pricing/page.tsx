import type { Metadata } from "next"
import PricingClient from "./pricing-client"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free with 3 reports. Upgrade for unlimited Quick Fill, enhanced reports, and PDF uploads. Plans for every restoration business.",
}

export default function PricingPage() {
  return <PricingClient />
}
