import type { Metadata } from "next"
import FAQClient from "./faq-client"

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Find answers to common questions about Restore Assist — AI assessments, compliance, pricing, exports, and integrations.",
}

export default function FAQPage() {
  return <FAQClient />
}
