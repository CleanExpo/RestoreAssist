# Wave 6 — Production readiness

## Shipped in-repo

- **W6-1** — Managers download last 500 org-scoped `AuditLog` rows: `GET /api/operations/audit-export?since=ISO8601` (optional).
- **W6-2** — Program status exposes `slo.targets` and harness `slo.lastRun`; completeness inbox panel links audit CSV.
- **W6-3** — Invoice email send capped at 15/min per user (`invoice-send` rate limit bucket).

## Still roadmap (W6-4)

Align with `IMPLEMENTATION_ROADMAP.md` phase 6: Supabase RLS hardening, CI build strictness, broader rate-limit coverage, signed audit archive retention.