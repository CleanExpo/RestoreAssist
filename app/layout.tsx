import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import SessionProvider from "@/components/providers/SessionProvider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "react-hot-toast"
import { OrganizationSchema } from "@/components/seo/JsonLd"
import "@/lib/env-check"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "Restore Assist - Professional Restoration Reports",
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
    title: "Restore Assist - Professional Restoration Reports",
    description:
      "Generate comprehensive, legally defensible inspection reports backed by IICRC standards.",
    type: "website",
    locale: "en_AU",
    siteName: "Restore Assist",
  },
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
        <OrganizationSchema />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SessionProvider>{children}</SessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
                background: "#1e293b",
                color: "#f1f5f9",
                border: "1px solid #334155",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
            },
            success: {
              iconTheme: {
                  primary: "#10b981",
                  secondary: "#f1f5f9",
              },
            },
            error: {
              iconTheme: {
                  primary: "#ef4444",
                  secondary: "#f1f5f9",
              },
            },
          }}
        />
        </ThemeProvider>
      </body>
    </html>
  )
}
