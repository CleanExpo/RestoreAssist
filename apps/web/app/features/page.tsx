import type { Metadata } from "next"
import FeaturesClient from "./features-client"

export const metadata: Metadata = {
  title: "Features",
  description:
    "AI-powered damage assessment, IICRC S500 compliance, multi-hazard support, and real-time cost calculation for restoration professionals.",
}

export default function FeaturesPage() {
  return <FeaturesClient />
}
