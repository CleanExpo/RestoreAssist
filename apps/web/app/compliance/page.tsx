import type { Metadata } from "next"
import ComplianceClient from "./compliance-client"

export const metadata: Metadata = {
  title: "Compliance",
  description:
    "Ensure your restoration assessments meet IICRC S500, NCC 2022, AS/NZS, and Australian insurance standards with Restore Assist.",
}

export default function CompliancePage() {
  return <ComplianceClient />
}
