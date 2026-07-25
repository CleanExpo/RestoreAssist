# Spec — Standards Currency Registry (night-run task #1)

Stage: DEFINE complete. Source: backlog #6. Written 2026-07-26.

## Problem, in one sentence

RestoreAssist stakes its insurer-facing defensibility on IICRC citations, but nothing in
the product checks whether the standard behind a citation is current, or whether the
citation resolves to a real clause at all.

## Why now — two verified findings

1. **The staleness data exists and nothing reads it.** `STANDARDS_VERSIONS`
   (`lib/nir-standards-mapping.ts:828-835`) carries `nextRevisionExpected` for all six
   standards. A repo-wide grep for that field returns **only the six declaration lines —
   zero consumers**. By its own data NCC 2022 was due for revision in 2025 (now past) and
   S500/S100 are due in 2026 (now); no surface warns, and no gate blocks.
2. **An unresolvable citation shipped as structured data.** The 2026-07-25 review wave
   caught `S500:2021 §5.1` pinned into report-gap rows — §5 is "Psychrometry and Drying
   Technology" and has no 5.1 entry in the verified section index. It was caught by an
   adversarial reviewer reading the diff, not by any gate. The same class of defect in a
   generated insurer report is a defensibility failure, not a cosmetic one.

## Outcome

Every citation the product emits is **resolvable** against the verified section index and
**current** against the registry — or generation fails closed with a named reason.

## Scope

In scope: a currency/resolvability module over the existing `STANDARDS_VERSIONS` and the
S500/S520 section indexes; a fail-closed gate at report generation; an admin surface
showing per-standard status; a CI check preventing new unresolvable literals.

Out of scope: acquiring new standard editions (licensing, founder-gated); OCR or ingestion
of standard text (copyright — `lib/standards/copyright-guard.ts` stands); changing any
existing citation's clause number beyond what the section index proves wrong.

## Acceptance criteria — each one machine-falsifiable

1. `standardCurrency("NCC")` returns status `overdue` given today's date, because
   `nextRevisionExpected` (2025) has passed. A test pins this with an injected clock, not
   the system date.
2. `standardCurrency("S520")` returns `current` (due 2029).
3. A standard within 12 months of `nextRevisionExpected` returns `due_soon` — asserted at
   both boundaries (12 months minus a day is `due_soon`; 12 months plus a day is `current`).
4. `resolveCitation("S500:2021 §5.1")` returns `{ resolvable: false }`; `"S500:2021 §10.6"`
   returns `{ resolvable: true, title: "Initial Response, Inspection, and Preliminary
   Determination" }`.
5. Report generation with a citation whose standard is `overdue` **or** whose clause is
   unresolvable returns a structured refusal naming the standard and the clause. It does
   not silently emit. A test asserts the refusal and asserts no PDF bytes were produced.
6. An `unverified` standard — one present in a citation but absent from
   `STANDARDS_VERSIONS` — fails closed the same way.
7. The admin surface renders one row per standard with edition, designation, expected
   revision year, and status, sourced from the registry (no hard-coded literals). A test
   asserts the row count equals `Object.keys(STANDARDS_VERSIONS).length`.
8. A CI check fails on any **new** hard-coded `S###:YYYY §x.y` literal in `lib/`, `app/`
   or `components/` that does not resolve against the section index. Existing violations
   are captured in a baseline file so the check lands green and ratchets.
9. `pnpm type-check` exits 0; the affected vitest paths pass; the four known pre-existing
   full-suite failures remain the only failures.

## Positive controls — required before any "clean" claim

- Criterion 8's checker must be proven able to fail: introduce a probe literal
  (`S500:2021 §5.1`), observe the check fail, remove it, observe it pass. A green run
  from a checker never shown to fail is not evidence.
- Criterion 5's gate must be proven able to block: a fixture report carrying an overdue
  standard must produce the refusal before the happy-path test is trusted.

## Risks

- **Over-blocking.** If NCC is `overdue` today and the gate blocks on `overdue`, report
  generation stops for every job on day one. Mitigation: the blocking threshold is
  configurable per standard, defaulting to block on `unverified` and `unresolvable`, and
  to **warn** on `overdue` until the founder confirms the stricter posture. This decision
  is called out for the Plan stage's judge pass.
- **Citation churn.** Correcting existing wrong clause numbers changes insurer-visible
  output; each correction cites the section index as its evidence.

## Open decision for Stage 2 (PLAN)

Whether `overdue` blocks or warns at launch. Recommendation: **warn** on `overdue`, block
on `unresolvable`/`unverified`. Blocking on `overdue` would halt all report generation
immediately given NCC's 2025 date, and standard currency is a procurement problem the
founder must solve, not a defect the technician can fix mid-job.
