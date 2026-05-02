// lib/ios-billing-guard.ts — RA-1842 Path B
//
// Server-side fail-closed for Apple guideline 3.1.1.
//
// Apple App Review (build 1.0(3), 2026-05-01) rejected RestoreAssist
// because the iOS WebView accesses paid digital content without using
// Apple In-App Purchase. The strategic response (Path B, locked
// 2026-05-02) is: keep iOS free, sell only on the website.
//
// This module provides the server-side enforcement boundary. Clients
// running inside the iOS Capacitor shell inject `X-Capacitor-Platform:
// ios` on every fetch (see `components/capacitor/CapacitorFetchInit.tsx`).
// Checkout / subscription / billing API routes call `rejectIfIOSCapacitor`
// at the top of their handler — if the header is present, they 403
// with a JSON payload pointing the client at the website.
//
// The header alone isn't a security boundary (a hostile native client
// could omit it). It's not meant to be — Path B is a STORE-COMPLIANCE
// layer, not an anti-fraud layer. Stripe checkout still requires a
// valid authenticated session + CSRF + Stripe webhook signatures; that
// chain is the actual security.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const HEADER = "x-capacitor-platform";

/**
 * Return a 403 response if the request is coming from the iOS
 * Capacitor shell. Otherwise return null and let the route continue.
 *
 * Usage at the top of a billing route handler:
 *
 *   export async function POST(request: NextRequest) {
 *     const blocked = rejectIfIOSCapacitor(request);
 *     if (blocked) return blocked;
 *     // ... existing handler ...
 *   }
 */
export function rejectIfIOSCapacitor(request: NextRequest): NextResponse | null {
  const platform = (request.headers.get(HEADER) ?? "").trim().toLowerCase();
  if (platform !== "ios") return null;
  return NextResponse.json(
    {
      error: "billing_unavailable_on_ios",
      message:
        "RestoreAssist for iOS is free for field use. Subscriptions and " +
        "billing are managed on the website.",
      web_billing_url: "https://restoreassist.app/pricing",
    },
    { status: 403 },
  );
}

/** Lower-case header name. Exported for tests + the client interceptor. */
export const CAPACITOR_PLATFORM_HEADER = HEADER;
