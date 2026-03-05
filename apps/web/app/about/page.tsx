import type { Metadata } from "next"
import AboutClient from "./about-client"

export const metadata: Metadata = {
  title: "About RestoreAssist — Built for Australia's Restoration Industry",
  description:
    "RestoreAssist is built by restoration professionals for restoration contractors across Australia. Compliance, inspections and invoicing in one platform.",
}

export default function AboutPage() {
  return <AboutClient />
}
