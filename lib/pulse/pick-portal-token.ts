export interface PulsePortalAccount {
  token: string;
  inspectionId: string | null;
  createdAt: Date;
}

/**
 * The portal link a Pulse email about one job should carry.
 *
 * A link bound to this job wins. A link issued before binding existed
 * (`inspectionId` null) is the fallback. A link bound to a DIFFERENT job is
 * never used: it would open that other job from an email about this one
 * (WP-02). Accounts come newest first.
 */
export function pickPortalToken(
  accounts: PulsePortalAccount[],
  inspectionId: string,
): string | null {
  const bound = accounts.find((a) => a.inspectionId === inspectionId);
  if (bound) return bound.token;
  return accounts.find((a) => a.inspectionId === null)?.token ?? null;
}
