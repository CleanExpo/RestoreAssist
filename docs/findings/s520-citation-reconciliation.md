# Finding: S520:2024 section citations are systemically mis-numbered (licence-critical)

**Discovered:** 2026-07-11, while verifying the scoped `ppe-requirements.ts §14` citation.
**Severity:** High — RA-7000 grounds Margot's answers and generated reports in these citations; wrong section numbers undermine the licensed-standard grounding.
**Status of the scoped item:** RESOLVED (see below). The broader reconciliation is an OPEN follow-up.

## Authoritative S520:2024 (4th ed.) chapter map
Verified from the owner's **licensed S520:2024, as ingested into the RA-7000 authoritative RAG corpus** (`IicrcChunk`, prod Supabase `udooysjajglluvuxkijp`), 2026-07-11. Now codified in `lib/standards/s520-sections.ts`:

| § | Title |
|---|---|
| 1 | Principles of Mold Remediation |
| 2 | Mold Cleaners, Antimicrobial Chemicals, and Coatings as Remediation Tools |
| 3 | Building and Material Science |
| 4 | Remediator Qualifications |
| **5** | **Safety and Health** (worker protection / PPE) |
| 6 | Administrative Procedures, Documentation and Risk Management |
| 7 | Inspection and Preliminary Determination |
| 8 | Limitations, Complexities, Complications, and Conflicts |
| 9 | Structural Remediation |
| 10 | HVAC Remediation |
| 11 | Contents Remediation |
| **12** | **Post Remediation Verification** (clearance) |
| 13 | Indoor Environmental Professional |

**There is no §14.** The standard ends at §13 (plus references/appendices).

## What was FIXED (scoped item)
- `lib/restoration/ppe-requirements.ts` — worker-protection citation `§14` → **`§5 (Safety and Health)`**.
- `lib/restoration/claim-recommendations.ts` — `§14 (worker & occupant protection)` → **`§5 (Safety and Health)`**.
- Added `lib/standards/s520-sections.ts` (authoritative map) + `__tests__/s520-sections.test.ts`.

## What is STILL WRONG (open — needs a dedicated verified pass)
The following citations disagree with the authoritative map and should be reconciled. Each needs the correct chapter/subsection confirmed against the licensed per-chapter S520 text before editing (do NOT guess subsection numbers):

- `lib/iicrc-checklists.ts` — `§14.1/.2/.3` used for post-remediation verification/clearance/documentation → the clearance chapter is **§12 (Post Remediation Verification)**; confirm the exact §12.x subsections.
- `lib/equipment-calculator-mould.ts` — `§12`/`§12.3`/`§12.4` used for **containment / negative-air / air-scrubbing**, but §12 is *Post Remediation Verification*. Containment sits under structural remediation (§9) / safety (§5). Reconcile.
- `lib/nir-standards-mapping.ts` — `§6` used for "assessment and classification of mould conditions", but §6 is *Administrative Procedures*; assessment is **§7 (Inspection and Preliminary Determination)**. `§8.1` used for "source identification", `§9` for "clearance testing" — both disagree with the map.
- `lib/iicrc-checklists.ts` — `§7.1/.2/.3` used for surface cleaning / material removal / biocide, and `§8` for "post-remediation testing"; §7 is *Inspection*, §8 is *Limitations*, §9 is *Structural Remediation*. Reconcile.
- Cross-check every remaining `S520:2024 §…` string against `S520_SECTIONS`.

## Recommended follow-up
1. Obtain the licensed per-chapter S520:2024 PDFs (as was done for S500 §7/§8/§9/§10/§12/§13) to populate subsection titles in `s520-sections.ts`.
2. Route all S520 citations through `getS520Section()` so a wrong number returns `null` (fails loudly) instead of shipping a fabricated citation — the same pattern S500 uses.
3. Add a guard/test asserting no `S520:2024 §…` literal cites a section absent from `S520_SECTIONS`.
