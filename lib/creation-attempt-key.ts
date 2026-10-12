// The idempotency cache lasts 24 hours. Keep UI retries at least four hours
// inside that lifetime, including after an overnight offline period.
export const CREATION_RETRY_WINDOW_MS = 20 * 60 * 60 * 1000;

// Old keys have no issuance time, so their age cannot be proven safely.
export function isRecentlyIssuedCreationKey(
  key: string,
  prefix: "report-initial" | "nir-inspection",
  now = Date.now(),
): boolean {
  if (!key.startsWith(`${prefix}-`)) return false;
  const suffix = key.slice(prefix.length + 1);
  if (!/^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suffix)) {
    return false;
  }
  const issuedAt = Number(suffix.slice(0, 13));
  return issuedAt <= now && now - issuedAt <= CREATION_RETRY_WINDOW_MS;
}
