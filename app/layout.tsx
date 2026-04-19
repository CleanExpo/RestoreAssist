import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Geist, Geist_Mono } from "next/font/google";
// RA-1290 — Geist/Geist Mono are declared as --font-sans/--font-mono in
// globals.css but were previously only available via the system-font
// fallback stack. Loading via next/font gives preloaded, display=swap
// webfonts instead of Flash-of-Unstyled-Text + render-blocking CSS.
import { BRAND } from "@/lib/brand";
import SessionProvider from "@/components/providers/SessionProvider";
import { CapacitorProvider } from "@/components/providers/CapacitorProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "react-hot-toast";
import {
  OrganizationSchema,
  SoftwareApplicationSchema,
} from "@/components/seo/JsonLd";
import { NirOfflineProvider } from "@/components/nir-offline-provider";
import "@/lib/env-check";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.meta.title,
    template: "%s | Restore Assist",
  },
  description: BRAND.meta.description,
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
    title: BRAND.meta.title,
    description: BRAND.meta.ogDescription,
    type: "website",
    // TODO RA-1120: locale should flow from Organization.country once per-tenant
    // session data includes it. Use getLocale(org.country) from @/lib/locale/format.
    // For now, defaults to en_AU.
    locale: "en_AU",
    siteName: "Restore Assist",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/" },
  twitter: {
    card: "summary_large_image",
    title: "Restore Assist",
    description: BRAND.meta.ogDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL(
    process.env.NEXTAUTH_URL || "https://restoreassist.app",
  ),
};

// viewport-fit=cover is required for iPhone notch (iPhone 13+) in Capacitor WebView
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className={inter.className}>
        <OrganizationSchema />
        <SoftwareApplicationSchema />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NirOfflineProvider>
            <SessionProvider>
              <CapacitorProvider>{children}</CapacitorProvider>
            </SessionProvider>
          </NirOfflineProvider>
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
  );
}
