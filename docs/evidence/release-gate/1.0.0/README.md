# Release Gate 1.0.0 — Owner-Evidence Files

Files in this directory are read by `scripts/release-gate-score.ts` for the criteria that are still blocked on trusted owner evidence. They remain diagnostic records only until criterion-specific signed receipt producers/verifiers exist.

In gate version 1.0.0:

- `web` profile blocked owner-evidence criteria here are A1/A3, C2, D1/D3, and F1.
- `mobile` profile adds E1/E2/E3.
- `F2-runbooks-sla` is no longer score-bearing owner evidence; it is now verified directly from repository content.

## Rules

- **Filename = criterion ID + `.md`** (e.g. `A3-no-sev1-sev2-open.md`).
- **Required frontmatter** (every evidence file):
  ```yaml
  ---
  criterion: <criterion-id>
  status: pass | fail | deferred
  verified: YYYY-MM-DD     # required when status: pass — the date the claim was actually checked
  tracking_ticket: RA-XXXX # required when status: deferred (Linear ticket that will resolve it)
  ---
  ```
- The scorer first checks the file's declared state and freshness:
  - File exists.
  - `status: pass` declared in frontmatter.
  - `verified:` is present, parseable, and within the last 14 days (`EVIDENCE_MAX_AGE_DAYS` in the scorer). Dates are read at UTC midnight, so a date more than one day ahead of now is rejected as a future date; the one day of slack is what lets someone in UTC+10 write today's date without it reading as the future.
- A structurally complete `status: pass` file still earns **zero release points** unless a criterion-specific machine verifier exists. Narrative prose, screenshots, URLs, and hashes of prose are self-attested.
- Status is judged before freshness, so a `deferred` file reports as deferred rather than as stale, and nobody is ever asked to refresh a date on work that is deliberately paused.
- `status: deferred` is treated as FAIL by design — use it when the criterion's underlying work is tracked but not yet complete (e.g. C2 awaits RA-4985). The body documents the deferral; the frontmatter keeps the gate honest.
- The body should contain the actual verification artifact (query result, screenshot reference, dashboard link, etc.) — not a stub. The scorer also expects the stricter structure enforced in `ownerEvidence()` (`criterion`, `release_sha`, distinct `owner`/`reviewer`, content-bound `artifact`, and `## Evidence` / `## Not checked` sections).

## Refreshing evidence

Each evidence file documents how to regenerate it. To refresh: re-run the documented procedure, then update the `verified:` date in the frontmatter to the date you re-ran it, and commit.

Touching the file or committing it is **not** enough, and neither is a rebase, a rename or a lint pass. Freshness is aged from the `verified:` date the file declares about itself, never from the file's mtime or its commit date. That is deliberate: the gate runs after `actions/checkout`, which rewrites every file's mtime, so an mtime-based rule could never fire in CI — it awarded points to claims that were months old. Only editing `verified:` refreshes evidence, because only a human re-running the check should be able to.

## Versioning

When `gate_version` in `docs/RELEASE_GATE.md` bumps, scoring switches to `docs/evidence/release-gate/<new_version>/` — old version's evidence is no longer read. Old evidence stays in tree as audit history.

## Criteria expected in 1.0.0

| ID | Section | Description |
|---|---|---|
| `A3-no-sev1-sev2-open` | A | Linear query: 0 open Urgent/High RestoreAssist issues |
| `C2-secrets-scan` | C | Secrets scan + env-var completeness |
| `D1-billing-flows` | D | Website Stripe purchase, renewal, cancellation verified |
| `D3-revenue-reconciliation` | D | Stripe events count matches DB subscription_events (7d) |
| `E1-app-store-metadata` | E | App Store metadata / screenshots / privacy / age rating approved |
| `E2-testflight-stability` | E | TestFlight crash-free sessions >= 99.5% |
| `E3-release-rollback-plan` | E | App Review blockers = 0; release + rollback plan documented |
| `F1-monitoring-alerting` | F | Vercel Observability alert rules configured (auth/billing/restore) |
