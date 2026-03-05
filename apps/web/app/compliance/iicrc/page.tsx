import type { Metadata } from "next"
import ComplianceSubPage from "./ComplianceSubPage"

export const metadata: Metadata = {
  title: "IICRC Compliance | RestoreAssist",
  description:
    "Learn how RestoreAssist ensures full IICRC S500 and S520 compliance for water damage and mould restoration assessments.",
}

export default function IICRCCompliancePage() {
  return <ComplianceSubPage />
}
