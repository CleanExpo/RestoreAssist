# Review instructions

What an automated reviewer must do on a RestoreAssist pull request. Read by the
review panel (`scripts/ci/review-panel/`) and by any agent asked to review a diff.

## The passes

The dimensions, their severities, and which file paths activate which dimension
are defined once in **`.claude/rules/review-dimensions.md`**. That file is the
source of truth; this one does not restate it.

Read it, apply the activation matrix to the changed paths, and tag every finding
with its dimension number and severity.

## Severity means what that file says it means

Reserve **Critical** for the four dimensions listed as Critical there — security,
data modelling, migration safety, integration integrity. A finding is Critical
because it would leak data, lose data, or break a boundary, not because it looks
serious.

Everything stylistic is a nit, whatever it is about.

## Confidence

Every finding carries a confidence score (0–100), built from the boosters and
reducers in `review-dimensions.md`. **Findings below 75 are not reported.** A
false positive costs more than a missed nit, because it teaches the author to
skim the review.

## Cap the nits

At most five nits per review. Summarise the rest as a count.

## This repository in particular

These are the mistakes that actually get made here. Check them explicitly.

- **A regulatory fact typed from memory.** Any year, threshold, standard, clause
  or edition must come from `lib/compliance/regulatory-registry/` or
  `standardCite()`. A hardcoded year in a comparison is a finding even when the
  year is right, because the next person cannot tell that it is.
- **AU rules applied to an NZ job, or the reverse.** GST is 10 per cent AU and 15
  per cent NZ; asbestos presumption 2004 AU and 2000 NZ; lead 1970 AU and 1980
  NZ; different regulators are notified. A jurisdiction-blind code path that
  reads a jurisdiction-specific constant is Critical, not a nit.
- **A value re-derived instead of imported.** The owners are listed under "Single
  sources of truth" in `CLAUDE.md`. A second `apiVersion:` literal, a `?? 10`, a
  `/ 11`, a brand hex in a component — each has drifted here before.
- **A test that has never been observed failing.** A new test added alongside the
  fix it guards, with no evidence it fails against the unfixed code, has not been
  shown to guard anything. So is an assertion blunter than the property it
  checks — this repo has shipped three.
- **A baseline ratcheted the wrong way.** `scripts/*-baseline.json` files may only
  ratchet down. A raised count, or `--update-baseline` run against a new
  violation, silences the gate rather than passing it.
- **`onDelete: SetNull` on evidence.** Deleting a `SketchRoom` silently blanks the
  room link on pins, moisture readings and hazards. Detach with
  `partitionStaleRooms()` instead.
- **A token-gated route that is not `noindex`**, or a `robots.txt` `Disallow` on
  one — the Disallow stops the crawler reading the noindex.

## Do not report

- Generated files, `node_modules/`, lockfiles.
- Anything `pr-checks.yml` already enforces — type errors, lint, formatting,
  emoji, AU-English, encoding. CI says it better and earlier.
- The `AGENTS.md` block that `next dev` rewrites on every run.
- Style preferences not written down in `.claude/DESIGN.md` or
  `.claude/STANDARDS.md`.

## What a reviewer may not do

Findings are advisory. The panel does not approve, does not block a merge, and
does not push to the branch. A code owner approves through branch protection,
informed by what the panel found.

Never propose, as a fix for a failing check: skipping or deleting a test,
loosening an assertion, raising a baseline, or editing an evidence file's
`status:` or `verified:` frontmatter. Those are ways of hiding a finding.

## Output

Strict JSON, no prose around it:

```json
{
  "findings": [
    {
      "dimension": 2,
      "severity": "critical",
      "confidence": 90,
      "file": "app/api/foo/route.ts",
      "line": 14,
      "summary": "One sentence stating the defect.",
      "failure_scenario": "Concrete inputs or state, and the wrong output or breach that results."
    }
  ],
  "nits_omitted": 0
}
```

An empty `findings` array is a valid and common answer. Do not manufacture a
finding to look useful.
