# Intent: New Zealand jobs are not checked against the New Zealand Building Code

**Author:** Phill McGurk (owner) · **Date:** 2026-09-02 · **Status:** draft

## Problem

`lib/compliance/nzbs-compliance-gate.ts` exists to stop a New Zealand inspection
being submitted without addressing the NZBC clauses that apply to it — E2 External
Moisture, E3 Internal Moisture, F2 Hazardous Building Materials. It has never done
that for a single job.

Line 77 is `const propertyCountry: string = "AU";`, hardcoded. Every inspection
therefore fails the `!== "NZ"` test on line 79 and returns `canSubmit: true` with
no blockers. The gate is a no-op, in full, for every job in the system.

The comment above it is honest about why, and worth reading before anyone "fixes"
this: the original reason recorded — that no country field existed — stopped being
true when `Inspection.propertyCountry` landed in RA-6996. So there is no migration
to write. What is missing is that the caller never threads the inspection's country
down to the gate, and nobody has decided what should happen on the day it does.

This is the same shape of defect as the asbestos-era work already landed this
week: a New Zealand job silently judged by Australian rules. The difference is that
those were wrong answers, and this is no answer at all.

## Proposed outcome

A New Zealand inspection cannot be submitted while an NZBC clause that applies to
it is unaddressed, and the submitter is told which clause and why. An Australian
inspection is unaffected.

## Affected users and systems

New Zealand contractors submitting inspections. `lib/compliance/nzbs-compliance-gate.ts`,
whatever route calls it, and the submit path in the dashboard that would need to
show the blocker.

## Constraints

- **This is a New Zealand rule and only a New Zealand rule.** NZBC Schedule 1 sits
  under the Building Act 2004. It has no Australian equivalent and must not be
  applied to an AU job.
- **Any clause reference is a regulatory claim.** E2, E3 and F2 must come from
  `lib/compliance/regulatory-registry/` and be verifiable, not typed from memory.
  `legislation.govt.nz` is egress-blocked from the agent environment, so
  verification will be `secondary-quoting-primary` unless someone can open the
  primary.
- **Turning it on is a behaviour change for live users, not a bug fix.** On the
  day this ships, New Zealand submissions that pass today will start failing. That
  is the intended effect and it is still a change someone has to choose.

## Out of scope

- Adding clauses beyond E2, E3 and F2. If others apply, that is a separate intent.
- Changing the Australian compliance path in any way.
- Backfilling or re-validating inspections already submitted. Historical evidence
  is not rewritten.

## Open questions

1. **Does it block, or warn first?** A gate that starts rejecting submissions on
   deploy day may strand a contractor mid-job on a site with no signal. A warn-only
   period would avoid that and would also show how many real jobs it would have
   caught — but a warning nobody must act on is not a gate.
   *Who can answer: the owner.* This is the decision the whole change waits on.
2. **What counts as "addressed" for a clause?** The existing `NzbsClause.addressed`
   is a boolean with no definition behind it. Does an E3 mention in the scope
   satisfy it, or does it need a moisture reading?
   *Who can answer: the owner, with a New Zealand contractor.*
3. **How many current New Zealand jobs would this have blocked?** Nobody knows,
   because the gate has never run. This is answerable read-only against production
   before anything ships, and the answer probably decides question 1.
   *Who can answer: the owner — production reads are owner-gated (rule 29).*

## Evidence

Found by reading `lib/compliance/nzbs-compliance-gate.ts:69-81` while auditing the
repo against the AI-native SDLC playbook on 2026-09-02. The file documents its own
inertness; what it does not have is a decision. It is listed as an open item in
`docs/findings/iicrc-standards-provenance.md` and carries `TODO RA-1120`.

No customer has reported this, which is expected: a gate that never fires produces
no complaints. That absence of signal is not evidence that it does not matter.
