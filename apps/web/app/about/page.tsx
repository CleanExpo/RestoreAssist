import type { Metadata } from "next"
import AboutClient from "./about-client"

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about Restore Assist — empowering Australian restoration professionals with AI-powered damage assessment tools.",
}

export default function AboutPage() {
  return <AboutClient />
}
