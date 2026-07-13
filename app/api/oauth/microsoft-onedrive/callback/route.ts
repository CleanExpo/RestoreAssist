/**
 * GET /api/oauth/microsoft-onedrive/callback
 *
 * Completes Microsoft OAuth for OneDrive cloud mirror. Validates state,
 * exchanges code for tokens, upserts Account (provider = azure-ad).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateOAuthState } from "@/lib/integrations/oauth-handler";
import { applyRateLimit } from "@/lib/rate-limiter";
import {
  exchangeMicrosoftCodeForTokens,
  fetchMicrosoftUserProfile,
  upsertMicrosoftAccount,
} from "@/lib/cloud-mirror/onedrive";

const SETTINGS_URL = (path: string) =>
  new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000");

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
    prefix: "microsoft-onedrive-oauth-callback",
  });
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      SETTINGS_URL(
        `/dashboard/settings/cloud-mirror?error=${encodeURIComponent(oauthError)}`,
      ),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      SETTINGS_URL("/dashboard/settings/cloud-mirror?error=missing-code-or-state"),
    );
  }

  const stateData = await validateOAuthState(state);
  if (!stateData || stateData.provider !== "MICROSOFT_ONEDRIVE") {
    return NextResponse.redirect(
      SETTINGS_URL("/dashboard/settings/cloud-mirror?error=invalid-state"),
    );
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      SETTINGS_URL("/dashboard/settings/cloud-mirror?error=onedrive-not-configured"),
    );
  }

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/oauth/microsoft-onedrive/callback`;
    const tokens = await exchangeMicrosoftCodeForTokens({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });
    const profile = await fetchMicrosoftUserProfile(tokens.accessToken);

    await upsertMicrosoftAccount({
      userId: stateData.userId,
      providerAccountId: profile.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    return NextResponse.redirect(
      SETTINGS_URL("/dashboard/settings/cloud-mirror?onedrive=connected"),
    );
  } catch (err) {
    console.error("[microsoft-onedrive/callback] exchange failed:", err);
    return NextResponse.redirect(
      SETTINGS_URL("/dashboard/settings/cloud-mirror?error=token-exchange-failed"),
    );
  }
}
