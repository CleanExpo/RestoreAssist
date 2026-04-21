# Data Retention Policy

**Version:** 1.0 — 2026-04-21
**Owner:** RestoreAssist Compliance
**Applies to:** All customer data processed by RestoreAssist (`restoreassist.app` / `restoreassist.vercel.app`)

## Legal basis

Australian Privacy Principle 11.2 requires destruction or de-identification of personal information once it is no longer needed for the purpose it was collected. This policy documents the per-entity retention windows that satisfy APP 11.2 while also meeting:

- **ATO record-keeping** — 5 years for financial records under the Tax Administration Act
- **Insurance industry norm** — 7 years for inspection / damage reports (claims limitation period + dispute window)
- **NSW Workers Compensation Act / equivalents** — 7 years for attendance / labour-hire records
- **AU Consumer Law** — 6 years from transaction date for consumer dispute window

Where multiple retention rules apply, **the longest window governs**. Documented in the table below.

## Retention table (customer data)

| Entity | TTL | Rationale | Enforcement |
|--------|-----|-----------|-------------|
| **Inspection reports** | **7 years** from `completedAt` | insurance claim limitation + ATO | **hold** — not auto-purged by cron (business-critical) |
| **Inspection photos (originals)** | 7 years from parent inspection | same as parent | held with inspection; Cloudinary lifecycle rules mirror |
| **Inspection photos (viewing copies)** | mirrored to user's cloud via RA-1459; originals deleted per above | customer-controlled | `lib/cloud-mirror/*` |
| **Invoices / Estimates** | 7 years from `createdAt` | ATO + dispute | hold |
| **Audit logs (financial)** | 7 years from `createdAt` | ATO + audit | hold |
| **Audit logs (non-financial)** | 90 days from `createdAt` | operational debug only | **purged** by cleanup cron (planned — this ticket scaffolds) |
| **AI interview transcripts** | 180 days from `createdAt` | quality review + model tuning; no legal hold | purged |
| **Moisture readings** | retained with parent inspection | evidence for drying log | hold |
| **Webhook events (StripeWebhookEvent)** | 90 days from `createdAt` | replay debugging only | **purged** — added in this PR |
| **Webhook events (external integration)** | 90 days from `createdAt` | same | purged |
| **Agent task logs** | 30 days | operational debug | purged (already) |
| **Cron job runs** | 14 days | operational debug | purged (already) |
| **Workflows** (terminal state) | 90 days from `completedAt` | operational debug | purged (already) |
| **Password reset tokens** | 24 hours past expiry | security | purged (already) |
| **Scheduled emails** (terminal state) | 30 days from `updatedAt` | operational debug | purged (already) |
| **Security events** | 90 days from `createdAt` | SOC-2 / audit | purged (already) |
| **Soft-deleted users** | 30 days from `deletedAt` grace window, then hard-purge | APP 11.2 destruction | **follow-up** — needs `User.deletedAt` column + purge job (tracked as RA-1354 part 2) |
| **Organization-level deletion** | 30 days grace, then cascade hard-delete | APP 11.2 + customer self-service | follow-up |

## Customer-facing disclosure

The `/privacy` page (section §5) **must match this table**. After this PR, the doc team needs to:

1. Update `/privacy` §5 retention schedule to reference the 7-year ATO + insurance hold and the 90-day operational-log window
2. Update `/terms` §10 deletion clause to clarify that business-critical records (invoices, estimates, inspections) are retained for statutory periods even after account deletion
3. Add the 30-day grace window to the "Delete my account" flow so users see "will be permanently deleted on YYYY-MM-DD" before confirming

Tracked separately under RA-1385 (terms) and RA-1384 (privacy) which are already Done — spot-check for alignment on next release.

## Cron enforcement

`/api/cron/cleanup` runs daily at **03:00 UTC** via `vercel.json`. Implementation: `lib/cron/cleanup.ts` → `cleanupOldData()`.

Entities purged by the cron are flagged **purged** in the table above. Entities flagged **hold** are NEVER deleted by the cron — they retire via separate business workflows (account closure, compliance purge requests, 7-year batch archive).

### What this PR adds to cleanup.ts

- **StripeWebhookEvent** purge (>90 days)
- Reference to the retention table in the JSDoc so future developers know where to document new entity retention

### What this PR does NOT yet automate

- Soft-deleted user hard-purge (requires `User.deletedAt` column — follow-up)
- Organization deletion grace-period cascade (requires tracking table)
- AI interview transcript purge (need to confirm the entity name — if it's `AiInterview` or `LiveTeacherSession`, add it separately)
- Inspection 7-year archive path (business workflow, not a cron — a quarterly batch job)

## Access-log retention (separate)

Vercel Observability access logs are retained per Vercel's plan defaults (30d on Pro). Application-level request logs (e.g. Supabase edge function logs) follow Supabase retention (7d on free tier, 30d on Pro). Neither is under our cron's control — documented here so the full retention picture is visible.

## Review cadence

Policy reviewed **annually** (board cycle). Next review: April 2027. Interim changes (e.g. new entity category added to the schema) update this doc in the same PR that adds the entity.

## Change log

- 2026-04-21 (RA-1354) — initial version. Documents existing cron purges + adds StripeWebhookEvent.
