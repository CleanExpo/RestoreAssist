/**
 * GET /api/oauth/google-drive/callback
 *
 * Onboarding hotfix (2026-05-14): completes the BYOK Google Drive OAuth flow
 * started by /api/oauth/google-drive/start. Validates the one-shot state
 * nonce, exchanges the auth code for tokens using the PKCE verifier stored
 * on the Organization, encrypts the tokens via lib/credential-vault, and
 * redirects the user back to /setup with a success flag.
 *
 * Errors always redirect to /setup?error=<reason> so the StorageCard can
 * render a friendly inline message.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateOAuthState } from "@/lib/integrations/oauth-handler";
import { encrypt } from "@/lib/credential-vault";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
} from "@/lib/storage/google-drive-oauth";

const SETUP_URL = (path: string) =>
  new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      SETUP_URL(`/setup?error=${encodeURIComponent(oauthError)}`),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      SETUP_URL("/setup?error=missing-code-or-state"),
    );
  }

  const stateData = await validateOAuthState(state);
  if (!stateData || stateData.provider !== "GOOGLE_DRIVE") {
    return NextResponse.redirect(SETUP_URL("/setup?error=invalid-state"));
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: stateData.userId },
    select: { id: true, storageProviderPkceVerifier: true },
  });
  if (!org?.storageProviderPkceVerifier) {
    return NextResponse.redirect(SETUP_URL("/setup?error=missing-pkce"));
  }

  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      SETUP_URL("/setup?error=drive-not-configured"),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: org.storageProviderPkceVerifier,
      redirectUri: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/oauth/google-drive/callback`,
      clientId,
      clientSecret,
    });
    const email = await fetchGoogleUserEmail(tokens.accessToken);

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        storageProvider: "GOOGLE_DRIVE",
        storageProviderAccessToken: tokens.accessToken
          ? encrypt(tokens.accessToken)
          : null,
        storageProviderRefreshToken: tokens.refreshToken
          ? encrypt(tokens.refreshToken)
          : null,
        storageProviderTokenExpiresAt: tokens.expiresAt,
        storageProviderAccountEmail: email,
        storageProviderPkceVerifier: null,
      },
    });

    return NextResponse.redirect(SETUP_URL("/setup?storage=connected"));
  } catch (err) {
    console.error("[google-drive/callback] exchange failed:", err);
    return NextResponse.redirect(
      SETUP_URL("/setup?error=token-exchange-failed"),
    );
  }
}
