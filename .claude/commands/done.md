---
description: "Score the tree against the three-layer Definition of Done, clean up, commit, open a PR — and stop at every owner gate"
---

# Done

Make a completion claim you can defend. This command gates the tree, closes the
CI-parity holes `/session-handoff` leaves open, scores the change against the
Definition of Done, then commits, pushes and opens a PR — and stops.

It never merges, never promotes, and never mints evidence. Those are the
owner's, and §42 of `spec.md` is explicit that opening a PR is **not**
completion either. What this produces is a defensible claim, not a shipped
release.

## Usage

```
/done                    # gate, score, clean up, commit, push, open a PR, stop
/done --check            # read-only: report the DoD position, change nothing
/done --release          # additionally score the release gate and report the position
```

`--full` is deliberately absent. `scripts/handoff-loop.sh --full` runs
`npm run build`, which reaches `prisma migrate deploy` (`scripts/build.sh:48`)
against whatever `DATABASE_URL` is set — that is owner-gated rule 29 executing
as a side effect of a completion check. If you genuinely need it, run it by hand
with the variable unset and say so in the output.

## Phase 0 — Preflight, read-only

Nothing is modified in this phase.

```bash
git status --porcelain
git branch --show-current
git rev-parse HEAD
ls docs/session-handoffs/handoff-*.md | sort | tail -1
```

Three rules, each of which has already cost someone something:

- **Refuse to proceed on `main`.** `.claude/RULES.md` rule 33 — an agent opens a
  PR and stops. If HEAD is `main`, stop here and say so.
- **Sort handoffs by filename, never `ls -t`.** A fresh clone gives every file
  the checkout mtime, so `ls -t` degrades to arbitrary order and has been
  observed returning the *oldest* handoff first. The names are lexicographic
  UTC stamps; sort those.
- **Re-check the tree after the gate.** `.claude/RULES.md` permits at most one
  code-modifying agent at a time. If `git rev-parse HEAD` moved between Phase 0
  and Phase 5, another agent is writing — stop and report rather than committing
  a tree you did not measure.

## Phase 1 — Gate the tree

```bash
bash scripts/handoff-loop.sh            # standard
bash scripts/handoff-loop.sh --quick    # type-check + lint + no-emoji only
```

**Parse the `RESULT:` line. Do not inspect `$?`.** The script says why at
`scripts/handoff-loop.sh:132-137`: a caller reading only the exit code can
misread a dependency-less run as fully covered.

| Signal | Meaning | What to write |
| --- | --- | --- |
| `RESULT: green — all gates passed.` | every gate ran and passed | a normal claim |
| `RESULT: green (with skips: …)` | some gates could not run | name each skip and why it skipped |
| `RESULT: BLOCKED — failing gate(s): …` | a gate failed | stop; the claim is not available |

**`tests` always returns SKIP.** Not sometimes — by design
(`scripts/handoff-loop.sh:151-160`). The DB-backed suites truncate users,
workspaces and organisations, so the gate refuses to key off `DATABASE_URL`. A
`RESULT: green` from this script has therefore **never** included a test run.
Never write "all gates passed" as if it had. The isolated equivalent is
`npm run test:db`, which stands up a throwaway container.

`HANDOFF_GATE_SKIP=1` bypasses everything. A claim made that way is ungated and
must say so.

## Phase 2 — Close the CI-parity holes

This is where `/done` earns its existence over `/session-handoff`. The standard
gate does not run these, and `.github/workflows/pr-checks.yml` does:

```bash
npm run check:a11y                 # pr-checks.yml:145
npm run check:gst-callers          # pr-checks.yml:148
npm run check:floorplan-custody    # pr-checks.yml:231
npm run check:release-bootstrap    # pr-checks.yml:76
npm run audit:ai                   # pr-checks.yml:218
npm run audit:api                  # pr-checks.yml:225
npm run audit:prod                 # pr-checks.yml:343 (enforcing)
npm run test:unit:full             # pr-checks.yml:304
python3 -m unittest scripts.ci.test_digitalocean_production_release -v   # pr-checks.yml:283
```

Two more exist in `package.json` and are wired to no workflow at all, so nothing
but this command will ever run them: `npm run check:corpus` and
`npm run test:parity`.

The secrets scan needs care. CI runs `gitleaks detect --no-git`, and
`--no-git` **ignores `.gitignore`** — so a working-directory scan is not a scan
of what ships. Verify against a `git checkout-index` export, which is what
`scripts/ci/producers/c2-secrets-scan.ts` does.

Report each as PASS, FAIL or **did-not-run**. Never collapse the third into the
first: "ran and found nothing" and "did not run" are different claims, and
`.claude/rules/verification-gate.md` requires you to keep them apart.

## Phase 3 — Score the three layers

The Definition of Done is not one document. Scoring only
`docs/definition-of-done/` finds almost nothing to check, because that folder is
a governance model rather than a checklist.

### Layer 1 — the item, `spec.md` §42 and Appendix C-4

For each item touched this session:

- Acceptance criteria pass with **named evidence** — a test run, an audit-event
  observation, or a manual artefact. `spec.md:322` is explicit that "it
  compiles" is never evidence.
- The defect was **reproduced before it was repaired**, and the new test was
  proven to detect the original defect (`spec.md:391`). A test never observed
  failing has not been shown to guard anything.
- Traceability row moved to `DONE` with a linked test
  (`docs/architecture/RESTOREASSIST-TRACEABILITY.md`).
- Docs and traceability updated **in the same change set** (`spec.md:330`).
- Organisation isolation intact; historical evidence intact; migrations
  reproducible.
- Remaining risks disclosed in the PR body.

Report the matrix and backlog deltas, not just the item.

### Layer 2 — the claim, `docs/definition-of-done/`

The five conditions at `OWNER_APPROVAL_MODEL.md:9-14`, plus — for anything
touching an integration or an external API — the four pointers required by
`INTEGRATION_BOUNDARIES.md:13-17`: route or source, validation, evidence packet,
external gate status.

**Condition 1 (engine reconciliation) is `UNAVAILABLE FROM THIS ENVIRONMENT`,
not failed.** The Project DoD Engine and Coverage Reconciler named at
`MISSION_CONTROL_COVERAGE_VISIBILITY.md:4` lives outside this repository. There
is no script here that recalculates DoD coverage. Reporting it as a failure
would invite someone to "fix" it locally; reporting it as unavailable is the
truth and is exactly the distinction the verification gate demands.

### Layer 3 — the release, only under `--release`

```bash
npx --no-install tsx scripts/release-gate-score.ts --profile=web --json
```

**Check the report's SHA before quoting its score.** `release-gate-report.json`
is untracked and nothing invalidates it, so yesterday's number reads exactly
like today's:

```bash
node -e "const r=require('./release-gate-report.json');const {execSync}=require('child_process');const head=execSync('git rev-parse HEAD').toString().trim();console.log(r.git_sha===head?'fresh':'STALE: report is for '+r.git_sha+', HEAD is '+head)"
```

Do not pass `--strict` in a run whose only purpose is reporting; it exits 1
below the profile maximum and will abort the command.

Omitting `--profile` defaults to `mobile`, which is stricter — an omission
fails safe.

**State the ceiling honestly.** The web profile maximum is 85, and 30 of those
points require signed receipts that only `release-receipt.yml` can mint, through
a reviewer-gated environment the owner dispatches. **No agent can take this
repository past 55 of 85.** A `/done` run that does not say so has overstated
what it achieved.

## Phase 4 — Cleanup

Bounded and reversible only. Enumerate every deletion before performing it.

- Remove build artefacts and scratch files this session created.
- **Do not touch** `.handoff-logs/` (gitignored, and the gate log is cited as
  evidence) or `release-gate-report.json` (untracked by design).
- If a dependency changed, `package.json` and `package-lock.json` go in the
  **same** commit. npm only — never pnpm or yarn.

## Phase 5 — Commit, push, open a PR

Re-run the Phase 0 concurrency check first.

Conventional commit, `type(scope): description`, scope `RA-XXX` or an area.
Push the branch and open the PR against `main` with `Closes RA-XXX` in the body.

**Leave the PR as a draft until acceptance evidence is complete**
(`spec.md:400`). A ready-for-review PR is a claim that Layer 1 is satisfied.

The commit message and PR body must state the basis, not the verdict — which
gates ran, which skipped, what was not verified, and what is unavailable from
this environment.

## Phase 6 — Stop at the owner gates

Print each gate with its current state and what the owner would have to do.
From `.claude/RULES.md:66-76`:

| # | Action |
| --- | --- |
| 29 | Production database migrations and cutovers |
| 30 | Secret and credential rotation |
| 31 | Spend above $50 AUD in a single action |
| 32 | Deleting or cancelling production resources |
| 33 | **Merging into `main`, and promoting a release** |

And from the DoD documents, which extend that list: production DB reads and
writes, live migration, 1Password or OP secret retrieval, email sending, Stripe
or payment actions, claim or order actions, public publishing, and browser
automation or Computer Use.

Three more this command must refuse, which are not in either list:

- **Dispatching `release-receipt.yml`.** It is the only holder of the signing
  key. Minting a receipt is minting the evidence that unlocks release.
- **Dispatching `deploy-production.yml`.** Rule 33, and it requires a human to
  type a 40-character SHA.
- **Editing an evidence file's `status:` or `verified:` frontmatter.**
  `scripts/release-gate-score.ts:326-330` names this exact temptation. Flipping
  a `deferred` or a `fail` is falsifying the gate, not passing it.

The meta-rule at `.claude/RULES.md:76`: stop, state exactly what you would do
and why, and wait for explicit go-ahead **in this session**. Prior approval
cannot be inferred from a ticket status, a runbook's existence, or a previous
session's notes.

Then stop.

## Phase 7 — Verification checklist

Mandatory. `.claude/rules/verification-gate.md` applies in full, and its
exceptions clause does not reach this command: `/done` makes a completion claim.

Produce all five elements — where to check, how to get there, what to see, what
**not** to see, and the confirmation prompt.

## How to read a `/done` result correctly

The failure this guards against is a claim outrunning its evidence, so the
result has to be read precisely.

- **`RESULT: green` never includes a test run.** The `tests` gate is a permanent
  SKIP. If you want the suite, `npm run test:db` runs it in a disposable
  container.
- **Exit 0 with skips is one gate that ran**, not a covered tree. Parse the
  `RESULT:` line.
- **A release-gate score is bound to a SHA.** A stale `release-gate-report.json`
  is indistinguishable from a fresh one until you compare `git_sha` to HEAD.
- **Layer-2 engine reconciliation is unavailable here, not failing.** Those are
  different words for a reason.
- **A green `/done` is not a release decision.**
  `docs/definition-of-done/PRODUCTION_GATE.md:4` — local readiness never
  authorises production action. And `spec.md:397` is blunt that opening a PR,
  writing code and passing type-check are each explicitly **not** completion.
- **55 of 85 is the agent ceiling.** Reaching it means the remaining work is
  yours, not that the work is done.
