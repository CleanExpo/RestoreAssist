/**
 * GET /api/oauth/google-drive/status
 *
 * Onboarding hotfix (2026-05-14): read-only endpoint the StorageCard polls
 * on mount to decide whether to show the connect grid or the "Connected as
 * <email>" success row.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { storageProvider: true, storageProviderAccountEmail: true },
    });
    if (!org) {
      return NextResponse.json({
        connected: false,
        provider: null,
        accountEmail: null,
      });
    }
    const connected = org.storageProvider === "GOOGLE_DRIVE";
    return NextResponse.json({
      connected,
      provider: org.storageProvider,
      accountEmail: org.storageProviderAccountEmail,
    });
  } catch (err) {
    return fromException(undefined, err, { stage: "google-drive/status:get" });
  }
}
