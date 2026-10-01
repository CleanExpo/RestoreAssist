import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { OFFLINE_OWNER_HEADER, parseOfflineOwner, sameOfflineOwner, type OfflineOwner } from "./ownership";

/** Fresh database authority, without changing NextAuth's normal session policy. */
export async function verifiedOfflineOwner(request: NextRequest): Promise<OfflineOwner | null> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const mintedAt = token?.mintedAt ?? token?.iat;
  const expiresAt = token?.customExp ?? token?.exp;
  if (!token?.sub || token.revoked || typeof mintedAt !== "number" || !Number.isFinite(mintedAt) ||
      typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return null;
  const revoked = await prisma.securityEvent.findFirst({
    where: { userId: token.sub, eventType: "SESSIONS_REVOKED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
  });
  if (revoked && Math.floor(revoked.createdAt.getTime() / 1000) >= mintedAt) return null;
  const user = await prisma.user.findUnique({ where: { id: token.sub }, select: { id: true, organizationId: true } });
  if (!user) return null;
  // Same primary READY workspace resolver used by BYOK, never caller-selected.
  const workspace = await getWorkspaceForUser(user.id);
  const current = workspace ? await prisma.workspace.findUnique({ where: { id: workspace.id }, select: { ownerId: true, status: true } }) : null;
  if (workspace && (!current || current.status !== "READY")) return null;
  return { userId: user.id, organizationId: user.organizationId, workspaceId: workspace?.id ?? null, workspaceOwnerId: current?.ownerId ?? null };
}

export async function guardOfflineReplay(request: NextRequest): Promise<NextResponse | null> {
  const raw = request.headers.get(OFFLINE_OWNER_HEADER);
  if (raw === null) return null;
  const refused = (status: number) => NextResponse.json({ error: { code: "OFFLINE_CONTEXT_CHANGED", message: "Offline sync paused. Reconnect using the account and workspace that saved this work." } }, { status, headers: { "Cache-Control": "no-store", "x-restoreassist-offline-paused": "1" } });
  let expected: OfflineOwner | null;
  try { expected = raw.length <= 2400 ? parseOfflineOwner(JSON.parse(decodeURIComponent(raw))) : null; } catch { expected = null; }
  if (!expected) return refused(409);
  try {
    const actual = await verifiedOfflineOwner(request);
    if (!actual) return refused(401);
    if (!sameOfflineOwner(expected, actual)) return refused(409);
    return null;
  } catch { return refused(503); }
}
