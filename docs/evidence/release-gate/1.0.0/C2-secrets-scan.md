---
criterion: C2-secrets-scan
status: fail
verified: 2026-08-16
last_scanned: 2026-08-16
---

# C2 — Secrets scan + config sanity (5 pts)

**Status:** FAIL — demoted 2026-08-16. The scan this criterion rested on
allowlisted every markdown file in the repository, so it could not have detected
a secret committed to one. That is measured, not argued — see the control below.
The allowlist is now narrowed, the scan is control-proven and running in CI, and
one owner question remains. The May audit is retained unchanged as the record of
what was examined then.
**Last scanned:** 2026-08-16 — working tree (clean, control-proven) and full
history (3489 commits, 55 findings, all in deleted files, triaged below)
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
scanning — which has no knowledge of this allowlist — found something the
configured scan structurally could not. Note carefully what that does and does
not establish: it proves the **scan is blind to a file class**. It is not by
itself a risk verdict. See "What this is not" below.

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

### What this is NOT — a correction, recorded deliberately

An earlier revision of this section (2026-08-16) asserted that the leaked value
constituted a live exposure and that **rotation was required before C2 could
pass**. That was wrong, it was withdrawn by the owner, and it is corrected here
rather than quietly deleted.

Reading the file as committed at `2fc2a3b6` shows what the string actually is: a
Stripe **webhook signing secret**, for an endpoint the same document identifies
as living on `restore-assist-backend.vercel.app`, not `restoreassist.app`.

Stated precisely, because a second review round caught this section
overcorrecting into its own sloppiness:

- It is **not** a Stripe API key. It cannot call the Stripe API, move money,
  issue refunds, or read customer data from Stripe.
- It **is** the secret that authenticates inbound webhook payloads — that is its
  entire purpose. Someone holding it could generate a valid `Stripe-Signature`
  header for a forged event sent to that endpoint. If that endpoint is still
  live and still configured with this value, forged events could drive whatever
  application state it trusts webhooks for.
- `restore-assist-backend.vercel.app` is referred to here as a *legacy* host on
  the strength of the document naming it alongside a note to migrate away.
  **That is not evidence the project is offline**, and it has not been verified.

The original error was treating GitHub's `publicly_leaked: true` and
`state: open` as a risk verdict. They are pattern-match flags; GitHub did not
validate the secret or assess what it permits. The earlier revision never asked
what the credential could actually do — it just escalated. Then the first
correction swung the other way and claimed more safety than had been checked.
Both were a conclusion substituted for a check.

**Rotation is owner domain, and the owner has assessed this and declined it.**
That is a risk acceptance by the person entitled to make it, and it is recorded
here as such. C2 does not depend on it, and no agent should raise it as a gate
blocker or a required action. If evidence later appears that the endpoint is
live *and* still configured with this value, surface that to the owner as
information; the decision remains theirs. RA-7224 is cancelled.

**What survives the correction, entirely intact:** the scan is blind to every
`.md` file and was additionally run `--no-git`. That is a defect in the control
itself, independent of whether any particular finding matters. A secrets scan
that cannot see a whole file class is not a secrets scan, and that is why this
criterion is `fail`.

**A related mis-classification.** The triage table above classifies
`lib/firebase.ts` as a false-positive ("Firebase Web API keys are PUBLIC by
design"). That reasoning is sound for Firebase Web keys in general, but GitHub
independently raised alert #3 on that same value and it was resolved as
`revoked`. Recorded as an instrument disagreement worth noting, not as a claim
that the earlier triage was wrong — the same care this section just had to learn
applies here too.

### Scope of this 2026-08-16 review, stated honestly

What was done: static analysis of `.gitleaks.toml`, live read of the GitHub
secret-scanning API, and local confirmation that the offending commit and blob
are reachable.

What was **NOT** done at the time: gitleaks was not installed on the machine
that review ran on, so the empirical demonstration was recorded as **NOT RUN**,
not "passed".

### That gap is now closed — measured 2026-08-17 02:20 AEST (2026-08-16 16:20 UTC), gitleaks 8.30.1

A synthetic canary was planted in a markdown file at the repo root:

```
__canary_probe.md
stripe_key = "sk_test_51SYNTHETIC…probe00"
```

The same scan was then run twice, changing exactly one thing — whether
`.gitleaks.toml` still contains its `'''(?i)\.md$'''` allowlist entry:

| Arm | Config | Result |
| --- | --- | --- |
| **A** | repo config, as committed | `scanned ~158.41 MB` → **`no leaks found`**, exit 0, **0** findings on the canary |
| **B** | identical, `(?i)\.md$` line removed | `scanned ~163.36 MB` → **`leaks found: 2`**, exit 1, canary caught by rule `stripe-access-token` |

Same scanner, same repository, same planted secret. The only variable is that
one allowlist line. **The blindness is measured, not argued** — the scan reports
a clean repository while a Stripe-shaped key sits in a markdown file it refuses
to open. Canary deleted afterwards; worktree confirmed clean.

### One thing Arm B surfaced that the fix has to handle

Arm B's second finding was **this file**, at the line where the triage table
quotes a redacted Composio key while documenting it. That is documentation of a
finding, not a live credential — but it means narrowing the allowlist will
surface evidence and runbook files that legitimately quote secret-shaped
strings. The narrowed allowlist must exempt those specific documented files by
path, rather than exempting the whole `.md` class. Exempting a class is what
produced this defect.

### Steps 1 and 3 are done - the allowlist is narrowed and the scan is control-proven (2026-08-16 17:40 UTC / 2026-08-17 03:40 AEST)

**The blanket `(?i)\.md$` allowlist entry is removed.** Markdown is scanned like
every other file. Re-running the working-tree scan with it gone produced exactly
**one** finding across 163.80 MB:

```
generic-api-key  docs/evidence/release-gate/1.0.0/C2-secrets-scan.md:42
                 wrongSecret = "whsec_definitely_wrong_secret_ra1103"
```

That is a deliberately-invalid webhook secret in this very file, used to show
that signature verification **rejects** a wrong secret - the string says so in
its own name. It is allowlisted by its exact literal in `regexes`, **not** by its
path, so the rest of this file and every other markdown file stays scanned.

**The prediction in the section above was overtaken by events.** It said the fix
would have to exempt documented files *by path*, because an earlier run had also
flagged this file's redacted Composio key. That line no longer exists - the file
was reworded in #2020/#2021 - so one narrow literal was enough. Recorded rather
than silently dropped, because the reasoning was sound when written.

#### The control, including the two rounds where it failed

A scan that has never been shown to fail proves nothing. Three arms, same config,
same repository:

| Arm | Working tree | Result |
| --- | --- | --- |
| 1 | clean | `no leaks found`, exit 0 |
| 2 | canary in a root `.md` | **`leaks found: 1`** - `slack-bot-token`, `__c2_canary_probe.md:3`, exit 1 |
| 3 | canary removed | `no leaks found`, exit 0 |

**The first two canaries were not caught, and that near-miss is the most useful
thing in this document.** The obvious reading was "markdown is still exempt, the
fix did not work". It was wrong. Putting the identical string in both a `.md` and
a `.txt` produced no finding either way, which pointed at the probe rather than
the scanner; scanning an isolated directory against gitleaks' **default** rules
confirmed it. The synthetic `sk_test_51SYNTHETIC...` string matches no rule, and
`AKIAIOSFODNN7EXAMPLE` is AWS's own documentation example. Only a `xoxb-` Slack
token fired.

Had arm 1's `no leaks found` been trusted without arms 2 and 3, this criterion
would have been marked green while still blind - **the exact defect it was
demoted for**. A canary that cannot fire is not a canary, and "0 findings" from a
broken probe is indistinguishable from "0 findings" from a clean repository.

#### Step 2, partially: the scan now runs in CI

Added to `.github/workflows/pr-checks.yml` (job `Quality Checks`, which is proven
to run - it executed 843 test files on the most recent merge). It installs
gitleaks **8.30.1**, the version the control was run with, and issues the
identical `--no-git` invocation, so CI and the measurement above are the same
instrument.

It is deliberately **not** `gitleaks/gitleaks-action@v2`: that action scans the
PR's commits, which is a different command than the one control-proved here.

It was also deliberately **not** added to `deepsec-weekly.yml`, the repository's
existing scheduled security workflow. That workflow has failed **all six** of its
most recent scheduled runs (2026-07-06 through 2026-08-10). Wiring a new control
into a host that has not succeeded in six weeks would produce the appearance of
coverage and none of the substance.

#### Step 2, the remaining half: full history is NOT gated, and here is why

A full-history scan was run: **3489 commits, ~79.16 MB, 6m42s, 55 findings.**

It is not wired into CI, because a gate that is red on arrival gets disabled
rather than fixed. The 55 break down as:

| Rule | Count |
| --- | --- |
| `generic-api-key` | 33 |
| `curl-auth-header` | 18 |
| `private-key` | 2 |
| `jwt` | 1 |
| `gcp-api-key` | 1 |

**Every one is in a file that no longer exists in the working tree** - the
working-tree scan is clean. 33 of 55 carry an explicit placeholder marker
(`your_`, `example`, `<...>`, `_here`, `sk_test`, `REDACTED`). Of the remaining
22, these are benign by design and need no action:

- `lib/stripe-client.ts` x2 - `pk_test_` **publishable** keys. Publishable is
  their purpose.
- `lib/firebase.ts` - a Firebase Web API key, **public by design** per Firebase's
  own documentation; it identifies the project, it does not authenticate. The
  config already carries a stopword for this pattern.
- `.github/workflows/ios-release.yml` x2 - base64 decoded at runtime from the
  `IOS_DIST_P12_BASE64` GitHub Actions secret, not committed plaintext.
- `JWT_SECRET` (9 chars) and `restoreassist...` matches - variable **names**, not
  values.

#### The one thing an agent cannot settle - and it is a question, not a demand

Eight findings are `whsec_`-shaped, 38 characters, which is the shape of a Stripe
webhook signing secret. Hashing them shows only **two distinct values**: one
copy-pasted across seven now-deleted documents, one in an eighth. All eight files
are deleted from the working tree; the repository's history is public.

**No claim is made here that these are live credentials, and no rotation is being
requested.** Stating precisely what is and is not known:

- A `whsec_` verifies that an **inbound** payload genuinely came from Stripe. It
  authorises no API call, reads no data, and moves no money. Its worst case is
  that someone could forge webhook events at an endpoint.
- Whether these two values are live, already-cycled, or documentation examples
  **cannot be determined from the repository**. It is a Stripe dashboard lookup,
  and the dashboard is owner-only.
- Pattern-shape is not a risk verdict. Reading a regex match as a finding, rather
  than asking what the credential actually permits, is a mistake this document
  has already made once and will not repeat.

**This is the single item between C2 and PASS.** If the owner confirms the two
values are examples or already superseded, steps 4 and 5 close immediately and
this criterion goes green with no further engineering.

### Path back to PASS

Steps 1 and 3 are **done** (above). Step 2 is done for the working tree and
deliberately deferred for history. Steps 4 and 5 wait on the single owner
question above. Original plan retained for the record:

1. Narrow the `(?i)\.md$` allowlist entry to the specific documented placeholder
   files, so markdown is scanned by default rather than exempt.
2. Install gitleaks in CI and run it over **full history**, not `--no-git`, and
   paste the live output here.
3. Positive-control the result before trusting it: plant a synthetic
   secret-shaped value in a `.md` file, confirm the scan **finds** it, then
   remove it. A scan that has never been shown to fail proves nothing — that is
   the defect this criterion was demoted for in the first place.
4. Triage whatever the full-history scan surfaces on its merits, per finding —
   what the credential permits, not what pattern it matches.
5. Only then set `status: pass` with a fresh `verified:` date.
