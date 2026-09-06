# Intent: the Notifiable Incident Record cannot be built, because nothing tells it who to notify

**Author:** Claude (agent), on behalf of the RestoreAssist owner · **Date:** 2026-09-02 · **Status:** accepted

## Resolved, 2026-09-02

Built. The four duties were verified against primary sources the same day this
intent was written, which lifted the block:

| Entry | Source |
| --- | --- |
| `whs.notifiable-incident-duty.au` | model WHS Act 2011 ss35-38, via Safe Work Australia |
| `whs.notifiable-incident-duty.nz` | HSWA 2015 ss25 & 56, via WorkSafe New Zealand |
| `whs.incident-site-preservation.au` | model WHS Act 2011 s39 |
| `whs.incident-site-preservation.nz` | HSWA 2015 s55 |

**Open question 0 answered, and the answer was worse than the question.** The
24-hour deadline in `safework-notification-gate.ts` was not merely unsourced --
it was wrong twice. Australia requires notification IMMEDIATELY and New Zealand
AS SOON AS POSSIBLE; the figure 24 appears in neither Act, and the only 48 hours
in the WHS Act is a written follow-up conditional on the regulator asking. The
clock also ran from the inspection date rather than from becoming aware, so an
incident discovered later was handed a deadline already in the past. The gate now
resolves the duty from the registry per country and states it rather than
counting down.

**Open question 3 answered by the owner:** the record lives in the authority
catalogue, with `MANAGER` and `CONTRACTOR` signatories and no client, and a
comment saying it records rather than authorises so nobody later "fixes" it.

**Open questions 1 and 2 remain partly open by decision.** The 2025 model WHS Act
amendments are recorded as "may apply -- confirm with your regulator" rather than
asserted as in force, because adoption varies by jurisdiction and Safe Work
Australia's own guidance is to check. Per-state entries were not written.

`REGULATOR_MAP` still holds nine regulator names and URLs outside the registry.
That is a directory rather than a rule with a commencement date, and moving it is
its own change.

## Problem

Spec section 9.3 lists eight documents the registry should feed. Five now exist
or are being built. One cannot be started at all.

The Notifiable Incident Record is the document a contractor completes when
something happens on site that the law requires them to report — a death, a
serious injury, a dangerous incident. The spec says it draws on the `WHSIncident`
model, the job's jurisdiction, and "regulator + notification duties" from the
registry.

The registry holds no such entries. All 34 are asbestos, building code,
chemicals, electrical, lead or silica. There is nothing that says who the
regulator is for a given state, what counts as notifiable, how quickly it must be
reported, or what has to be preserved at the scene. So the document has nothing
to cite, and the rule that makes this system safe — a template may only cite a
registry entry id, never restate a rule in its own prose — means it cannot be
written by describing the duty instead.

What that costs: the one document in the catalogue with a statutory clock on it
is the one that does not exist. A notification deadline is measured in hours, and
a contractor who does not know which regulator to ring is not helped by a
document that lists the wrong one.

There is a sharper version of the problem next door, and it is worth being
precise about it because a first reading of this file got it wrong.

`safework-notification-gate.ts` already knows nine regulators and a notification
deadline. `REGULATOR_MAP` names SafeWork NSW, WorkSafe Victoria, WorkSafe New
Zealand and six others with their URLs, and the gate sets a deadline of
`inspectionDate + 24 hours`, commented "per WHS Act". None of that is in the
registry. It has no `sourceUrl`, no `verifiedAt`, and nothing checks it — so the
one hard number in the whole notification path, the 24-hour clock, is an
unsourced literal in a module, which is the shape this system exists to remove.
A document cannot cite it, because there is nothing to cite.

The routing bug that used to sit alongside it is FIXED, and this file said
otherwise before the code was read: a positive `Inspection.propertyCountry` of
"NZ" now short-circuits ahead of postcode detection, so a New Zealand job does
reach WorkSafe New Zealand. What remains is narrower. `propertyCountry` defaults
to "AU", so a New Zealand job whose country was never set still falls through to
`detectJurisdiction()` — and Auckland's 1010 sits inside that function's
`1000–2999` band, so it does not merely fall back to NSW, it returns NSW
confidently. That is the residual case, and it is the shape the eval case
`jurisdiction-aware-threshold` was seeded from.

## Proposed outcome

A contractor who has had a notifiable incident can generate a record that names
the regulator for the job's actual jurisdiction, states the notification duty
that applies, and carries the source and verification date for both — so they can
act on it rather than ring someone to ask.

Equally important: where RestoreAssist does not hold a verified duty for that
jurisdiction, the document says so plainly instead of offering a neighbouring
state's.

## Affected users and systems

Restoration contractors and site supervisors, at the worst moment of a job.
Likely involved: the regulatory registry, the document catalogue, `WHSIncident`,
and `safework-notification-gate.ts`.

## Constraints

- **Both countries, and every Australian state.** Notification duties are not
  national. Each state and territory has its own regulator, and New Zealand's
  sits under a different Act entirely. A single "AU" entry would be wrong for
  most jobs that used it.
- **This is entirely regulatory claim.** Every line has to come from
  `lib/compliance/regulatory-registry/`, verifiable against a primary source.
  Nothing here may be written from memory: a wrong notification window is worse
  than no document, because it will be believed.
- **A missing entry must read as missing.** The provenance block already
  distinguishes "no verified entry held" from "no duty exists"; this document
  depends on that distinction more than any other.

## Out of scope

- Actually notifying anyone. The document records; it does not transmit. Email
  sending is owner-gated.
- Advising whether a given incident is notifiable. That is a judgement about
  facts, and the document should present the duty and let a person decide.
- Rewriting `safework-notification-gate.ts`. Its New Zealand hole is real and is
  recorded here so it is not lost, but fixing it is its own change.

## Open questions

0. **Is the existing 24-hour deadline right, and right everywhere?** Who can
   answer: the model WHS Act as enacted in each state, and New Zealand's own
   Act. It is currently a literal in `safework-notification-gate.ts` with no
   source. Moving it into the registry means first establishing whether it is
   one duty or nine. **Unverified today.**
1. **What are the notification duties, per jurisdiction?** Who can answer: a
   primary source, not a person. The model WHS Act sections on notifiable
   incidents, as enacted in each state, plus New Zealand's Health and Safety at
   Work Act and its regulations. Each needs its own entry with the regulator
   named, the trigger, the timeframe and the scene-preservation duty. Until each
   is read from the regulator's own publication and dated, none of them may be
   written. **Unverified today, and that is the honest status.**
2. **One entry per state, or one per duty with state variations?** Who can
   answer: whoever writes the spec, guided by how the entries actually differ
   once read. Worth deciding after the sources are read, not before.
3. **Does the record belong in the authority catalogue at all?** Who can answer:
   the owner. Every other template there is signed by a client authorising
   something. Nobody authorises an incident. The underlying model fits — it is a
   template that generates an instance against a job and collects signatures —
   but the naming would mislead.
4. **What happens on a job whose country was never recorded?** Who can answer:
   the owner. For every other document, "we cannot tell you" is an acceptable
   answer. For this one it may not be, and the alternative is refusing to
   generate the document at all.

## Evidence

Found while building the section 9.3 documents on 2026-09-02. The catalogue and
provenance work for the Asbestos Assessment Authority and Silica Risk Control
Plan is complete; this document was the next one on the list and stopped at the
first step, when the registry was searched for a notification duty and held
none. The `detectJurisdiction()` fallback was read directly from
`safework-notification-gate.ts` in the same session.

`REGULATOR_MAP`, the 24-hour deadline and `detectJurisdiction()` were read
directly from `lib/compliance/safework-notification-gate.ts`, not inferred from
comments elsewhere — an earlier draft of this file described the New Zealand
routing as broken on the strength of a comment in another module, and the code
said otherwise.

This is one person's reading of the code, not a customer report or an incident.
No contractor has yet asked for this document and been told it does not exist —
so far as anyone here knows.
