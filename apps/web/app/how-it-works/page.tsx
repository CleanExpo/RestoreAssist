import type { Metadata } from "next"
import HowItWorksClient from "./how-it-works-client"

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From inspection to final report in 5 steps — see how Restore Assist streamlines the restoration workflow.",
}

export default function HowItWorksPage() {
  return <HowItWorksClient />
}
