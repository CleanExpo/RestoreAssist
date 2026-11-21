import { prismaIfInitialised } from "@/lib/prisma";

/**
 * Disconnect the shared Prisma client on a CLI's way out, only if this run
 * initialised it. Resolves true when there was nothing to do or the disconnect
 * succeeded, false (after logging) when the disconnect itself failed, so the
 * caller can turn a cleanup failure into exit status 1. RA-7785.
 */
export async function disconnectCliPrisma(): Promise<boolean> {
  const client = prismaIfInitialised();
  if (!client) return true;
  try {
    await client.$disconnect();
    return true;
  } catch (error) {
    console.error("[prisma] disconnect failed:", error);
    return false;
  }
}
