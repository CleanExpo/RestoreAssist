# C2 — Secrets scan + config sanity (5 pts)

**Status:** DEFERRED (intentionally NOT PASS — the scorer continues to block on this until RA-4985 lands)
**Last scanned:** 2026-05-18
**Tracking ticket:** **RA-4985** — Gitleaks audit: triage 127 historical secret-leak findings

## Why this is not PASS

A full-history gitleaks scan (`gitleaks detect --no-banner --redact`) found **127 leak signatures** across 3633 commits / ~101 MB. Until each finding is triaged (false-positive → allowlist, real secret → rotate-then-allowlist), C2 cannot honestly claim PASS.

## Scan reproduction

```bash
gitleaks detect --no-banner --redact --exit-code 0 \
  --report-format json --report-path /tmp/gitleaks-report.json
```

Result (2026-05-18): **127 findings.**

## Findings breakdown (history scan, 127 total)

**Severity tiers — addressing "could be 110 cosmetic + 17 real":**

| Tier | Count | Rule(s) | Likely classification |
|---|---|---|---|
| **HIGH-RISK** (real-secret-shaped) | **6** | `stripe-access-token` (2), `private-key` (2), `gcp-api-key` (2) | Must verify rotation status of each — these regex tiers do not fire on cosmetic strings |
| **MEDIUM-RISK** (token-shaped) | 6 | `jwt` (6) | Mostly test fixtures, but each needs confirmation |
| **LOW-RISK** (broad regex) | 88 | `generic-api-key` | High false-positive rate in markdown docs (placeholder strings, example curl) — triage per-occurrence |
| **DOC EXAMPLE** | 27 | `curl-auth-header` | curl examples in deployment/setup docs — overwhelmingly cosmetic |

The **6 HIGH-RISK findings alone** justify DEFERRED status independent of the LOW-RISK count. Even if every `generic-api-key`/`curl-auth-header` finding is confirmed cosmetic, 6 categorically-real-shaped findings require explicit rotation verification before C2 can claim PASS.

## Working-tree scan (separately verified, 2026-05-18)

`gitleaks detect --no-banner --redact --no-git` returned **877 findings**, but `git check-ignore` confirms every high-volume hit is in a gitignored local-secret file:

| Source | Tracked in git? |
|---|---|
| `.env.local`, `.env.vercel-prod`, `.env.asc`, `.env.prod2`, `.env.production.local` | NO — matched by `.gitignore:21:.env*` and `.gitignore:95:.env*.local` |
| `.claude/worktrees/agent-*/.env.local` | NO — agent scratch dirs are gitignored |
| `.next/` build output | NO — gitignored build artifacts |

Only `.env.example` and `.env.test.local.example` are tracked, and those are template files with placeholder values by design. So the high worktree count is expected/correct behaviour; the **127 history findings remain the only actual concern.**

## Rule breakdown (history scan)

| Count | Rule |
|---|---|
| 88 | `generic-api-key` |
| 27 | `curl-auth-header` |
| 6 | `jwt` |
| 2 | `stripe-access-token` |
| 2 | `private-key` |
| 2 | `gcp-api-key` |

Top-leaked paths (mostly markdown docs from earlier in the project):

| Count | File |
|---|---|
| 10 | `DEBUG_REPORT.md` |
| 8 | `packages/backend/AUTHENTICATION_DOCUMENTATION.md` |
| 5 | `lib/stripe-client.ts` |
| 5 | `docs/guides/PRODUCTION-DEPLOYMENT.md` |
| 4 | `docs/guides/SUPABASE-SETUP.md` |
| 4 | `HANDOVER.md` |
| 4 | `PRISMA_SENDGRID_SETUP.md` |
| 3 | `.env.example` |
| 2 | `.codex/config.toml` (concerning — toolchain config, may have committed key) |
| 2 | `.github/workflows/ios-release.yml` |

## Env-var completeness (partial — informational only)

The repo's `.env.example` declares **98 keys**. Verifying that every key is set in Vercel `production` env is part of the RA-4985 acceptance criteria (`vercel env ls production`). Not separately scored — folded into RA-4985.

## Path to PASS

Per RA-4985 acceptance:

1. Reproduce the scan, classify each finding (false positive / rotated / unrotated-rotate-now)
2. Add `.gitleaks.toml` allowlist with per-finding rationale
3. `gitleaks detect --no-git --redact` (working-tree only) returns 0
4. Add a CI step to `pr-checks.yml` that fails on new working-tree leaks
5. Rotate any genuinely-unrotated secret; document rotation date here
6. Re-author this file as PASS (and `touch` it so mtime is fresh)

## Refresh

When RA-4985 ships, replace this file's body with the PASS artifact (allowlist link + last-scan timestamp + worktree-clean confirmation). `git commit` will refresh mtime; the scorer's 14-day staleness check then re-arms the clock.

## Related

- [[ra-4956]] — release gate definition
- [[ra-4985]] — this deferral's tracking ticket
- `feedback_never_leak_secrets.md` — Phill's standing rule
