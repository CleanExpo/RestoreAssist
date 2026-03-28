"use client"

import type { ReactNode } from "react"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "react-hot-toast"

/**
 * ClientProviders
 *
 * Isolates all client-only context providers and global UI into a single
 * "use client" boundary so that the root layout (app/layout.tsx) can remain
 * a pure React Server Component.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
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
    </NextAuthSessionProvider>
  )
}
