/**
 * GET /api/oauth/microsoft-onedrive/status
 *
 * Returns whether the current user has linked OneDrive (azure-ad Account).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptAccountTokens } from "@/lib/auth/account-tokens";
import { fetchMicrosoftUserProfile } from "@/lib/cloud-mirror/onedrive";
import { apiError, fromException } from "@/lib/api-errors";

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

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "azure-ad" },
      select: { access_token: true, providerAccountId: true },
    });

    if (!account?.access_token) {
      return NextResponse.json({
        connected: false,
        accountEmail: null,
      });
    }

    let accountEmail: string | null = null;
    try {
      const tokens = decryptAccountTokens(account);
      if (tokens.access_token) {
        const profile = await fetchMicrosoftUserProfile(tokens.access_token);
        accountEmail = profile.email;
      }
    } catch {
      accountEmail = account.providerAccountId;
    }

    return NextResponse.json({
      connected: true,
      accountEmail,
    });
  } catch (err) {
    return fromException(request, err, { stage: "microsoft-onedrive/status:get" });
  }
}
