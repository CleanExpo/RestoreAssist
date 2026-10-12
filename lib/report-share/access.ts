import { randomBytes } from "crypto";
import type { ReportShareScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyInsurerToken } from "@/lib/portal-token";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateOpaqueShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function mintReportShareAccess(input: {
  reportId: string;
  scope: ReportShareScope;
  createdByUserId: string;
  ttlMs?: number;
}): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = generateOpaqueShareToken();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS));
  const row = await prisma.reportShareAccess.create({
    data: {
      reportId: input.reportId,
      token,
      scope: input.scope,
      expiresAt,
      createdByUserId: input.createdByUserId,
    },
    select: { id: true, token: true, expiresAt: true },
  });
  return row;
}

export async function lookupReportShareAccess(token: string) {
  const row = await prisma.reportShareAccess.findUnique({
    where: { token },
    select: {
      id: true,
      reportId: true,
      scope: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  await prisma.reportShareAccess
    .update({
      where: { id: row.id },
      data: { lastAccessedAt: new Date() },
    })
    .catch(() => undefined);
  return row;
}

/**
 * Resolve a report read token: DB-backed share access first, then legacy HMAC insurer tokens.
 */
export async function verifyReportReaderToken(
  token: string,
): Promise<{ reportId: string; scope: ReportShareScope | "LEGACY_HMAC" } | null> {
  const stored = await lookupReportShareAccess(token);
  if (stored) {
    return { reportId: stored.reportId, scope: stored.scope };
  }
  const legacy = verifyInsurerToken(token);
  if (legacy) {
    return { reportId: legacy.reportId, scope: "LEGACY_HMAC" };
  }
  return null;
}

export async function revokeReportShareAccess(
  accessId: string,
  reportId: string,
): Promise<boolean> {
  const result = await prisma.reportShareAccess.updateMany({
    where: { id: accessId, reportId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
