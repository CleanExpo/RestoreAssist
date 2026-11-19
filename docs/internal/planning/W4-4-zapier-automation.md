# W4-4 — Zapier / automation v1

Custom Zapier app (polling) against RestoreAssist **automation v1** REST routes.

## Auth

**Option A — session (dashboard testing)**  
Manager/admin logged into the dashboard; Zapier is not suitable for cookie auth in production.

**Option B — service key (recommended for pilot)**  

```bash
ZAPIER_API_KEY=<random secret>
ZAPIER_ACT_AS_USER_ID=<manager user id in org>
```

Request header: `Authorization: Bearer <ZAPIER_API_KEY>`

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/automation/v1/inspections` | Poll jobs; optional `?since=ISO8601` |
| GET | `/api/automation/v1/clients` | Poll client directory |

### Sample job payload

```json
{
  "schemaVersion": "1.0",
  "data": [
    {
      "id": "clxxx",
      "jobNumber": "INS-2026-0042",
      "status": "SCOPED",
      "claimType": "WATER",
      "address": "12 Example St",
      "clientId": "cl_yyy",
      "updatedAt": "2026-11-19T00:00:00.000Z"
    }
  ]
}
```

## Zapier setup (custom integration)

1. Trigger: **Polling** → GET inspections with `since` from Zap storage.
2. Action examples: Slack notify on `status` change, Google Sheet append, CRM update.
3. Directory listing: follow [Zapier Developer Platform](https://developer.zapier.com) after 30-day pilot on custom app.

## Security

- Rotate `ZAPIER_API_KEY` if leaked.
- `ZAPIER_ACT_AS_USER_ID` must be MANAGER/ADMIN with `organizationId` set.
- No write endpoints in v1 — read-only poll surface.