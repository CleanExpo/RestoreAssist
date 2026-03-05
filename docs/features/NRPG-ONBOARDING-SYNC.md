# NRPG Onboarding Sync — Technical Specification

## Overview

When a contractor registers on RestoreAssist and completes their `ContractorProfile`, their compliance data is automatically synced to NRPG (National Restoration Professionals Group). This ensures contractors are verified and onboarded to the industry body from day one, without manual re-entry.

## Data Flow

1. Contractor completes RestoreAssist registration (creates `User` with role `CONTRACTOR`)
2. Contractor fills out their `ContractorProfile` via `PUT /api/contractors/profile`
3. `POST /api/nrpg/sync` is triggered (webhook or direct call from profile creation)
4. RestoreAssist maps contractor data to the NRPG payload format
5. NRPG API is called with the mapped payload via `syncContractorToNRPG()`
6. NRPG returns a membership ID
7. The NRPG membership ID is stored back on the contractor record

## Contractor Data Mapped

| RestoreAssist Field | NRPG Field | Source | Notes |
|---|---|---|---|
| `User.name` | `fullName` | `User` | Required |
| `User.email` | `email` | `User` | Required, unique identifier |
| `User.businessPhone` | `phone` | `User` | Business contact number |
| `User.businessName` | `companyName` | `User` | Trading name |
| `User.businessABN` | `abnNumber` | `User` | Australian Business Number |
| `User.businessAddress` | `businessAddress` | `User` | Registered address |
| `ContractorProfile.specializations` | `specializations` | `ContractorProfile` | Array of service types |
| `ContractorProfile.yearsInBusiness` | `yearsInBusiness` | `ContractorProfile` | Experience indicator |
| `ContractorProfile.insuranceCertificate` | `insuranceCertUrl` | `ContractorProfile` | Proof of insurance |
| `ContractorCertification.certificationName` | `certifications[].name` | `ContractorCertification` | e.g. IICRC WRT |
| `ContractorCertification.certificationNumber` | `certifications[].number` | `ContractorCertification` | Cert reference |
| `ContractorCertification.certificationType` | `certifications[].type` | `ContractorCertification` | Enum: IICRC_WRT, TRADE_PLUMBING, etc. |
| `ContractorCertification.issuingBody` | `certifications[].issuer` | `ContractorCertification` | Issuing authority |
| `ContractorCertification.issueDate` | `certifications[].issuedAt` | `ContractorCertification` | ISO 8601 date |
| `ContractorCertification.expiryDate` | `certifications[].expiresAt` | `ContractorCertification` | ISO 8601 date, nullable |
| `ContractorServiceArea.state` | `serviceRegions[]` | `ContractorServiceArea` | Deduplicated state list |

## API Contract

### Internal Endpoint

```
POST /api/nrpg/sync
Content-Type: application/json

{
  "contractorId": "cuid_user_id"
}
```

**Response (success — sync queued):**
```json
{
  "status": "synced",
  "contractorId": "cuid_user_id",
  "nrpgMembershipId": "NRPG-AU-00001234"
}
```

**Response (pending — API not yet configured):**
```json
{
  "status": "pending",
  "message": "NRPG sync queued (integration pending NRPG API access)",
  "contractorId": "cuid_user_id",
  "nrpgMembershipId": null
}
```

**Response (error — missing contractor):**
```json
{
  "error": "contractorId required"
}
```

### NRPG External API (TBD)

The external NRPG API endpoint, authentication method, and exact payload schema are pending NRPG API access. The client stub in `apps/web/lib/nrpg/client.ts` will be updated once credentials and documentation are provided.

**Expected shape (based on industry patterns):**
```
POST https://api.nrpg.org.au/v1/members
Authorization: Bearer <NRPG_API_KEY>

{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "companyName": "string",
  "abnNumber": "string",
  "businessAddress": "string",
  "specializations": ["string"],
  "yearsInBusiness": number,
  "insuranceCertUrl": "string",
  "certifications": [
    {
      "name": "string",
      "number": "string",
      "type": "string",
      "issuer": "string",
      "issuedAt": "ISO8601",
      "expiresAt": "ISO8601 | null"
    }
  ],
  "serviceRegions": ["string"]
}
```

## Environment Variables

| Variable | Description |
|---|---|
| `NRPG_API_URL` | Base URL for NRPG API (e.g. `https://api.nrpg.org.au/v1`) |
| `NRPG_API_KEY` | Bearer token for NRPG API authentication |

## Error Handling

| Scenario | Behaviour |
|---|---|
| `contractorId` missing from request body | Return 400 with `{ error: "contractorId required" }` |
| User not found or not a contractor | Return 404 with `{ error: "Contractor not found" }` |
| ContractorProfile not found | Return 404 with `{ error: "Contractor profile not found" }` |
| NRPG API returns 4xx | Log error, return 502 with `{ error: "NRPG rejected the request", details: ... }` |
| NRPG API returns 5xx or timeout | Log error, queue for retry, return 503 with `{ error: "NRPG service unavailable" }` |
| Network failure to NRPG | Log error, queue for retry, return 503 |

## Rollback / Retry Strategy

1. **Idempotency**: The sync endpoint should be idempotent. Re-calling with the same `contractorId` should update (not duplicate) the NRPG membership.
2. **Retry on transient failure**: If the NRPG API returns 5xx or a network error, the sync should be retried up to 3 times with exponential backoff (1s, 4s, 16s).
3. **Dead letter logging**: After 3 failed retries, log the failure to an `NRPGSyncFailure` audit record for manual review.
4. **No local rollback needed**: The RestoreAssist contractor profile is created independently. A failed NRPG sync does not roll back the local profile — it simply leaves `nrpgMembershipId` as `null`.
5. **Manual re-trigger**: Admins can re-trigger a sync via `POST /api/nrpg/sync` at any time.

## Future Considerations

- **Webhook from NRPG**: If NRPG provides webhooks for membership status changes (e.g. verified, suspended), add a `POST /api/nrpg/webhook` endpoint.
- **Periodic re-sync**: A cron job could periodically re-sync contractor data to keep NRPG records up to date when certifications are renewed or profiles updated.
- **Schema migration**: When the NRPG membership ID storage is confirmed, add an `nrpgMembershipId String?` field to `ContractorProfile` in the Prisma schema.
