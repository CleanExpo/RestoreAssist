import type React from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
// RA-1572 adoption — mount the announcer once at the root so any
// descendant hook call lands in the polite / assertive aria-live
// regions rendered inside the provider.
import { AnnouncerProvider } from "@/components/LiveRegion";
import { Analytics } from "@vercel/analytics/next";
import "@/lib/env-check";
import "./globals.css";

// RA — /_not-found export was failing with "TypeError: Invalid URL" because
// metadataBase received an empty or malformed NEXTAUTH_URL at build time
// (the `||` fallback only catches empty/undefined, not a non-empty but invalid
// value such as a bare host without a protocol). Resolve it safely here so the
// URL constructor never receives a value it cannot parse.
function resolveMetadataBase(): URL {
  const candidate = process.env.NEXTAUTH_URL?.trim();
  if (candidate) {
    try {
      return new URL(candidate);
    } catch {
      // fall through to the safe default below
    }
  }
  try {
    return new URL("https://restoreassist.app");
  } catch {
    return new URL("http://localhost:3000");
  }
}

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
    template: `%s | ${BRAND.name}`,
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
  authors: [{ name: BRAND.name }],
  openGraph: {
    title: BRAND.meta.title,
    description: BRAND.meta.ogDescription,
    type: "website",
    // TODO RA-1120: locale should flow from Organization.country once per-tenant
    // session data includes it. Use getLocale(org.country) from @/lib/locale/format.
    // For now, defaults to en_AU.
    locale: "en_AU",
    siteName: BRAND.name,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: BRAND.name }],
  },
  alternates: { canonical: "/" },
  twitter: {
    card: "summary_large_image",
    title: BRAND.name,
    description: BRAND.meta.ogDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: resolveMetadataBase(),
    verification: {
          google: 'M9EIUGX0MryheGqhUpcXK-rqZMre1-CZE6TIqUsK7ro',
    },
};

// viewport-fit=cover is required for iPhone notch (iPhone 13+) in Capacitor WebView
// themeColor drives the browser address bar colour on Android + PWA splash — RA-1462
// WCAG 1.4.4 (Resize Text, Level AA) — never lock zoom. Removed
// maximumScale and userScalable; users must be able to zoom to 200%
// without horizontal scroll. viewport-fit=cover retained for iPhone
// notch in Capacitor WebView (RA-1462).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1C2E47",
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
      <body className={geistSans.className}>
        <OrganizationSchema />
        <SoftwareApplicationSchema />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AnnouncerProvider>
            <NirOfflineProvider>
              <SessionProvider>
                <CapacitorProvider>{children}</CapacitorProvider>
              </SessionProvider>
              <PwaInstallPrompt />
            </NirOfflineProvider>
          </AnnouncerProvider>
          {/* RA-1349 — Vercel Analytics (Web Vitals + client route events). */}
          <Analytics />
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
