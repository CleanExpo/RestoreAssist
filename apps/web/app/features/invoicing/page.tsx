import type { Metadata } from "next"
import InvoicingPage from "./InvoicingPage"

export const metadata: Metadata = {
  title: "Invoicing | RestoreAssist",
  description:
    "Generate professional restoration invoices with NRPG-compliant line items, automatic tax calculations, and one-click PDF export.",
}

export default function Page() {
  return <InvoicingPage />
}
