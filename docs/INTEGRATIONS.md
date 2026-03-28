# Integration Setup Guide

> **Providers:** Xero · QuickBooks Online · MYOB AccountRight · ServiceM8 · Ascora

## Overview

RestoreAssist connects to five external platforms via OAuth 2.0. Users connect from **Settings → Integrations**. Three are accounting (Xero, QBO, MYOB) and two are restoration/field-service job management (ServiceM8, Ascora).

After a NIR report is submitted, `POST /api/integrations/nir-sync` fires automatically and syncs to all connected platforms.

---

## Environment Variables

### Xero
```bash
XERO_CLIENT_ID=           # developer.xero.com
XERO_CLIENT_SECRET=
XERO_ACCOUNT_WATER=200    # optional — account code for water damage
XERO_ACCOUNT_FIRE=201     # optional — account code for fire/smoke
XERO_ACCOUNT_MOULD=202    # optional — account code for mould
XERO_ACCOUNT_GENERAL=200  # optional — default
XERO_TRACKING_CATEGORY=   # optional — Xero tracking category name
```
Scopes: `openid profile email accounting.transactions accounting.contacts`  
Redirect: `{NEXTAUTH_URL}/api/integrations/oauth/xero/callback`

### QuickBooks Online
```bash
QUICKBOOKS_CLIENT_ID=     # developer.intuit.com
QUICKBOOKS_CLIENT_SECRET=
```
Scopes: `com.intuit.quickbooks.accounting`  
Redirect: `{NEXTAUTH_URL}/api/integrations/oauth/quickbooks/callback`

### MYOB AccountRight
```bash
MYOB_CLIENT_ID=           # my.myob.com developer portal
MYOB_CLIENT_SECRET=
MYOB_ACCOUNT_WATER=4-1100  # optional — account display ID
MYOB_ACCOUNT_FIRE=4-1200
MYOB_ACCOUNT_MOULD=4-1300
```
Scopes: `CompanyFile`  
Redirect: `{NEXTAUTH_URL}/api/integrations/oauth/myob/callback`

### ServiceM8
```bash
SERVICEM8_CLIENT_ID=      # developer.servicem8.com
SERVICEM8_CLIENT_SECRET=
```
Scopes: `read_clients read_jobs manage_jobs manage_job_materials manage_job_notes`  
Redirect: `{NEXTAUTH_URL}/api/integrations/oauth/servicem8/callback`

### Ascora
```bash
ASCORA_CLIENT_ID=         # contact Ascora support for API access
ASCORA_CLIENT_SECRET=
ASCORA_JOB_TYPE_WATER=1   # optional — match your Ascora instance config
ASCORA_JOB_TYPE_FIRE=2
ASCORA_JOB_TYPE_MOULD=3
```
Scopes: `read`  
Redirect: `{NEXTAUTH_URL}/api/integrations/oauth/ascora/callback`

---

## NIR Sync API

```bash
# Sync to ALL connected integrations
POST /api/integrations/nir-sync
{ "reportId": "report_abc123" }

# Sync to ONE specific integration
POST /api/integrations/nir-sync
{ "reportId": "report_abc123", "targetIntegrationId": "integration_xyz" }
```

**Response:**
```json
{
  "results": [
    { "provider": "XERO",   "status": "success", "externalId": "...", "externalReference": "INV-001" },
    { "provider": "ASCORA", "status": "success", "externalId": "456" }
  ],
  "summary": { "total": 2, "success": 2, "errors": 0, "skipped": 0 }
}
```

---

## Recommended pairings for AU restoration companies

| Setup | Use case |
|-------|----------|
| **Ascora + Xero** | Best overall: Ascora for job management (native restoration), Xero for accounting |
| **ServiceM8 + Xero** | Common AU tradesperson setup |
| **ServiceM8 + MYOB** | Common for companies already on MYOB |
| **Xero only** | Smaller operators who just need invoicing |

---

## Schema field mapping (verified against prisma/schema.prisma)

| NIRJobPayload field | Source in DB |
|--------------------|--------------|
| `clientName` | `report.client.name` → fallback `report.clientName` |
| `damageType` | `report.hazardType` (mapped to WATER/FIRE/MOULD/GENERAL) |
| `waterCategory` | `report.waterCategory` (IICRC S500 field on Report) |
| `waterClass` | `report.waterClass` (IICRC S500 field on Report) |
| `scopeItems` | `report.inspection.scopeItems` (on Inspection, not Report) |
| `scopeItems[].iicrcRef` | `ScopeItem.justification` |
| `scopeItems[].unitPriceExGST` | `CostEstimate.rate` linked by `scopeItemId` |
| `totalExGST` | Sum of `inspection.costEstimates[].subtotal` × 100 (cents) |
| `totalIncGST` | Sum of `inspection.costEstimates[].total` × 100 (cents) |
| `insuranceClaim` | `report.claimReferenceNumber` |
| `technician` | `report.technicianName` |
