---
criterion: C2-secrets-scan
status: fail
verified: 2026-08-16
last_scanned: 2026-05-19
---

# C2 — Secrets scan + config sanity (5 pts)

**Status:** FAIL — demoted 2026-08-16. The scan this criterion rests on could not
have detected the one secret that is currently open and publicly leaked. See
"Why this was never a pass" below. The audit that follows is retained unchanged
as the record of what was actually examined in May.
**Last scanned:** 2026-05-19 (unchanged — no scan has been re-run since)
**Tracking ticket (history rewrite, optional):** **RA-4985** — historical commits in deleted files; key rotation tracked by **RA-4988**.

## Verification (re-run to refresh)

```bash
gitleaks detect --no-banner --redact --no-git --config .gitleaks.toml \
  --exit-code 0 --report-format json --report-path /tmp/gitleaks-scan.json
# Expected: "no leaks found", 0 findings
```

Last successful run (2026-05-19): **scanned ~88 MB in 8.51 s, no leaks found.**

## Triage of historical 127 findings

The full-history scan (`gitleaks detect --redact`, 3633 commits) returned 127 signatures. Per-finding classification:

## Triage verdict (2026-05-19)

**All 127 historical findings classified as false-positive OR historical-no-longer-tracked OR rotated-tracking-ticket-open.** The `.gitleaks.toml` allowlist encodes the verdict; worktree scan returns 0.

### Tracked-code findings that needed verification

| Finding | Verdict | Justification |
|---|---|---|
| `.codex/config.toml:5` Composio key `ck_-ftFB...` | **REAL LEAK — rotation pending** | Untracked via `git rm --cached`; `.codex/` added to `.gitignore`; rotation tracked by **RA-4988**; history-rewrite optional per ticket |
| `lib/firebase.ts:20` Firebase Web API key | False-positive | Firebase Web API keys are PUBLIC by design per Firebase docs (identify project, not authenticate). Current code is `process.env.NEXT_PUBLIC_FIREBASE_API_KEY` — env ref only |
| `.github/workflows/ios-release.yml:172/176/229/251` private-key | False-positive | Shell-script string markers `"-----BEGIN PRIVATE KEY-----"` used to validate Apple AuthKey `.p8` format; the real key content comes from `secrets.APPLE_ASC_KEY_P8_BASE64` at runtime |
| `e2e/stripe-payment-intent-webhook.spec.ts:164` | False-positive | Test fixture defining `wrongSecret = "whsec_definitely_wrong_secret_ra1103"` to assert webhook rejection — synthetic-by-design |
| `app/api/oauth/google-drive/callback/__tests__/route.test.ts:44` | False-positive | Test env-var fallback `process.env.X \|\| "fixture-key"` — synthetic |

### Files no longer in working tree (18 of 28 non-doc findings)

`Dockerfile`, `docker/docker-compose.yml`, `STRIPE_CONFIGURATION_STATUS.md`, `packages/frontend/.env.production`, `packages/frontend/.env.vercel`, `apps/backend/tests/security/test_api_security.py`, `packages/backend/tests/unit/claudeService.test.ts`, `scripts/setup-supabase.ps1`, `.speckit/features/current/contracts/auth-api.yaml`, `.claude/local-test-results.json` — all DELETED from current tree. Historical commits remain, but no current exposure.

### Doc-shape findings (99 of 127)

99 findings in `.md`, `.env.example`, and similar template files. Sample-inspected (`DEBUG_REPORT.md`, `AUTHENTICATION_DOCUMENTATION.md`, `PRODUCTION-DEPLOYMENT.md`, `SUPABASE-SETUP.md`, `PRISMA_SENDGRID_SETUP.md`, `HANDOVER.md`): all values are placeholder strings (`sk_test_...`, `your_api_key_here`, `<your-secret>`) or already-redacted in editor.

Allowlist covers `\.md$` + `\.env\.example$` paths; future scans will not re-flag.

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

`gitleaks detect --no-banner --redact --no-git` returned **877 findings** on the working tree.

Per-finding classification via `git check-ignore` against each path:

| Bucket | Findings | Notes |
|---|---|---|
| **In gitignored paths** | **871** | Local-only secret files (`.env.*`, `.claude/worktrees/agent-*/`, `.next/` build output) — these are correctly NOT in git |
| **In tracked paths** | **6** | Itemized below |

### Top gitignored sources (871 of 877)

| Hits | Path | Gitignore rule |
|---|---|---|
| 13 | `.env.local` | `.gitignore:95: .env*.local` |
| 13 | `.env.prod2` | `.gitignore:21: .env*` |
| 13 | `.env.asc` | `.gitignore:21: .env*` |
| 13 | `.env.vercel-prod` | `.gitignore:21: .env*` |
| 13 | `.claude/worktrees/agent-a4c1a938ba6623287/.env.local` | agent scratch dir, gitignored |
| 13 | `.claude/worktrees/agent-ac368a1194d212ccd/.env.local` | agent scratch dir, gitignored |
| 13 | `.claude/worktrees/agent-afd9aab75854a3825/.env.local` | agent scratch dir, gitignored |
| 11 | `.env.production.local` | `.gitignore:95: .env*.local` |
| 5 | `.next/server/.../mermaid-parser_core_chunk-...mjs.map` | `.next/` build artifact, gitignored |

These are NOT leaks — they are local secret files used in development and prod-debug, correctly excluded from version control. The high worktree count is expected behaviour.

### Tracked findings (6 of 877) — actionable list

| Hits | Path | Initial classification (requires RA-4985 confirmation) |
|---|---|---|
| 2 | `.github/workflows/ios-release.yml` | Apple cert workflow — likely the same false-positive pattern that appears in the history scan |
| 1 | `e2e/stripe-payment-intent-webhook.spec.ts` | E2E test fixture — verify it's a synthetic Stripe key, not a real one |
| 1 | `app/api/oauth/google-drive/callback/__tests__/route.test.ts` | Test fixture — verify synthetic |
| 1 | `.env.example` | Placeholder by design — confirm not a leaked real value |
| 1 | `.codex/config.toml` | **HIGH PRIORITY** — flagged in RA-4985; toolchain config that may have shipped a real key |

Reconciliation: the 6 tracked-worktree findings are the same population that historical scanning would surface for the current HEAD; the remaining 121 historical findings (127 − 6) exist in older commits whose tracked content has since been modified or deleted. **The 127 history-scan number remains the upper bound on potentially-leaked secrets — git-rewriting historical commits to remove them is part of the RA-4985 scope.**

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

## Path-to-PASS — completed

| Step | Status |
|---|---|
| Reproduce + classify each finding |  Done (this audit) |
| Add `.gitleaks.toml` allowlist with per-finding rationale |  Done (file committed in this PR) |
| `gitleaks detect --no-git --redact` (working-tree only) returns 0 |  Done — 0 findings as of 2026-05-19 |
| Add CI step to `pr-checks.yml` that fails on new working-tree leaks | TODO — small follow-up PR |
| Rotate genuinely-unrotated secret | Tracked by **RA-4988** (Phill action; key in `.codex/config.toml`) |
| Re-author this file as PASS |  Done — frontmatter `status: pass` |

## Open follow-ups (do not block C2 PASS)

- **RA-4988** — Phill rotates the Composio key in the Composio dashboard. Code-side already remediated (`.codex/` gitignored, allowlist allows scanner to ignore historical commit).
- **CI hook** — add `gitleaks detect --no-git --config .gitleaks.toml --exit-code 1` step to `.github/workflows/pr-checks.yml` so any future leak fails the PR before merge.

## Related

- [[ra-4956]] — release gate definition
- [[ra-4985]] — this audit's parent ticket
- [[ra-4988]] — Composio key rotation owner action
- `feedback_never_leak_secrets.md` — Phill's standing rule (governed this triage)

## Why this was never a pass (2026-08-16)

This criterion claimed PASS on the strength of `gitleaks detect --no-git`
returning **0 findings**. That zero was manufactured by the scan's own
configuration, in two independent ways.

**1. The instrument was pointed away from git history.** `--no-git` scans the
working tree only. The audit above states the consequence in its own words —
"Historical commits remain, but no current exposure" — and then treats a
working-tree zero as satisfying a criterion whose risk lives in history. A
secret is exposed because it is *reachable*, not because it is *checked out*.

**2. The allowlist excludes, by path, the file class the real leak is in.**
`.gitleaks.toml` contains, under `[allowlist] paths`:

```toml
'''(?i)\.md$'''
```

Every markdown file in the repository is excluded from scanning. The rationale
recorded for that entry was that sampled `.md` findings were placeholders. The
sample did not include `WEBHOOK_VERIFICATION_CHECKLIST.md`.

**The consequence, confirmed by an independent instrument.** GitHub secret
scanning — which has no knowledge of this allowlist — reports:

| Field | Value |
| --- | --- |
| Alert | [#1](https://github.com/CleanExpo/RestoreAssist/security/secret-scanning/1) |
| Type | `stripe_webhook_signing_secret` |
| State | **open**, `resolution: null` |
| `publicly_leaked` | **true** |
| First location | `WEBHOOK_VERIFICATION_CHECKLIST.md` L34 |
| Commit | `2fc2a3b6` ("Add complete subscription management system with Stripe integration") |
| `has_more_locations` | true (a second file also carries it) |

Verified locally on 2026-08-16 that this is still reachable, not merely
historical trivia:

```
$ git log --all --oneline -- WEBHOOK_VERIFICATION_CHECKLIST.md
2fc2a3b6 Add complete subscription management system with Stripe integration

$ git cat-file -t 1a3f5fcc6b5b7881668587898226a609027ee93b
blob
```

The blob is live in the object store. `.md` is allowlisted. So re-running the
recorded command today — in working-tree mode *or* in full-history mode — would
still return a clean result for this file. **The recorded verification cannot
fail in the presence of this defect**, which is the same class of finding as A3
in this branch and as the `mtime` freshness bug this branch fixes.

**A related mis-classification.** The triage table above classifies
`lib/firebase.ts` as a false-positive ("Firebase Web API keys are PUBLIC by
design"). That reasoning is sound for Firebase Web keys in general, but GitHub
independently raised alert #3 on that same value and it was resolved as
`revoked` — i.e. treated as a real credential requiring rotation. Two
instruments disagreed and only the permissive one was recorded here.

### Scope of this 2026-08-16 review, stated honestly

What was done: static analysis of `.gitleaks.toml`, live read of the GitHub
secret-scanning API, and local confirmation that the offending commit and blob
are reachable.

What was **NOT** done: gitleaks was not re-run. It is not installed on the
machine this review ran on, so the empirical demonstration — same repo, scan
with and without the `\.md$` allowlist entry, showing the finding appear — is
**NOT RUN**, not "passed". The argument above rests on configuration semantics
plus the independent-instrument differential, which is sufficient to withdraw a
PASS but is not sufficient to award one later.

### Path back to PASS

1. Founder rotates the Stripe webhook signing secret and closes alert #1 as
   revoked. Tracked in `docs/FOUNDER-QUEUE.md`. **Until this happens the
   criterion cannot pass, regardless of scanner output** — the exposure is real,
   not a detection artefact.
2. Narrow the `(?i)\.md$` allowlist entry to the specific documented
   placeholder files, so markdown is scanned by default rather than exempt.
3. Install gitleaks in CI and run it over **full history**, not `--no-git`,
   and paste the live output here.
4. Only then set `status: pass` with a fresh `verified:` date.
