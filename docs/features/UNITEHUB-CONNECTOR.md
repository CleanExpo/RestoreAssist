# Unite-Hub Nexus Connector

## Overview

The Unite-Hub connector pushes contractor training, course completions, and certifications from RestoreAssist to the Unite-Hub Nexus platform. This ensures contractor credentials appear in the unified profile across all Unite-Group products.

## Data Flow

```
RestoreAssist (certification/CEC event)
  -> POST /api/nexus/sync { type, id }
  -> sync orchestrator (lib/unitehub/sync.ts)
  -> Unite-Hub API client (lib/unitehub/client.ts)
  -> Unite-Hub Nexus API (external)
```

## Payload Shapes

### Certification

```json
{
  "contractorId": "clxyz...",
  "externalUserId": "uh-user-123",
  "certificationType": "IICRC_WRT",
  "certificationName": "Water Restoration Technician",
  "issuedAt": "2025-06-15T00:00:00.000Z",
  "expiresAt": "2028-06-15T00:00:00.000Z",
  "issuingBody": "IICRC",
  "certificateUrl": "https://..."
}
```

### CEC (Continuing Education Credit)

```json
{
  "contractorId": "clxyz...",
  "courseName": "Advanced Mould Remediation",
  "provider": "IICRC",
  "cecPoints": 4,
  "completedAt": "2025-07-01T00:00:00.000Z",
  "certificateUrl": "https://..."
}
```

### Course

```json
{
  "contractorId": "clxyz...",
  "courseName": "Fire Damage Assessment",
  "provider": "RestoreAssist Academy",
  "completedAt": "2025-07-10T00:00:00.000Z",
  "score": 92,
  "certificateUrl": "https://..."
}
```

## Retry Strategy

All API calls use the existing integration retry utility (`lib/integrations/retry.ts`) with `DEFAULT_RETRY_OPTIONS`:

- **Max retries**: 3
- **Initial delay**: 1000ms
- **Max delay**: 10000ms
- **Backoff factor**: 2x (exponential)
- **Jitter**: 80-100% randomization to prevent thundering herd
- **Non-retryable**: 4xx errors (except 429 rate-limit)
- **Retryable**: 5xx, 408, 429, network errors

## Required Unite-Hub API Endpoints

The client expects these endpoints on the Unite-Hub Nexus API:

| Method | Endpoint                        | Description                    |
| ------ | ------------------------------- | ------------------------------ |
| POST   | `/api/nexus/certifications`     | Push a certification record    |
| POST   | `/api/nexus/cec`                | Push a CEC completion record   |
| POST   | `/api/nexus/courses`            | Push a course completion record|

All endpoints require `X-API-Key` header for authentication and accept JSON payloads.

## Environment Variables

```env
UNITEHUB_API_URL=https://api.unitehub.com.au
UNITEHUB_API_KEY=your-unitehub-api-key
```

Both must be set for the connector to be active. If either is missing, sync calls are silently skipped with a console warning.

## Files

| File                                        | Purpose                              |
| ------------------------------------------- | ------------------------------------ |
| `apps/web/lib/unitehub/client.ts`           | Low-level API client with retry      |
| `apps/web/lib/unitehub/sync.ts`             | Sync orchestrator (DB -> API)        |
| `apps/web/lib/unitehub/index.ts`            | Barrel export                        |
| `apps/web/app/api/nexus/sync/route.ts`      | REST endpoint to trigger sync        |
