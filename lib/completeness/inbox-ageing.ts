/** P1 — how long a job has sat without progress (by updatedAt). */

export type InboxAgeingBand = "fresh" | "ageing" | "stale";

export function daysSince(iso: string | Date, now = Date.now()): number {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
}

export function inboxAgeingBand(days: number): InboxAgeingBand {
  if (days >= 7) return "stale";
  if (days >= 3) return "ageing";
  return "fresh";
}

export function inboxAgeingLabel(days: number): string {
  if (days <= 0) return "Updated today";
  if (days === 1) return "1 day idle";
  return `${days} days idle`;
}
