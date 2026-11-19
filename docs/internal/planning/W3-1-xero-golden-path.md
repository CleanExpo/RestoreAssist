# W3-1 — Xero golden path (pilot receipt)

**Goal:** One pilot org can connect Xero, map accounts, push an invoice, and prove sync via UI + health checks.

## Prerequisites

- `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` on the environment
- Pilot owner has **Online Bookkeeping** add-on + matching ABN (see help article `connect-xero`)
- Redirect URI: `${NEXTAUTH_URL}/api/integrations/oauth/xero/callback`

## Golden path (30 minutes)

1. **Connect** — `/dashboard/integrations` → Xero → complete OAuth → **Connected** badge.
2. **Defaults** — `/dashboard/settings/xero-mapping` → default sales account + GST tax rate saved.
3. **Smoke invoice** — create a draft invoice on a test job → **Sync to Xero** (or wait for hourly cron `sync-xero-payments`).
4. **Receipt A — sync status** — `GET /api/integrations/xero/sync-status` (or Integrations → sync history) shows `SUCCESS` for the outbound sync within 24h.
5. **Receipt B — health** — `/dashboard/integrations/health`:
   - Token Validity: **pass** (or unverified if no other connectors)
   - Sync Success Rate: **pass** after at least one `IntegrationSyncLog` SUCCESS
   - OAuth Live Reachability: **pass** for Xero (`/connections` probe)

## Pilot sign-off template

| Field | Value |
|-------|--------|
| Org / workspace | |
| Xero tenant name | |
| Invoice # pushed | |
| `XeroSyncStatus` id | |
| Health screenshot (integrations/health) | attached |
| Date | |

## Rollback

Disconnect Xero from `/dashboard/integrations` → revoke. Pilot data stays in RestoreAssist; Xero org unaffected.

## References

- User help: `data/content/help/integrations/connect-xero.mdx`
- Outbound sync: `lib/integrations/xero/nir-sync.ts`, `app/api/cron/sync-xero-payments/route.ts`