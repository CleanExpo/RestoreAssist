import { prisma } from "@/lib/prisma";

export interface PortalAccountLookupResult {
  id: string;
  clientId: string;
  inspectionId: string | null;
  createdAt: Date;
  tokenRotatedAt: Date | null;
  expiresAt: Date | null;
  accessMode: PortalAccessMode;
}

export type PortalAccessMode = "READ_ONLY" | "INTERACTIVE";

export async function lookupPortalAccount(
  token: string | null | undefined,
): Promise<PortalAccountLookupResult | null> {
  if (!token || typeof token !== "string" || token.length === 0) {
    return null;
  }

  const account = await prisma.clientPortalAccount.findFirst({
    where: { token, revokedAt: null },
    select: {
      id: true,
      clientId: true,
      inspectionId: true,
      createdAt: true,
      tokenRotatedAt: true,
      expiresAt: true,
    },
  });

  if (!account) return null;

  if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  try {
    await prisma.clientPortalAccount.update({
      where: { id: account.id },
      data: { lastAccessedAt: new Date() },
    });
  } catch {
    // best-effort telemetry
  }

  return {
    ...account,
    accessMode: account.expiresAt instanceof Date ? "INTERACTIVE" : "READ_ONLY",
  };
}
