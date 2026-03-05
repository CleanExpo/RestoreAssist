import type { Metadata } from "next"
import ContractorManagementPage from "./ContractorManagementPage"

export const metadata: Metadata = {
  title: "Contractor Management | RestoreAssist",
  description:
    "Manage your contractor network with RestoreAssist — verify credentials, track performance, and assign jobs from a single dashboard.",
}

export default function Page() {
  return <ContractorManagementPage />
}
