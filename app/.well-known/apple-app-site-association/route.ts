/**
 * RA-1842 / Universal Links — Apple App Site Association.
 *
 * Served at https://restoreassist.app/.well-known/apple-app-site-association
 *
 * Purpose:
 *   1. Apple guideline 4 (Ground 3, RA-1842) — closes the cookie-sync
 *      gap in PR #866. When the OAuth callback redirects to
 *      https://restoreassist.app/dashboard, iOS intercepts the URL
 *      via Universal Links + closes the SFSafariViewController +
 *      hands the URL to the WebView. Session cookie travels with the
 *      navigation; user lands inside the app already authenticated.
 *
 *   2. Apple guideline 4.8 (Ground 2 — Sign in with Apple) — the
 *      `webcredentials` block lets the iOS app share credentials with
 *      Safari for a smoother SiwA flow when that ships (PR #868
 *      pending Apple Developer cap toggle).
 *
 * Why a route handler instead of a static file:
 *   - Auto-rotates `appID` from the APPLE_TEAM_ID env var so we don't
 *     check the team ID into git (some operators rotate it).
 *   - Hardcodes `Content-Type: application/json` (Apple's CDN
 *     rejects text/json) and `Cache-Control` long enough for Apple's
 *     CDN but short enough to recover from an env-var typo within a
 *     day.
 *   - Same route file documents the schema inline so future hands
 *     don't have to re-read Apple's spec.
 *
 * Setup runbook (one-time owner steps): docs/IOS_UNIVERSAL_LINKS.md
 *
 * Schema reference:
 * https://developer.apple.com/documentation/xcode/supporting-associated-domains
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86_400; // 1 day — match Apple's CDN cache window

const BUNDLE_ID = "com.restoreassist.app";

interface AppleAppSiteAssociation {
  applinks: {
    apps: string[];
    details: Array<{
      appID: string;
      appIDs?: string[];
      paths?: string[];
      components?: Array<{
        "/"?: string;
        "?"?: Record<string, string>;
        "#"?: string;
        comment?: string;
        exclude?: boolean;
        caseSensitive?: boolean;
        percentEncoded?: boolean;
      }>;
    }>;
  };
  webcredentials?: {
    apps: string[];
  };
}

function buildAasa(): AppleAppSiteAssociation {
  const teamId = (process.env.APPLE_TEAM_ID || "").trim();
  const appID = teamId ? `${teamId}.${BUNDLE_ID}` : BUNDLE_ID;

  return {
    applinks: {
      // Pre-iOS 13 syntax — apps array MUST be empty.
      apps: [],
      details: [
        {
          appID,
          // iOS 13+ also accepts appIDs as an array; keep both populated
          // so older runtimes consuming the file still work.
          appIDs: [appID],
          // Components — every URL on restoreassist.app is a Universal
          // Link target EXCEPT the explicit web-only flows below.
          components: [
            {
              "/": "/api/auth/*",
              comment: "next-auth callback URLs MUST stay in the browser so the OAuth dance completes there before iOS intercepts the final redirect",
              exclude: true,
            },
            {
              "/": "/api/*",
              comment: "API routes are server-only; never intercept",
              exclude: true,
            },
            {
              "/": "/_next/*",
              comment: "Next.js internals; never intercept",
              exclude: true,
            },
            {
              "/": "/.well-known/*",
              comment: "Well-known files (this file, security.txt, etc) — never intercept",
              exclude: true,
            },
            {
              "/": "*",
              comment: "Default: every other path on restoreassist.app opens in the iOS app when installed",
            },
          ],
        },
      ],
    },
    webcredentials: {
      // Lets the iOS app share credentials with Safari, used by Sign
      // in with Apple credential autofill. Belongs here even though
      // SiwA itself isn't shipped yet — adding it later requires the
      // CDN cache to flush which can take 24h.
      apps: [appID],
    },
  };
}

export function GET() {
  const body = JSON.stringify(buildAasa());
  return new NextResponse(body, {
    status: 200,
    headers: {
      // Apple's CDN explicitly rejects text/json; must be application/json.
      "Content-Type": "application/json",
      // 1d cache aligns with Apple's CDN. Short enough to recover from
      // a typo'd APPLE_TEAM_ID; long enough to avoid hammering Vercel
      // on every Universal-Links validation.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
