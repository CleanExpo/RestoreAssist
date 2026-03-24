# Integration Setup Guide

> **Providers:** Xero · QuickBooks Online · MYOB AccountRight · ServiceM8 · Ascora

## Overview

RestoreAssist connects to five external platforms. Three are accounting systems (Xero, QBO, MYOB) and two are restoration/field-service job management platforms (ServiceM8, Ascora).

All integrations use OAuth 2.0. Users connect via the Settings → Integrations page. OAuth credentials are stored encrypted in the database.

---

## Environment Variables

Add these to your `.env` file. All are optional unless stated otherwise.

### Xero

```bash
# Required for Xero OAuth (register at developer.xero.com)
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret

# Optional — Xero account codes for NIR line items (default shown)
XERO_ACCOUNT_WATER=200
XERO_ACCOUNT_FIRE=201
XERO_ACCOUNT_MOULD=202
XERO_ACCOUNT_GENERAL=200

# Optional — Xero tracking category name (e.g. 'Damage Type')
# If set, NIR sync adds tracking to each line item
XERO_TRACKING_CATEGORY=
```

**Xero OAuth scopes required:**
`openid profile email accounting.transactions accounting.contacts`

**Redirect URI to register:**
`{NEXTAUTH_URL}/api/integrations/oauth/xero/callback`

---

### QuickBooks Online

```bash
# Required (register at developer.intuit.com)
QUICKBOOKS_CLIENT_ID=your_qbo_client_id
QUICKBOOKS_CLIENT_SECRET=your_qbo_client_secret

# Optional — QBO income account IDs (numeric, company-specific)
QBO_INCOME_ACCOUNT_WATER=1
QBO_INCOME_ACCOUNT_FIRE=1
QBO_INCOME_ACCOUNT_MOULD=1
```

**QBO OAuth scopes required:**
`com.intuit.quickbooks.accounting`

**Redirect URI:**
`{NEXTAUTH_URL}/api/integrations/oauth/quickbooks/callback`

**Note:** QBO is realm-scoped. The realm ID is captured at OAuth callback and stored in `integration.realmId`.

---

### MYOB AccountRight

```bash
# Required (register at my.myob.com/au/bd/DevAppList.aspx)
MYOB_CLIENT_ID=your_myob_client_id
MYOB_CLIENT_SECRET=your_myob_client_secret

# Optional — MYOB account display IDs
MYOB_ACCOUNT_WATER=4-1100
MYOB_ACCOUNT_FIRE=4-1200
MYOB_ACCOUNT_MOULD=4-1300
```

**MYOB OAuth scopes required:**
`CompanyFile`

**Redirect URI:**
`{NEXTAUTH_URL}/api/integrations/oauth/myob/callback`

**Note:** MYOB is company-file scoped. The company file ID is captured at OAuth callback and stored in `integration.companyId`. Users may have multiple company files — the first one is selected by default. Add a company file selector UI if multi-file support is needed.

---

### ServiceM8

```bash
# Required (register at developer.servicem8.com)
SERVICEM8_CLIENT_ID=your_sm8_client_id
SERVICEM8_CLIENT_SECRET=your_sm8_client_secret
```

**ServiceM8 OAuth scopes required:**
`read_clients read_jobs manage_jobs manage_job_materials manage_job_notes`

**Redirect URI:**
`{NEXTAUTH_URL}/api/integrations/oauth/servicem8/callback`

**Note:** ServiceM8 syncs NIR reports as jobs with materials and notes. It does not handle accounting tax directly — use alongside a Xero or MYOB integration for accounting.

---

### Ascora

```bash
# Required (contact Ascora support for API access)
ASCORA_CLIENT_ID=your_ascora_client_id
ASCORA_CLIENT_SECRET=your_ascora_client_secret

# Optional — Ascora job type IDs (match your Ascora instance config)
ASCORA_JOB_TYPE_WATER=1
ASCORA_JOB_TYPE_FIRE=2
ASCORA_JOB_TYPE_MOULD=3
```

**Ascora OAuth scopes required:**
`read`

**Redirect URI:**
`{NEXTAUTH_URL}/api/integrations/oauth/ascora/callback`

**Note:** Ascora is an Australian-native restoration platform and provides the most semantically complete sync. Job types, damage categories, insurance claims, and IICRC references all map directly. If users have both Ascora and Xero, configure both — Ascora for job management, Xero for accounting.

---

## NIR Sync API

After a NIR report is submitted and approved, trigger a sync:

```bash
POST /api/integrations/nir-sync
Content-Type: application/json
Authorization: Bearer {session}

# Sync to ALL connected integrations
{ "reportId": "report_abc123" }

# Sync to ONE specific integration
{ "reportId": "report_abc123", "targetIntegrationId": "integration_xyz456" }
```

**Response:**
```json
{
  "results": [
    { "integrationId": "...", "provider": "XERO", "status": "success", "externalId": "abc-123", "externalReference": "INV-001" },
    { "integrationId": "...", "provider": "ASCORA", "status": "success", "externalId": "456" }
  ],
  "summary": { "total": 2, "success": 2, "errors": 0, "skipped": 0 }
}
```

Sync errors per-provider are captured and returned — one provider failing does not abort the others.

---

## NIR Sync Payload

The sync orchestrator maps NIR report fields to the `NIRJobPayload` type defined in `lib/integrations/xero/nir-sync.ts`. Key fields:

| Field | Source | Notes |
|-------|--------|-------|
| `clientName` | `report.client.name` | Used to match/create contact in accounting system |
| `damageType` | `report.damageType` | Routes to correct account code / Ascora job type |
| `waterCategory` | `report.inspection.waterCategory` | S500 §7 — included in job description |
| `waterClass` | `report.inspection.waterClass` | S500 §8 — included in job description |
| `scopeItems[].iicrcRef` | `scopeItem.iicrcRef` | Added to line item description for audit trail |
| `insuranceClaim` | `report.insuranceClaim` | Included in Xero reference, Ascora claim field |
| `totalExGST` | `report.subtotal` | In cents |

---

## Adding a New Integration Provider

1. Add provider to `PROVIDER_CONFIG` in `lib/integrations/oauth-handler.ts`
2. Create `lib/integrations/{provider}/client.ts` extending `BaseIntegrationClient`
3. Create `lib/integrations/{provider}/nir-sync.ts` with `syncNIRJobTo{Provider}()`
4. Register in `lib/integrations/nir-sync-orchestrator.ts` switch statements
5. Add env vars and documentation to this file
6. Add to `createClientForIntegration()` in `lib/integrations/index.ts`
