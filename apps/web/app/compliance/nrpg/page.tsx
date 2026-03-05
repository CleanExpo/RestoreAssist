import type { Metadata } from "next"
import NRPGSubPage from "./NRPGSubPage"

export const metadata: Metadata = {
  title: "NRPG Compliance | RestoreAssist",
  description:
    "RestoreAssist enforces NRPG-rated pricing boundaries for contractor quotes, ensuring fair and compliant restoration costing.",
}

export default function NRPGCompliancePage() {
  return <NRPGSubPage />
}
