import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import SessionProvider from "@/components/providers/SessionProvider"
import { Toaster } from "react-hot-toast"
import "@/lib/env-check"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Restore Assist - Professional Restoration Reports",
  description:
    "Generate comprehensive, legally defensible inspection reports and cost estimates for property restoration claims backed by IICRC standards and Australian compliance.",
  keywords: "restoration, reports, IICRC, compliance, property damage, insurance",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              fontWeight: '500',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#f1f5f9',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#f1f5f9',
              },
            },
          }}
        />
      </body>
    </html>
  )
}
