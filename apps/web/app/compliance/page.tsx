import type { Metadata } from "next"
import ComplianceClient from "./compliance-client"

export const metadata: Metadata = {
  title: "Restoration Contractor Compliance — IICRC, NRPG & Licence Management",
  description:
    "Manage IICRC, NRPG and licence compliance for your restoration business. Automated standards tracking for Australian restoration contractors.",
}

export default function CompliancePage() {
  return <ComplianceClient />
}
