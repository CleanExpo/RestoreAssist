/**
 * GET /api/oauth/google-drive/start
 *
 * Onboarding hotfix (2026-05-14): kicks off the BYOK Google Drive OAuth 2.0
 * + PKCE flow for the setup wizard StorageCard. Reuses the existing
 * OAuthStateNonce model + generatePKCE helper to avoid inventing a new
 * state-machine.
 *
 * Flow:
 *   1. Resolve session → 401 if absent.
 *   2. Resolve the user's Organization → /setup?error=no-org if absent.
 *   3. Mint a state nonce (DB-backed, one-shot, 10-min TTL).
 *   4. Generate a PKCE verifier/challenge pair; persist the verifier on the
 *      Organization row (transient — cleared on successful callback).
 *   5. Redirect to Google's auth endpoint with drive.file + drive.appdata.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePKCE } from "@/lib/integrations/oauth-handler";
import { buildGoogleDriveAuthUrl } from "@/lib/storage/google-drive-oauth";
import { apiError, fromException } from "@/lib/api-errors";

const SETUP_URL = (path: string) =>
  new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.redirect(SETUP_URL("/setup?error=no-org"));
    }

    const clientId =
      process.env.GOOGLE_DRIVE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(
        SETUP_URL("/setup?error=drive-not-configured"),
      );
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.oAuthStateNonce.create({
      data: {
        nonce,
        userId: session.user.id,
        provider: "GOOGLE_DRIVE",
        expiresAt,
      },
    });

    const { codeVerifier, codeChallenge } = generatePKCE();
    await prisma.organization.update({
      where: { id: org.id },
      data: { storageProviderPkceVerifier: codeVerifier },
    });

    const redirectUri = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/oauth/google-drive/callback`;
    const authUrl = buildGoogleDriveAuthUrl({
      state: nonce,
      codeChallenge,
      redirectUri,
      clientId,
    });
    return NextResponse.redirect(authUrl);
  } catch (err) {
    return fromException(request, err, { stage: "google-drive/start:get" });
  }
}
