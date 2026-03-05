import type { Metadata } from "next"
import HelpClient from "./help-client"

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Get support for Restore Assist — FAQs, email support, live chat, and documentation for restoration professionals.",
}

export default function HelpPage() {
  return <HelpClient />
}
