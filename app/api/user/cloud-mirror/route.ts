import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isProviderId, PROVIDER_CATALOG } from "@/lib/cloud-mirror";
import type { CloudMirrorProviderId } from "@/lib/cloud-mirror";

/**
 * RA-1459 — cloud mirror provider preference.
 *
 * GET  → { provider: "drive" | "onedrive" | "icloud" | null }
 * POST → body: { provider }
 *        Only enabled providers can be saved. OneDrive + iCloud return 400
 *        ("coming soon") so the picker UI can surface a friendly message
 *        even if its client-side gate is bypassed.
 */

interface GetResponse {
  provider: CloudMirrorProviderId | null;
}

export async function GET(_request: NextRequest): Promise<NextResponse<GetResponse | { error: string }>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { cloudMirrorProvider: true },
  });
  const stored = user?.cloudMirrorProvider;
  return NextResponse.json({
    provider: stored && isProviderId(stored) ? stored : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const provider: unknown = body?.provider;

  if (!isProviderId(provider)) {
    return NextResponse.json(
      { error: "provider must be one of: drive, onedrive, icloud" },
      { status: 400 },
    );
  }

  const catalogEntry = PROVIDER_CATALOG.find((p) => p.id === provider);
  if (!catalogEntry?.enabled) {
    return NextResponse.json(
      {
        error: `Provider "${provider}" is not yet available. Only Google Drive ships in v1.`,
      },
      { status: 400 },
    );
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { cloudMirrorProvider: provider },
    });
    return NextResponse.json({ success: true, provider });
  } catch (err) {
    console.error("[cloud-mirror POST] error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
