# Phase-B S500 Section-Citation Verification — Synthesis Report

**Date:** 2026-06-30
**Scope:** ANSI/IICRC S500:2021 section-citation accuracy across RestoreAssist report/assessment/AI code paths
**Standard map basis:** S500:2021 section taxonomy (see "Reference map" below)

---

## Summary

A Phase-B verification pass cross-checked every inline `S500`/`IICRC S500` section citation in the
codebase against the authoritative S500:2021 section map. **74 citations were CONFIRMED WRONG** across
**9 files**. After deduplication by *(concept, current § → proposed §)*, these collapse to **45 distinct
concept fixes**.

- **Confirmed-wrong citations:** 74
- **High-confidence (safe to apply):** 55 citations / 32 distinct fixes
- **Medium/low-confidence (needs sign-off):** 19 citations / 13 distinct fixes
- **Files affected:** `lib/nir-standards-mapping.ts`, `lib/generate-forensic-report-pdf.ts`,
  `lib/generate-iicrc-report-pdf.ts`, `lib/reports/clause-descriptions.ts`,
  `lib/export/scope-narrative.ts`, `lib/ai/adjuster-agent.ts`, `lib/assessments/domains/water.ts`,
  `lib/iicrc-checklists.ts`

### Dominant root-cause patterns

1. **Classification mis-homed.** Water *category* (1/2/3) and damage *class* (1–4) are repeatedly cited
   to §3 (Health Effects), §4 (Building/Material Science), §5 (Psychrometry), §7 (Antimicrobial), or §8
   (Safety) — but both are *determined* in **§10** (Inspections / Preliminary Determinations):
   category **§10.5**, class **§10.6**.
2. **§7 (Antimicrobial/biocide) used as a catch-all** for drying, water extraction, H&S, and electrical
   hazards. §7 is biocide technology only.
3. **§13 (HVAC Restoration) used as a catch-all** for general structural drying, dry-time, dry-standard,
   and porous-material removal. §13 is HVAC only.
4. **§14 (Contents/pack-out) used for structural drying & equipment.** Structural drying = §12; equipment
   selection = §6.
5. **Process vs. goal confusion.** §12 (the structural drying *process*) cited where the dry-*standard/goal*
   is meant — the goal lives at **§10.6.6** (science-level targets at **§5**).

---

## Reference map (S500:2021 sections used in verification)

| § | Topic |
|---|---|
| §3 | Health Effects from Exposure to Microbial Contamination |
| §4 | Building and Material Science |
| §5 | Psychrometry and Drying Technology (incl. drying-target science) |
| §6 | Equipment, Instruments, and Tools (dehus, air movers, AFDs/scrubbers, meters) |
| §7 | Antimicrobial (biocide) Technology — sanitisation / biocide application |
| §8 | Safety and Health (PPE, respiratory protection, worker/occupant hazards) |
| §9 | Administrative Procedures, Project Documentation, and Risk Management |
| §10 | Inspections, Preliminary Determinations (category **§10.5**, class **§10.6**, dry standard/goal **§10.6.6**) |
| §11 | Limitations, Complexities, Complications, Conflicts |
| §12 | Structural Restoration (containment, engineering controls, structural drying ~§12.4–12.5) |
| §13 | HVAC Restoration |
| §14 | Contents Evaluation, Restoration, and Remediation (personal property / pack-out) |
| §15 | Large or Catastrophic Restoration Projects |
| §16 | Materials and Assemblies (restorability by assembly type) |

---

## Per-concept fix table

Grouped by *(concept · current § → proposed §)*. **Confidence shown is the lowest seen across occurrences.**

| # | Concept | From § | To § | Occ. | Conf. | Evidence (file:line) |
|---|---------|--------|------|------|-------|----------------------|
| A1 | Water category classification | §7.1–7.3 | §10.5 | 1 | high | nir-standards-mapping.ts:61 |
| A2 | Water-category time-escalation (Cat1→Cat2 @48h) | §7.1 | §10.5 | 1 | high | nir-standards-mapping.ts:84 |
| A3 | Water Category 1/2/3 definition | §3.2–3.4 | §10.5 | 3 | high | generate-iicrc-report-pdf.ts:83-85 |
| A4 | Water category | §4.1 | §10.5 | 3 | high | adjuster-agent.ts:9,55,64 |
| B1 | Water damage classification (category+class header) | §3,§7.1 | §10 | 2 | high | generate-iicrc-report-pdf.ts:7,477 |
| C1 | Water Class 1–4 classification | §8.1–8.4 | §10.6 | 1 | high | nir-standards-mapping.ts:96 |
| C2 | Damage Class 1–4 | §7.1.1–7.1.4 | §10.6 | 4 | high | generate-iicrc-report-pdf.ts:89-92 |
| C3 | Water class | §5.1 | §10.6 | 3 | high | adjuster-agent.ts:9,55,64 |
| D1 | Moisture readings | §8 | §10 | 3 | medium | generate-iicrc-report-pdf.ts:9,574,577 |
| D2 | Inspect for hidden saturation/moisture | §5.2.4 | §10 | 1 | medium | iicrc-checklists.ts:415 |
| D3 | Moisture-content thresholds per material (dry standard) | §12.3 | §10 | 1 | medium | nir-standards-mapping.ts:28 |
| E1 | Drying goal / target-MC reference | §12 | §10.6.6 | 3 | medium | generate-iicrc-report-pdf.ts:13,635,822 |
| E2 | Material-specific drying-goal targets (timber/gypsum/concrete) | §12.3.x | §10.6.6 | 4 | medium | generate-iicrc-report-pdf.ts:825-828 |
| E3 | Drying endpoint / material-specific dry standard | §13 | §10.6.6 | 3 | high | water.ts:212,213,248 |
| E4 | Daily moisture monitoring / drying verification | §11.4 | §10.6.6 | 1 | high | iicrc-checklists.ts:63 |
| F1 | RH drying target from ambient outdoor RH | §12.4 | §5 | 1 | medium | nir-standards-mapping.ts:47 |
| F2 | Psychrometric data (temp/RH/dew point/GPP) | §6 | §5 | 1 | high | generate-iicrc-report-pdf.ts:11 |
| F3 | Interior RH / indoor-temp drying conditions | §6.2.1–6.2.2 | §5 | 2 | high | generate-iicrc-report-pdf.ts:829,830 |
| F4 | Drying / drying-targets (science) | §7.1 | §5 | 5 | high | adjuster-agent.ts:9,55,64,173,215 |
| G1 | Structural-drying maintenance | §14 | §12.5 | 1 | high | generate-forensic-report-pdf.ts:2156 |
| G2 | Air movers for evaporative drying | §8.3 | §12.5 | 1 | high | iicrc-checklists.ts:56 |
| G3 | Estimated drying days / dry-time | §13 | §12 | 2 | high | water.ts:87,236 |
| G4 | General drying/restoration scope (catch-all / fallback) | §13 | §12 | 2 | high | water.ts:225,341 |
| G5 | Water extraction (bulk water removal) | §7.1 | §12 | 1 | high | iicrc-checklists.ts:49 |
| H1 | Structural-drying equipment adequacy (selection/sizing) | §14 | §6 | 1 | high | nir-standards-mapping.ts:130 |
| H2 | Equipment deployment log | §14 | §6 | 1 | high | generate-iicrc-report-pdf.ts:10 |
| H3 | Drying equipment selection (dehus/air movers/AFDs) | §8.3 | §6 | 1 | high | scope-narrative.ts:102 |
| H4 | HEPA air scrubber (AFD) deployment | §9.3 | §6 | 1 | low | iicrc-checklists.ts:228 |
| I1 | Controlled removal/disposal of porous under containment | §13.5.6 | §12 | 2 | medium | generate-forensic-report-pdf.ts:2136,2181 |
| I2 | Remove non-salvageable porous materials | §9.2 | §12 | 1 | medium | iicrc-checklists.ts:137 |
| I3 | Remove/dispose porous materials (Cat3) | §10.6.3 | §12 | 1 | medium | iicrc-checklists.ts:466 |
| J1 | Establish containment barriers | §9.3 | §12 | 1 | high | iicrc-checklists.ts:221 |
| J2 | Erect containment + negative-air ventilation | §10.6 | §12 | 1 | high | iicrc-checklists.ts:450 |
| K1 | Porous-material remediation requirements by [restorability] type | §13.5.6 | §16 | 1 | medium | clause-descriptions.ts:20 |
| L1 | Apply EPA-registered antimicrobial agent | §9.1 | §7 | 1 | high | iicrc-checklists.ts:130 |
| L2 | Apply antimicrobial to ingress-contact surfaces | §12.2 | §7 | 1 | high | iicrc-checklists.ts:423 |
| L3 | Apply hospital-grade disinfectant (Cat3 sanitisation) | §12.4 | §7 | 1 | high | iicrc-checklists.ts:474 |
| M1 | Photo documentation standard | §5.3 | §9 | 1 | high | nir-standards-mapping.ts:141 |
| M2 | Documentation requirements / records | §8 | §9 | 2 | high | adjuster-agent.ts:55,64 |
| M3 | Photograph & document affected areas | §4.2 | §9 | 1 | high | iicrc-checklists.ts:70 |
| N1 | General H&S obligations for restorers | §7.1 | §8 | 2 | medium | generate-forensic-report-pdf.ts:1660; clause-descriptions.ts:12 |
| N2 | Electrical-hazard management during water intrusion | §7.3 | §8 | 1 | high | clause-descriptions.ts:13 |
| N3 | Document technician PPE usage | §5.1 | §8 | 1 | high | iicrc-checklists.ts:145 |
| O1 | HVAC hygiene / restoration protocol | §15 | §13 | 1 | high | generate-forensic-report-pdf.ts:2194 |
| P1 | Post-remediation swab/ATP clearance verification | §13 | §12 | 1 | low | iicrc-checklists.ts:482 |

---

## HIGH-CONFIDENCE — safe to apply

These 32 distinct fixes (55 citations) are unambiguous: the current section is provably the wrong topic
and the target section is the clear home for the concept. Safe to apply mechanically.

| # | Concept | From § → To § | Occ. | Files |
|---|---------|---------------|------|-------|
| A1 | Water category classification | §7.1–7.3 → §10.5 | 1 | nir-standards-mapping.ts:61 |
| A2 | Water-category time-escalation | §7.1 → §10.5 | 1 | nir-standards-mapping.ts:84 |
| A3 | Water Category 1/2/3 definition | §3.2–3.4 → §10.5 | 3 | generate-iicrc-report-pdf.ts:83-85 |
| A4 | Water category | §4.1 → §10.5 | 3 | adjuster-agent.ts:9,55,64 |
| B1 | Water damage classification header | §3,§7.1 → §10 | 2 | generate-iicrc-report-pdf.ts:7,477 |
| C1 | Water Class 1–4 classification | §8.1–8.4 → §10.6 | 1 | nir-standards-mapping.ts:96 |
| C2 | Damage Class 1–4 | §7.1.1–7.1.4 → §10.6 | 4 | generate-iicrc-report-pdf.ts:89-92 |
| C3 | Water class | §5.1 → §10.6 | 3 | adjuster-agent.ts:9,55,64 |
| E3 | Drying endpoint / dry standard | §13 → §10.6.6 | 3 | water.ts:212,213,248 |
| E4 | Daily moisture monitoring / drying verification | §11.4 → §10.6.6 | 1 | iicrc-checklists.ts:63 |
| F2 | Psychrometric data | §6 → §5 | 1 | generate-iicrc-report-pdf.ts:11 |
| F3 | Interior RH / indoor-temp drying conditions | §6.2.1–6.2.2 → §5 | 2 | generate-iicrc-report-pdf.ts:829,830 |
| F4 | Drying / drying-targets (science) | §7.1 → §5 | 5 | adjuster-agent.ts:9,55,64,173,215 |
| G1 | Structural-drying maintenance | §14 → §12.5 | 1 | generate-forensic-report-pdf.ts:2156 |
| G2 | Air movers for evaporative drying | §8.3 → §12.5 | 1 | iicrc-checklists.ts:56 |
| G3 | Estimated drying days / dry-time | §13 → §12 | 2 | water.ts:87,236 |
| G4 | General drying/restoration scope (fallback) | §13 → §12 | 2 | water.ts:225,341 |
| G5 | Water extraction | §7.1 → §12 | 1 | iicrc-checklists.ts:49 |
| H1 | Structural-drying equipment adequacy | §14 → §6 | 1 | nir-standards-mapping.ts:130 |
| H2 | Equipment deployment log | §14 → §6 | 1 | generate-iicrc-report-pdf.ts:10 |
| H3 | Drying equipment selection (AFDs) | §8.3 → §6 | 1 | scope-narrative.ts:102 |
| J1 | Establish containment barriers | §9.3 → §12 | 1 | iicrc-checklists.ts:221 |
| J2 | Erect containment + negative-air | §10.6 → §12 | 1 | iicrc-checklists.ts:450 |
| L1 | Apply EPA antimicrobial agent | §9.1 → §7 | 1 | iicrc-checklists.ts:130 |
| L2 | Apply antimicrobial to surfaces | §12.2 → §7 | 1 | iicrc-checklists.ts:423 |
| L3 | Apply hospital-grade disinfectant (Cat3) | §12.4 → §7 | 1 | iicrc-checklists.ts:474 |
| M1 | Photo documentation standard | §5.3 → §9 | 1 | nir-standards-mapping.ts:141 |
| M2 | Documentation requirements | §8 → §9 | 2 | adjuster-agent.ts:55,64 |
| M3 | Photograph & document affected areas | §4.2 → §9 | 1 | iicrc-checklists.ts:70 |
| N2 | Electrical-hazard management | §7.3 → §8 | 1 | clause-descriptions.ts:13 |
| N3 | Document technician PPE usage | §5.1 → §8 | 1 | iicrc-checklists.ts:145 |
| O1 | HVAC hygiene / restoration protocol | §15 → §13 | 1 | generate-forensic-report-pdf.ts:2194 |

**Apply note:** the *current* section in every row above is a confirmed wrong topic — applying the fix
strictly improves accuracy even where a finer subsection might later be chosen.

---

## NEEDS EXPERT / OWNER SIGN-OFF (subsection precision or ambiguous home)

These 13 distinct fixes (19 citations) are still confirmed-wrong at the **current** section, but the
**proposed** target carries subsection imprecision or has a genuinely competing candidate. The wrongness
is real; the destination needs a human standard-holder to ratify before mechanical replacement.

| # | Concept | From § → To § | Occ. | Conf. | Open question for reviewer |
|---|---------|---------------|------|-------|---------------------------|
| D1 | Moisture readings / measurement | §8 → §10 | 3 | medium | Inspection (§10) vs meter spec (§6) for the "measurement" entry at line 577 |
| D2 | Inspect for hidden saturation | §5.2.4 → §10 | 1 | medium | Field hidden-moisture inspection = §10; confirm not a §5 science cross-ref |
| D3 | Moisture-content thresholds (dry standard) | §12.3 → §10 | 1 | medium | Threshold *definition* = §10/§10.6.6 vs monitoring during §12 |
| E1 | Drying goal / target-MC reference | §12 → §10.6.6 | 3 | medium | Goal endpoint §10.6.6 vs science targets §5 — pick canonical |
| E2 | Material-specific drying-goal targets | §12.3.x → §10.6.6 | 4 | medium | Same goal-vs-process call; confirm §10.6.6 over §5 |
| F1 | RH drying target from ambient RH | §12.4 → §5 | 1 | medium | Target-setting science §5 vs humidity-control activity §12.4 |
| H4 | HEPA air scrubber (AFD) deployment | §9.3 → §6 | 1 | low | AFD equipment §6 vs engineering control §12 — genuinely ambiguous |
| I1 | Controlled removal/disposal under containment | §13.5.6 → §12 | 2 | medium | Structural removal §12 vs restorability §16 |
| I2 | Remove non-salvageable porous materials | §9.2 → §12 | 1 | medium | §12 activity vs §16 restorability |
| I3 | Remove/dispose porous materials (Cat3) | §10.6.3 → §12 | 1 | medium | §12 activity vs §16 restorability |
| K1 | Porous-material remediation requirements by type | §13.5.6 → §16 | 1 | medium | §16 (restorability) vs §12 (removal activity) — opposite call to I-group |
| N1 | General H&S obligations for restorers | §7.1 → §8 | 2 | medium | §8 is clearly right topic; confirm no §9 risk-management overlap |
| P1 | Post-remediation swab/ATP clearance | §13 → §12 | 1 | low | No dedicated clearance section in map; §12 completion is best-available fit only |

**Reviewer flags:**
- **I-group vs K1 are inconsistent destinations.** Porous-material handling lands on §12 (removal activity)
  in I1/I2/I3 but on §16 (restorability classification) in K1. A standard-holder should reconcile whether
  "remediation requirements by category" is a §12 or §16 concept and apply one rule.
- **E-group "goal vs process"** (§10.6.6 vs §5) should be ruled once and applied to D3/E1/E2/F1 together.
- **P1 / H4** have no clean home in the section map; consider leaving as-is with a `// TODO: confirm §`
  marker rather than forcing §12/§6.

---

## Methodology & caveats

- Source of truth is the supplied S500:2021 section map; no page-level S500 text was consulted in this
  pass, so subsection numerals (e.g. §10.6.6, §12.5) are *best-fit* against the map's hints, not verified
  against the printed standard.
- "Confirmed wrong" means the **current** cited section is provably the wrong S500 topic. Confidence
  grades the **proposed** replacement, not the wrongness of the original.
- Conservative rule applied: any fix whose lowest occurrence confidence is below `high` is routed to the
  sign-off section, never the safe-to-apply list.
