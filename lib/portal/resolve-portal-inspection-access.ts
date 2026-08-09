import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";

export interface PortalInspectionAccess {
  inspectionId: string;
  clientId: string | null;
  source: "ACCOUNT" | "LEGACY_HMAC";
  accessMode: "READ_ONLY" | "INTERACTIVE";
}

export async function resolvePortalInspectionAccess(
  token: string | null | undefined,
): Promise<PortalInspectionAccess | null> {
  if (!token || typeof token !== "string") return null;

  const account = await prisma.clientPortalAccount.findUnique({
    where: { token },
    select: {
      id: true,
      clientId: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (account) {
    if (
      account.revokedAt !== null ||
      (account.expiresAt !== null && account.expiresAt.getTime() <= Date.now())
    ) {
      return null;
    }

    const latestInspection = await prisma.inspection.findFirst({
      where: { report: { clientId: account.clientId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!latestInspection) return null;

    try {
      await prisma.clientPortalAccount.update({
        where: { id: account.id },
        data: { lastAccessedAt: new Date() },
      });
    } catch {
      // Access-time telemetry must not block a valid portal read.
    }

    return {
      inspectionId: latestInspection.id,
      clientId: account.clientId,
      source: "ACCOUNT",
      accessMode: account.expiresAt === null ? "READ_ONLY" : "INTERACTIVE",
    };
  }

  let legacy: ReturnType<typeof verifyPortalToken>;
  try {
    legacy = verifyPortalToken(token);
  } catch (error) {
    console.error(
      "[portal-access] legacy token verification unavailable",
      error,
    );
    return null;
  }
  if (!legacy) return null;

  return {
    inspectionId: legacy.inspectionId,
    clientId: null,
    source: "LEGACY_HMAC",
    accessMode: "READ_ONLY",
  };
}
