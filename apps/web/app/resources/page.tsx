import type { Metadata } from "next"
import ResourcesClient from "./resources-client"

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Documentation, support, and community resources to help you get the most out of Restore Assist.",
}

export default function ResourcesPage() {
  return <ResourcesClient />
}
