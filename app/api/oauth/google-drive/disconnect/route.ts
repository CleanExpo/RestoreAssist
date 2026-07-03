/**
 * POST /api/oauth/google-drive/disconnect
 *
 * RA-6942: Clears the org's BYOK Google Drive connection. Nulls the
 * storage-provider token fields and reverts the provider to SUPABASE so the
 * storage settings UI shows disconnected and the mirror queue stops targeting
 * Drive. There is no server-side Google token-revoke helper in the codebase;
 * clearing the local grant is sufficient to disconnect the workspace.
 *
 * Owner-only: only the org owner set up the grant, so only the owner clears it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
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
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No organisation found for this user",
        status: 404,
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        storageProvider: "SUPABASE",
        storageProviderAccessToken: null,
        storageProviderRefreshToken: null,
        storageProviderTokenExpiresAt: null,
        storageProviderAccountEmail: null,
        storageProviderPkceVerifier: null,
      },
    });

    return NextResponse.json({ connected: false, provider: "SUPABASE" });
  } catch (err) {
    return fromException(request, err, { stage: "google-drive/disconnect:post" });
  }
}
