import type { Metadata } from "next"
import BlogClient from "./blog-client"

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights, tips, and updates from the restoration industry — AI assessment, IICRC compliance, and best practices.",
}

export default function BlogPage() {
  return <BlogClient />
}
