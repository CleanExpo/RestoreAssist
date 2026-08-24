import type React from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// RA-1290 — Geist/Geist Mono are declared as --font-sans/--font-mono in
// globals.css but were previously only available via the system-font
// fallback stack. Loading via next/font gives preloaded, display=swap
// webfonts instead of Flash-of-Unstyled-Text + render-blocking CSS.
import { BRAND } from "@/lib/brand";
import { OG_SHARE_PATH, ogAlt, ogSize } from "@/lib/og/constants";
import SessionProvider from "@/components/providers/SessionProvider";
import { CapacitorProvider } from "@/components/providers/CapacitorProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { SafeToaster } from "@/components/providers/SafeToaster";
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
import { ConvaiWidget } from "@/components/support/ConvaiWidget";
import { PublicAssistantOrb } from "@/components/avatar";
import { BotIdClient } from "botid/client";
import "@/lib/env-check";
import "./globals.css";

// RA-1286 — Vercel BotID. `BotIdClient` injects a client script and MUST be
// mounted in the root layout <head>; rendering it in a page body throws Next
// 16's "script tag while rendering" error AND the script never executes, so
// the bot signal silently fails. One mount here covers every protected route.
// Docs: node_modules/botid/README.md ("Mount the <BotIdClient/> in your layout").
const BOTID_PROTECTED_ROUTES = [
  { path: "/api/auth/register", method: "POST" },
  { path: "/api/auth/forgot-password", method: "POST" },
  { path: "/api/auth/reset-password", method: "POST" },
];

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
    "restoration CRM Australia",
    "IICRC S500 reports",
    "restoration field management",
    "water damage restoration software",
    "property damage assessment",
    "insurance claims documentation",
    "Australian building standards",
    "NCC 2022 compliance",
    "restoration invoicing GST",
    "office and field CRM",
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
    // Versioned /og path — hard cache-bust for LinkedIn/Slack still holding
    // the old navy card at /opengraph-image. Resolved absolute via metadataBase.
    images: [
      {
        url: OG_SHARE_PATH,
        width: ogSize.width,
        height: ogSize.height,
        alt: ogAlt,
      },
    ],
  },
  alternates: { canonical: "/" },
  twitter: {
    card: "summary_large_image",
    title: BRAND.meta.title,
    description: BRAND.meta.ogDescription,
    images: [OG_SHARE_PATH],
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

// NOTE: the iOS-shell platform verdict is deliberately NOT resolved here.
// Calling headers() in the root layout opts EVERY route out of static
// rendering (measured: 68 static -> 7). It is scoped instead to the three
// segments that contain a BillingGate — app/dashboard, app/pricing and
// app/compliance — see their layouts.
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
      <head>
        <BotIdClient protect={BOTID_PROTECTED_ROUTES} />
        {/* Dev-only: unregister leftover NIR SWs early. Do not force-reload —
            that races the Next router. SW v2.1 also self-destructs on localhost. */}
        {process.env.NODE_ENV !== "production" ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(!("serviceWorker"in navigator))return;navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister()});if("caches"in window){caches.keys().then(function(keys){keys.filter(function(k){return k.indexOf("nir-")===0}).forEach(function(k){caches.delete(k)})})}}).catch(function(){})}catch(e){}})();`,
            }}
          />
        ) : null}
      </head>
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
          {/* ElevenLabs convai support voice widget — dark by default; renders
              nothing until NEXT_PUBLIC_ELEVENLABS_AGENT_ID is set. */}
          <ConvaiWidget />
          {/* Daylight floating guide on public pages (hidden on dashboard/portal). */}
          <PublicAssistantOrb />
          {/* Coerces API error objects so toast.error({code,message,eventId})
              cannot crash the React tree. */}
          <SafeToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
