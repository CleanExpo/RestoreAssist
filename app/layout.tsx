import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import ClientProviders from "@/components/providers/ClientProviders"
import { OrganizationSchema, SoftwareApplicationSchema } from "@/components/seo/JsonLd"
import "@/lib/env-check"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "Restore Assist - AI-Powered Restoration Reports for Australia",
    template: "%s | Restore Assist",
  },
  description:
    "Generate comprehensive, legally defensible inspection reports and cost estimates for property restoration claims backed by IICRC standards and Australian compliance.",
  keywords: [
    "restoration reports",
    "IICRC compliance",
    "property damage assessment",
    "insurance claims",
    "water damage restoration",
    "cost estimation",
    "inspection reports",
    "Australian building standards",
  ],
  authors: [{ name: "Restore Assist" }],
  openGraph: {
    title: "Restore Assist - AI-Powered Restoration Reports for Australia",
    description:
      "Generate comprehensive, legally defensible inspection reports backed by IICRC standards.",
    type: "website",
    locale: "en_AU",
    siteName: "Restore Assist",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" }],
  },
  alternates: { canonical: "/" },
  twitter: {
    card: "summary_large_image",
    title: "Restore Assist",
    description:
      "Professional restoration reports backed by IICRC standards and Australian compliance.",
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://restoreassist.com.au"),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* JSON-LD structured data — server-rendered, no JS required */}
        <OrganizationSchema />
        <SoftwareApplicationSchema />
        {/* All client-only providers are isolated in ClientProviders */}
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
