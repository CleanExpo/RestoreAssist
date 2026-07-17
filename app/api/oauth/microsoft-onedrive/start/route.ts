/**
 * GET /api/oauth/microsoft-onedrive/start
 *
 * Starts Microsoft OAuth for OneDrive cloud mirror (Files.ReadWrite).
 * Uses DB-backed OAuthStateNonce for one-shot state validation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMicrosoftAuthorizeUrl } from "@/lib/cloud-mirror/onedrive";
import { apiError, fromException } from "@/lib/api-errors";

const SETTINGS_URL = (path: string) =>
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

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(
        SETTINGS_URL("/dashboard/settings/cloud-mirror?error=onedrive-not-configured"),
      );
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.oAuthStateNonce.create({
      data: {
        nonce,
        userId: session.user.id,
        provider: "MICROSOFT_ONEDRIVE",
        expiresAt,
      },
    });

    const redirectUri = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/oauth/microsoft-onedrive/callback`;
    const authUrl = buildMicrosoftAuthorizeUrl({
      clientId,
      redirectUri,
      state: nonce,
    });

    return NextResponse.redirect(authUrl);
  } catch (err) {
    return fromException(request, err, { stage: "microsoft-onedrive/start:get" });
  }
}
