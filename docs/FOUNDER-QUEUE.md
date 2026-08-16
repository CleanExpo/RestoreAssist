# Founder Queue

Items that require Phill's hands, credentials, or judgement. Agents append here and
keep working; nothing in this file blocks the rest of the queue.

Ranked by what blocks selling, then by clock.

**Convention:** each item states what is blocked, why an agent cannot do it, and the
exact action. An item is removed only when its blocking effect is gone, not when it is
merely acknowledged.

Last updated: 2026-08-16 — session "continuous compete loop".

---

## 1. Rotate the Stripe webhook signing secret, then close alert #1

**Blocks:** release-gate criterion **C2** (5 pts). C2 is now `status: fail` and cannot
return to `pass` until this is done — the exposure is real, not a detection artefact.

**Why an agent cannot do it:** requires Stripe dashboard authentication and a
credential-rotation decision. Class-2 credential action.

**Evidence:** GitHub secret-scanning
[alert #1](https://github.com/CleanExpo/RestoreAssist/security/secret-scanning/1) —
`stripe_webhook_signing_secret`, `state: open`, `publicly_leaked: true`, first located
in `WEBHOOK_VERIFICATION_CHECKLIST.md` L34 @ commit `2fc2a3b6`, `has_more_locations: true`.
Blob `1a3f5fcc` confirmed still reachable in the object store on 2026-08-16.

**Correction to a carried assumption:** this was previously described as "a local file,
not live". The *value* may well be a local `stripe listen` secret rather than a live
endpoint secret — but the *file was committed and is public*. Treat it as exposed.

**Action:**
1. Stripe Dashboard → Developers → Webhooks → roll the signing secret for the affected
   endpoint. Update `STRIPE_WEBHOOK_SECRET` in Vercel (all environments).
2. Close alert #1 as **revoked**, with a resolution comment naming the rotation date.
3. Reply here so an agent can re-run the C2 scan and propose the flip to `pass`.

---

## 2. Merge PR #2012 — Windows type-check portability

**Blocks:** a clean local `pnpm type-check` on this machine; minor.

**Why an agent cannot do it:** merges are founder-only this session by standing rule.

**State:** `OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, base `main`,
head `fix/windows-type-check-portability`.

**Action:** https://github.com/CleanExpo/RestoreAssist/pull/2012 → Squash and merge.

---

## 3. Branch protection on `main` — one toggle still open

**Blocks:** nothing functionally, but it is the difference between a protected and an
advisory branch, and the standing rule forbids agents force-pushing.

**Read live 2026-08-16** via `gh api repos/CleanExpo/RestoreAssist/branches/main/protection`:

| Setting | Current | Wanted |
| --- | --- | --- |
| `allow_force_pushes` | **`true`** | `false` |
| `enforce_admins` | `true` | `true` — already correct |
| `required_status_checks.contexts` | `["Quality Checks"]` | as-is |
| `required_status_checks.strict` | `false` | founder call |
| `required_approving_review_count` | **`0`** | founder call — currently nobody must approve |
| `allow_deletions` | `false` | correct |

**Action:** https://github.com/CleanExpo/RestoreAssist/settings/branches → edit `main` →
untick **Allow force pushes**. Decide on the two `founder call` rows while there.

---

## 4. Trigger the TestFlight build

**Blocks:** release-gate criterion **E2**. This is the session's only external clock —
Apple processing time is not compressible, so it should start before anything else in
this list.

**Why an agent cannot do it:** requires App Store Connect credentials and an upload
decision.

**Action:** kick the build now; an agent fills the E2 evidence the moment processing
finishes. If Apple is still processing at session end, E2 ships as
`complete-pending-build` — the single permitted contingency.

---

## 5. Decide: required approving reviews on `main`

Currently `0`. With `enforce_admins: true` and agents forbidden from merging, the
practical gate is your hand on the button. Setting it to `1` would make that structural
rather than behavioural. Your call — noted because a rule enforced only by discipline is
the thing this estate keeps getting caught by.

---

## Resolved this session

- ~~Independent reviewer missing~~ — key was already on the box
  (`%LOCALAPPDATA%\hermes\.env`); installed to `~/.claude/secrets/openrouter.key`
  (confirmed gitignored first), model `qwen/qwen3.8-max` confirmed served, positive
  controlled both ways. No founder action was needed.
- ~~`pr_release_gate.py` hook dead~~ — unquoted path with spaces plus a POSIX
  `/usr/bin/env python3`. Fixed to the quoted Windows form already used by the fence
  hook. Proven live in-session: `git push` blocked, `echo` allowed.
- ~~Skills `self-improvement-charter` / `operating-doctrine`~~ — confirmed absent from
  this box; founder ruled they are not to be loaded. Doctrine source is `CLAUDE.md` §0.
