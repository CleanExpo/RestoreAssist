import type { Metadata } from "next"
import SolutionsClient from "./solutions-client"

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Tailored solutions for restoration companies, insurance adjusters, and property managers using Restore Assist.",
}

export default function SolutionsPage() {
  return <SolutionsClient />
}
