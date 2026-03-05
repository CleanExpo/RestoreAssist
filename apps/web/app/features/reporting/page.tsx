import type { Metadata } from "next"
import ReportingPage from "./ReportingPage"

export const metadata: Metadata = {
  title: "Reporting | RestoreAssist",
  description:
    "Generate detailed restoration reports with photo evidence, moisture readings, and compliance documentation — all from one platform.",
}

export default function Page() {
  return <ReportingPage />
}
