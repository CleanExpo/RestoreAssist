import type { Metadata } from "next"
import DiagramsClient from "./diagrams-client"

export const metadata: Metadata = {
  title: "Compliance Workflow Diagrams — Visual Audit Trails | RestoreAssist",
  description:
    "Visual compliance workflow diagrams for water damage restoration. Understand the restoration process and insurance claim audit trail with clear, step-by-step flowcharts.",
  keywords: [
    "restoration workflow diagram",
    "compliance flowchart",
    "water damage process",
    "insurance claim audit trail",
    "contractor compliance checklist",
    "IICRC workflow",
  ],
  openGraph: {
    title: "Compliance Workflow Diagrams — RestoreAssist",
    description:
      "Visual audit trails for water damage restoration compliance workflows.",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  alternates: { canonical: "/compliance/diagrams" },
}

export default function ComplianceDiagramsPage() {
  return <DiagramsClient />
}
