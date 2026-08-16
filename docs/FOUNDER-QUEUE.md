# Founder Queue

Items that require Phill's hands, credentials, or judgement. Agents append here and
keep working; nothing in this file blocks the rest of the queue.

Ranked by what blocks selling, then by clock.

**Convention:** each item states what is blocked, why an agent cannot do it, and the
exact action. An item is removed only when its blocking effect is gone, not when it is
merely acknowledged.

Last updated: 2026-08-16 — session "continuous compete loop".

---

## 0. Unblock the release gate on Windows — this blocks EVERY push

**Linear:** RA-7229. **Blocks:** all agent pushes, therefore every PR, therefore
every merge. Nothing else in this queue can progress past "committed locally"
until this clears.

`pr_release_gate.py issue` runs `provision()` before binding tests to a HEAD, and
`provision()` runs `pnpm install --frozen-lockfile`. The repo `.npmrc` sets
`force=true`, so pnpm re-resolves all 2059 packages on every invocation — the log
reads `Lockfile is up to date, resolution step is skipped` immediately followed by
`Packages: +2059`. On this machine it stalled at `reused 46`.

The gate is behaving correctly. It must not be bypassed. The fix is to make
provisioning cheap:

1. Drop `force=true` from `.npmrc` (needs a moment's archaeology on why it is
   there — probably an old stale-store workaround). With a valid lockfile,
   `--frozen-lockfile` already gives the determinism `provision()` wants.
2. Or let `provision()` skip the install when `node_modules` is present and the
   lockfile hash is unchanged, recording which branch it took in the receipt.

**Do not** "repair" the pnpm store with `robocopy /MIR` over `node_modules` —
that has destroyed real sources in this estate before.

---

## 0b. Demo credentials for the RIA path

**Linear:** RA-7228. **Blocks:** demo proof and all D1/D3 owner evidence.

Prod is healthy and every demo surface correctly auth-walls — verified in a headed
browser today. But an agent must not enter credentials, so the authenticated path
cannot be verified unattended. Cheapest durable fix is a seeded demo tenant reached
by a token URL; `/capture/[token]` already exists as a public token route, so the
pattern is there. That also becomes the booth demo at Gold Coast.

---

## 1. WITHDRAWN — "Rotate the Stripe webhook signing secret"

**This item was wrong and required nothing of you. It is left here, struck through,
rather than deleted, so the mistake is visible to the next reader.**

It claimed a credential rotation was required and that release-gate **C2 could not
pass until it happened**. Both were false, and the owner had already said so before
the item was written.

The leaked string is a Stripe **webhook signing secret**, for an endpoint the same
document names as `restore-assist-backend.vercel.app`, not `restoreassist.app`. It is
**not** a Stripe API key — it cannot call the Stripe API, move money, or read customer
data. It **is** the secret that authenticates inbound webhook payloads, so someone
holding it could forge a validly-signed event to that endpoint if the endpoint is
still live and still configured with this value. That has not been verified either
way, and "legacy" is not evidence of "offline".

The error was reading GitHub's `publicly_leaked: true` / `state: open` as a risk
verdict. Those are pattern-match flags; GitHub did not validate the secret or assess
what it permits. Neither did the item — it never asked what the credential could
actually do, which is the only question that decides whether rotation matters.

**Rotations are owner domain, and the owner has assessed this and declined it.** That
is a risk acceptance by the person entitled to make it. No agent should raise it as a
gate blocker or a required action. If evidence later appears that the endpoint is live
*and* still using this value, surface it as information — the decision stays with the
owner. Linear RA-7224 is cancelled.

**What was real, and is now an agent's job with no owner involvement:** `.gitleaks.toml`
allowlists `(?i)\.md$`, so every markdown file is excluded from scanning, and the
recorded C2 command additionally ran `--no-git`. The scan cannot see a whole file
class. That is why C2 is `fail`, and fixing it is code work — see the "Path back to
PASS" in `docs/evidence/release-gate/1.0.0/C2-secrets-scan.md`.

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
