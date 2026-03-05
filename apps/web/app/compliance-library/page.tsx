import type { Metadata } from "next"
import ComplianceLibraryClient from "./compliance-library-client"

export const metadata: Metadata = {
  title: "Compliance Library",
  description:
    "Access IICRC, Australian standards, and insurance compliance documentation for restoration professionals.",
}

export default function ComplianceLibraryPage() {
  return <ComplianceLibraryClient />
}
