# Hard Floor add-on — v1 (domain logic)

**Feature flag:** `addon_hardfloor` · **Code:** `lib/hardfloor/`

## What it is

A paid add-on for companies that specialise in hard floors (tile and stone,
vinyl and linoleum, coated timber). It is a guided 10-step testing walkthrough
on one persistent client record:

1. Intake → 2. Inspect → 3. Test → 4. Report → 5. Scope → 6. Estimate →
7. Quote (three options) → 8. Do the job → 9. Handover → 10. Maintain

A maintenance visit loops back to step 2 on the same record, keeping every
earlier visit. The methods and limits come from the CARSI Hard Floor Care SOP
Cards v1 (CARSI Certified course, not an IICRC or ATFA certification).

## In this PR

| Module | Does |
| --- | --- |
| `sop-library.ts` | Per floor type: safe cleaning pH window, strip pH limit, allowed services, forbidden pads, asbestos risk |
| `gates.ts` | Asbestos gate (era from `lib/compliance/asbestos-era.ts`, or register/visual suspicion = presume; damaged = stop), Seal gate (latest floor pH 7–8), solution pH check |
| `walkthrough.ts` | 10 steps with required captures, guided tests by floor type, in-order completion, maintenance loop |
| `estimate.ts` | m² × organisation rate card, edges, furniture; GST via `lib/gst-rules.ts`; three-option quote |
| `maintenance.ts` | Next visit and restorative due dates; built-in default only for high traffic (6/12 months) |

## Not in this PR (follow-ups)

- **Persistence:** Prisma models for the client record, visits, captures and pH log. Needs a migration — owner-gated for production (RULES.md #29).
- **Routes and UI:** dashboard walkthrough screens, handover PDF and care sheets.
- **Billing:** an `AddonSku` entry in `lib/billing/addon-registry.ts`. Price is a founder decision.
- **Credential badge:** show the tech's CARSI Hard Floor level (L1–L3) from CARSI training records.
