# W3-3 — Pilot: enable one secondary connector

After Xero golden path (W3-1), enable **exactly one** of ServiceM8 or QuickBooks for the pilot environment.

## Environment (Vercel / DO)

```bash
# Pick ONE for pilot — not both until each has a signed receipt
NEXT_PUBLIC_SERVICEM8_ENABLED=1
# NEXT_PUBLIC_QUICKBOOKS_ENABLED=1

SERVICEM8_CLIENT_ID=...
SERVICEM8_CLIENT_SECRET=...
# or QuickBooks equivalents
```

## UI surfaces

- Integrations cards hidden unless `NEXT_PUBLIC_*_ENABLED=1` (`lib/flags/one-crm-flags.ts`)
- **Sync receipt:** provider-specific routes (`/api/ascora/sync` pattern); Xero uses `sync-status` + sync history page
- **Health:** `/dashboard/integrations/health` — Sync Success Rate + OAuth Live Reachability must be **pass** after first successful sync

## Pilot exit criteria

1. Connect OAuth from `/dashboard/integrations`
2. At least one `IntegrationSyncLog` with `status: SUCCESS` in 24h
3. Health dashboard green on Token + Sync + OAuth probe for that provider
4. Screenshot archived in pilot folder (SDA optional for integrations page only)

## Rollback

Unset `NEXT_PUBLIC_*_ENABLED` and redeploy — cards disappear; tokens remain until user disconnects.