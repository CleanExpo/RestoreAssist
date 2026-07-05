# Release Gate 1.0.0 — Owner-Evidence Files

Files in this directory are read by `scripts/release-gate-score.ts` to verify the 40 owner-evidence points (A3, C2, D1, D3, E1, E2, F1, F2) from `docs/RELEASE_GATE.md`.

## Rules

- **Filename = criterion ID + `.md`** (e.g. `A3-no-sev1-sev2-open.md`).
- **Required frontmatter** (every evidence file):
  ```yaml
  ---
  criterion: <criterion-id>
  status: pass | fail | deferred
  verified: YYYY-MM-DD     # required when status: pass
  tracking_ticket: RA-XXXX # required when status: deferred (Linear ticket that will resolve it)
  ---
  ```
- The scorer counts a file as PASS only when **all three** hold:
  - File exists.
  - Mtime within the last 14 days (`EVIDENCE_MAX_AGE_DAYS` in the scorer).
  - `status: pass` declared in frontmatter.
- `status: deferred` is treated as FAIL by design — use it when the criterion's underlying work is tracked but not yet complete (e.g. C2 awaits RA-4985). The body documents the deferral; the frontmatter keeps the gate honest.
- The body should contain the actual verification artifact (query result, screenshot reference, dashboard link, etc.) — not a stub.

## Refreshing evidence

Each evidence file documents how to regenerate it. To refresh, re-run the documented procedure, then `touch` or `git commit -m "refresh evidence"` on the file so its mtime updates.

## Versioning

When `gate_version` in `docs/RELEASE_GATE.md` bumps, scoring switches to `docs/evidence/release-gate/<new_version>/` — old version's evidence is no longer read. Old evidence stays in tree as audit history.

## Criteria expected in 1.0.0

| ID | Section | Description |
|---|---|---|
| `A3-no-sev1-sev2-open` | A | Linear query: 0 open Urgent/High RestoreAssist issues |
| `C2-secrets-scan` | C | Secrets scan + env-var completeness |
| `D1-billing-flows` | D | Stripe/Apple IAP purchase, renewal, cancellation verified |
| `D3-revenue-reconciliation` | D | Stripe events count matches DB subscription_events (7d) |
| `E1-app-store-metadata` | E | App Store metadata / screenshots / privacy / age rating approved |
| `E2-testflight-stability` | E | TestFlight crash-free sessions >= 99.5% |
| `F1-monitoring-alerting` | F | Vercel Observability alert rules configured (auth/billing/restore) |
| `F2-runbooks-sla` | F | Runbooks + P1 SLA + customer comms template |
