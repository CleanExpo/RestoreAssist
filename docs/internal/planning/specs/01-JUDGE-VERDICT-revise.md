# Judge verdict — task #1 Standards Currency Registry: **REVISE**

Dispatched 2026-07-26 as the Stage-2 devil's-advocate gate. The verdict blocks the build.
Recorded here in full effect because it changes what gets built, corrects a claim already
merged to main, and uncovers live defects worth more than the original task.

## The two "verified findings" were true and misread

**1. `nextRevisionExpected` has zero consumers — confirmed, but the field carries no
information.** Every IICRC entry is `year + 5` and NCC is `year + 3`. It encodes the ANSI
review window as arithmetic, not any published IICRC announcement. A currency module built
on it is a function of `year` wearing a compliance costume. Verified independently: the six
values are exactly +5/+5/+5/+5/+5/+3.

**2. §5.1 absent from the index does NOT prove §5.1 does not exist — confirmed.**
`S500_SECTIONS` holds all 16 chapters but subsections for only chapters 7, 8, 9, 10, 12
and 13 (verified by parsing the file: chapter 5 has **zero** subsection keys). It is a
partial table of contents transcribed from the chapter PDFs the owner licensed.
`scripts/check-standards-citations.ts` already documents this and only enforces subsection
depth under `S500_COMPLETE_SUBTREES` = `["10.4","10.5","9.3"]`.
`lib/live-teacher/citation-validity.ts` independently returns `unknown` rather than
`invalid` when it cannot prove absence.

## Correction owed on already-merged work

PR #1988 changed the `water_stopped` gap citation from `S500:2021 §5.1` to `§10.6`, and the
code comment justifies it as *"§5 is Psychrometry and has no 5.1 entry"*. **The second half
of that reason is unprovable** — the index simply does not transcribe chapter 5's
subsections. The change is still defensible on the first half (§5 governs psychrometry and
drying technology; stopping the water source is initial response, §10.6), but the stated
justification overclaims and must be corrected in the comment and the test. Logged as task
#26.

## Live defects the judge found — worth more than the original task

- `app/compliance/page.tsx:60` maps "Health and safety documentation" to **§5.1**
  (Psychrometry). Health and safety is §8.
- `app/compliance/page.tsx:68` and `:73` map photo documentation and insurer audit trail to
  **§4.2** (Building and Material Science). Documentation is §9.2.
- `lib/scope-biohazard.ts:50` cites **AS/NZS 4360:2004** as live authority; the file's own
  comment concedes it was superseded by ISO 31000.
- `lib/reports/generate-report-ai.ts:872-874` instructs the model to cite specific sections
  free-form, straight into an insurer PDF; `:1028-1031` hard-codes material→clause prose
  that is wrong (floating timber → §5.1, carpet on slab → §4.2).
- Of 160 citation literals across `lib/`, `app/`, `components/`, roughly 72% would fail the
  spec's proposed gate — 58 "unresolvable" against a partial index and 57 with no index at
  all (every S100, S540, S700 clause).

**The defect class is semantically wrong but well-formed citations. No syntactic
resolvability check catches them** — §5.1 would be flagged and §4.2 would pass, though both
are equally wrong.

## Design faults

- **The spec never mentions `pnpm check:standards`**, which already exists
  (`scripts/check-standards-citations.ts`, wired at `package.json:58`). Criterion 8 would
  have duplicated it. This proves the spec was written without reading the existing gate.
- **Criterion 4 asks for a regression**: `citation-validity.ts` already has a five-value
  verdict including `edition_mismatch` and `unknown`; the spec would flatten it to a boolean
  that calls a probably-real clause fabricated.
- **The fail-closed gate is a fleet-wide kill switch on a one-line data edit.** The day S500
  6th edition lands, `year` flips to 2026, all 45 correct `S500:2021` literals become
  edition mismatches, and report generation stops everywhere until someone re-transcribes a
  licensed ToC.
- **The admin surface would show six green rows** while the one genuinely withdrawn standard
  (AS/NZS 4360:2004) sits outside the registry entirely, along with ~30 other AS/NZS, NADCA
  and AS standards the product cites.

## Revised direction — what actually gets built

1. **Delete `nextRevisionExpected`** (one line, removes criteria 1–3 entirely). If a currency
   signal is wanted, the honest model is `supersededBy: string | null` plus
   `registerCheckedOn: ISODate`, human-populated, surfaced to the founder only — never to a
   technician and never in a report. Predicted dates never gate anything.
2. **Extend `lib/live-teacher/citation-validity.ts`** rather than writing `resolveCitation`:
   keep the five-value verdict and `unknown`, add S520 coverage, export it for the report path.
3. **Fail closed on `invalid_no_such_clause` only.** `unknown` and `edition_mismatch` log.
   Define the bypass before it can block production.
4. **Point the work at `lib/reports/generate-report-ai.ts`** — free-form model citation into
   insurer PDFs is where the real liability lives.
5. **Keep the positive-control section.** The judge called it the strongest part of the spec
   and the template for future work; the rigour was simply aimed at the wrong feature.

## Process lesson

The judge gate paid for itself on its first use. The spec would have produced a module built
on arithmetic, a duplicate CI check, a regression of a better existing classifier, and a
green compliance dashboard next to a withdrawn standard — all while the actual defect
(semantically wrong citations, including three live ones and an LLM inventing clauses) went
untouched. **Every future spec must name the existing gate it extends before proposing a new
one.**
