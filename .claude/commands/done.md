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

`--full` is deliberately absent, but **not for the reason this file used to
give**. It claimed `npm run build` reaches `prisma migrate deploy` at
`scripts/build.sh:48`. That file is ten lines long and line 2 says the opposite:
builds are database-independent and never mutate a database. The hazard was real
once and has since been closed — `npm run check:release-bootstrap` now fails any
build path that reaches a migration. The same stale claim still sits in
`scripts/handoff-loop.sh`, which is where this one was copied from.

The honest reason to leave `--full` out: it runs `npm ci` and a full production
build, which is slow, and `next build` may still *read* `DATABASE_URL` during
static generation. A read, not a migration. If you want it, run it by hand and
say so in the output.

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
- **Check whether evidence frontmatter was edited.** Phase 6 forbids flipping a
  `status:` or `verified:` to make a criterion pass, but forbidding it in prose
  does not detect it. Run this and report any hit:

  ```bash
  git diff origin/main...HEAD -- docs/evidence/release-gate/ | grep -E '^\+(status|verified):' || echo "  no evidence frontmatter changed"
  ```

  A hit is not automatically wrong — evidence legitimately gets refreshed — but
  it must be stated in the output and justified, never left for a reader to
  find.
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
must say so — and saying so requires checking, not assuming:

```bash
[ -n "$HANDOFF_GATE_SKIP" ] && echo "UNGATED: HANDOFF_GATE_SKIP=$HANDOFF_GATE_SKIP" || echo "gate active"
```

This is condition 2 of `OWNER_APPROVAL_MODEL.md` ("false-done prevention
remains active"). Stating it is active without reading the variable is the
false-done the condition exists to prevent, one level up.

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
npm run test:unit:full             # pr-checks.yml:307
python3 -m unittest scripts.ci.test_digitalocean_production_release -v   # pr-checks.yml:283
```

The three `audit:*` lines look redundant with Phase 1 and are not. They live in
`gate_audits` (`scripts/handoff-loop.sh:162-173`), and the dispatch at
`scripts/handoff-loop.sh:230-241` wires that gate to **`--full` only**. A
standard or `--quick` run — which is every run this command makes — never
reaches them. Presence in the script is not reachability from the mode invoked;
check the `case` block, not just `grep`.

`audit:rls` sits in the same gate and is likewise unreachable here, but it is
omitted deliberately: it needs live production credentials
(`.github/workflows/supabase-advisor-gate.yml:5`), so it is owner-gated rather
than a parity gap this command can close.

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

**State the ceiling honestly.** The web profile maximum is 85. Of that, **35
points are `kind: "owner-evidence"`** and require signed receipts that only
`release-receipt.yml` can mint, through a reviewer-gated environment the owner
dispatches: A1 (10), A3 (5), C2 (5), D1 (5), D3 (5), F1 (5). The remaining **50
points are `kind: "machine"`**: A2 (10), B1-B4 (5 each), C1 (10), D2 (5), F2 (5).

**No agent can take this repository past 50 of 85.** Earlier revisions of this
file said 55, which was arithmetic nobody checked — the criteria are enumerated
in `scripts/release-gate-score.ts` and sum to 50/35. Re-derive it there rather
than trusting this paragraph. A `/done` run that does not state the ceiling has
overstated what it achieved.

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

**Approval given in this session must be written down.**
`PRODUCTION_GATE.md` requires "a separate Founder / Board decision naming the
production action approved", and a decision that exists only in chat is not a
decision anyone can audit later. When the owner approves a gated action, record
in the PR body: what was approved, by whom, and when. Otherwise the next reader
finds a merged change with no trace of who authorised it — including the owner,
six months on.

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

**And open the checklist with an explicit scope line.** Layer 1 is item-level.
`RESTOREASSIST_PROJECT_DOD.md` is emphatic that the project is "not considered
done because a single feature, brief, migration lane, video lane, or validation
task completed" — so a report that says "Layer 1 complete" and stops can be read
as project completion by someone who has not read both documents. Say which it
is, in as many words:

```
SCOPE: item-level. This is <n> item(s) of the backlog, not project completion.
       Project DoD additionally needs data-model posture, security and readiness
       gates, pilot readiness, business-sale readiness, and Founder/Board
       acceptance — none of which this run establishes.
```

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
- **Two more of the five Layer-2 conditions cannot be closed by this command.**
  Condition 2 (false-done prevention active) is now *checked* rather than
  assumed, but only for this run. Condition 5 (Founder/Board acceptance) is the
  owner's act, and this command can record it, never supply it. A report that
  lists five conditions without saying which three it can actually establish has
  overstated itself.
- **A green `/done` is not a release decision.**
  `docs/definition-of-done/PRODUCTION_GATE.md:4` — local readiness never
  authorises production action. And `spec.md:397` is blunt that opening a PR,
  writing code and passing type-check are each explicitly **not** completion.
- **50 of 85 is the agent ceiling**, not 55 — the 35 owner-evidence points need
  receipts only the owner can mint. Reaching 50 means the remaining work is
  yours, not that the work is done.
