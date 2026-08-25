import type { Prisma } from "@prisma/client";

/** Canonical identity used by every account/invitation boundary. */
export function canonicalEmail(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

/**
 * Serialises User and UserInvite writes for one canonical email. Both sides of
 * the registration/invitation race must take this transaction-scoped lock.
 */
export async function lockEmailIdentity(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<void> {
  const canonical = canonicalEmail(email);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${canonical}, 0))`;
}
