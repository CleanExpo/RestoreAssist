const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Expiry wording for an invite card. The page's formatDate only handles past
 * dates, so a future expiry printed as "Expires -7 days ago" (prelaunch J-13).
 */
export function formatInviteExpiry(expiresAt: string, now: number = Date.now()): string {
  const diffMs = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(diffMs)) return "Expiry unknown";
  // Same boundary as the card's isExpired (expiresAt < now).
  if (diffMs < 0) {
    const daysAgo = Math.floor(-diffMs / DAY_MS);
    if (daysAgo === 0) return "Expired today";
    return daysAgo === 1 ? "Expired 1 day ago" : `Expired ${daysAgo} days ago`;
  }
  if (diffMs < DAY_MS) return "Expires in under a day";
  const daysLeft = Math.round(diffMs / DAY_MS);
  return daysLeft === 1 ? "Expires in 1 day" : `Expires in ${daysLeft} days`;
}
