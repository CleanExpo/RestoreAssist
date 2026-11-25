/**
 * The one time limit for a single Xero HTTP request: the API client and the
 * webhook drain both use it.
 *
 * RA-8426: it also bounds how long a webhook drain can hold one claim. Each
 * claim covers one event and at most a token refresh plus one Xero call, so a
 * live claim ends well inside WEBHOOK_STALE_CLAIM_MS (10 minutes) whatever the
 * host. Production runs on DigitalOcean, where Next.js `maxDuration` is not
 * enforced, so this limit, not `maxDuration`, is what keeps a live claim from
 * being released.
 */
export const XERO_REQUEST_TIMEOUT_MS = 15_000;
