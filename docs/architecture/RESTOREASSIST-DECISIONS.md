# RestoreAssist — Decision Log

Append-only record of resolved product and architecture decisions. New decisions during implementation are appended here in the same change set that alters behaviour (spec §44). Format: Decision · Reason · Alternatives · Consequences · Evidence · Date · Owner.

---

### D-001 — Organisation rate card is the canonical pricing source
- **Decision:** `OrganizationPricingConfig` (per-organisation rate card) is the sole editable pricing source. No production path uses hardcoded restoration prices.
- **Reason:** RestoreAssist prescribes no prices; each organisation owns its commercials. The `$50/line` hardcode and hardcoded wizard rates were defects (RA-V1-READINESS, dry-run C).
- **Alternatives:** platform-standard price book (rejected — not RA's role); per-estimate free entry (rejected — no reuse, error-prone).
- **Consequences:** ScopeItem rates populate from the rate card; estimates snapshot rate-card version; the two other pricing stacks retire.
- **Evidence:** RA-ARCH-03 rows 9–11; founder directive 2.5. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-002 — Approved estimate stores an immutable commercial snapshot
- **Decision:** Approving an estimate freezes rate-card version, rate, unit, quantity, tax treatment, description, adjustment, approver, timestamp. Invoices derive from the snapshot; later rate-card changes do not alter approved estimates.
- **Reason:** Commercial defensibility and capture-once; prevents retroactive price drift.
- **Alternatives:** live re-pricing at invoice time (rejected — non-defensible).
- **Consequences:** `Estimate`/`EstimateLineItem` canonical; `CostEstimate` retired.
- **Evidence:** RA-ARCH-03 row 10; founder 2.5. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-003 — Drying: immutable history, latest-valid-reading state
- **Decision:** Historical readings are immutable; current drying state = latest valid reading per monitoring point/material/assembly/room. Invalidation is a controlled, audited action that never deletes the source.
- **Reason:** Legal evidence integrity; the prior full-history evaluation made certification unachievable and the only workaround was deleting the legal log (RA-V1-READINESS drying defect).
- **Alternatives:** delete-superseded (rejected — destroys evidence); full-history evaluation (rejected — never certifies).
- **Consequences:** moisture write path sets baseline/monitoring flags; certify guard evaluates latest-valid-per-point; drying thresholds come from authorised methodology, never AI.
- **Evidence:** RA-V1-READINESS §MUST-FIX 1; dry-run B; founder 2.6. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-004 — Completeness is deterministic and stage-specific, not one percentage
- **Decision:** Completeness is computed deterministically per claim type, stage, jurisdiction, org policy, hazards, work done, approvals, and evidence; returns facts/missing/conditional/contradictions/risks/next-actions/blocking/human-decisions with rule sources. V1 ships the water-damage pack; architecture is claim-type-extensible.
- **Reason:** A single universal percentage is meaningless and unsafe across claim types; deterministic rules keep AI out of compliance authorship.
- **Alternatives:** one global % (rejected); LLM-authored completeness (rejected — non-deterministic, unauditable).
- **Consequences:** one engine (`lib/margot/completeness.ts`) unifies the three prior gap engines; org rules extend but never weaken platform baselines.
- **Evidence:** RA-ARCH-04 ADR-4; RA-ARCH-07 gap 1; founder 2.7. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-005 — Scheduling and dispatch are in V1 (minimum viable)
- **Decision:** Minimum scheduling is a V1 release blocker; advanced optimisation is V1.x. Resolves the prior differentiation-vs-readiness contradiction.
- **Reason:** Every job-management incumbent ships scheduling; without it RA loses deals at demo before the compliance moat is seen (RA-ARCH-06).
- **Alternatives:** defer to V1.x (rejected — deal-loser); full optimisation in V1 (rejected — scope blowout).
- **Consequences:** new appointment/assignment surface + audit; route/capacity optimisation deferred.
- **Evidence:** RA-ARCH-06 differentiation thesis; RA-ARCH-07 contradiction 1; founder 2.8. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-006 — BYOK four-plane cost boundary
- **Decision:** Customer-facing generative AI is BYOK; four planes (deterministic platform / RA-funded / customer-key / optional fallback) with prohibited silent fallback. Existing provider abstraction retained and assessed before replacement.
- **Reason:** "AI is BYOK" was ambiguous while house-key call sites served customer features; costs must never silently shift.
- **Alternatives:** bundle AI into tiers (rejected — not RA's model); all-house-funded (rejected — margin).
- **Consequences:** `workspace-byok-dispatch` is the single client-plane gateway; house-key customer-feature call sites migrate.
- **Evidence:** RA-ARCH-04 ADR-5; founder 2.4. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-007 — CARSI train / RestoreAssist guide boundary
- **Decision:** CARSI owns formal courses/assessments/credentials/CE records. RA offers contextual guidance, safety prompts, SOPs, links into entitled CARSI learning, and completion checks where commercially required. No LMS is built into RA; an RA subscription does not grant paid CARSI courses.
- **Reason:** Prevents scope creep into an LMS the founder explicitly excluded; resolves the earlier "is LMS gating missing" question — it is out of scope by design.
- **Alternatives:** embed an LMS (rejected). 
- **Consequences:** the Live Teacher asset is reframed as an operations coach (not a trainer), V1.x.
- **Evidence:** RA-INVENTORY LMS finding; RA-ARCH-07 contradiction 3; founder 2.3. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-008 — Report status distinguishes six facts; closure binds to real delivery
- **Decision:** Report state distinguishes generated/approved/sent/delivered/acknowledged/superseded. Closure's `report_sent` binds to a real delivery event, not user-settable `COMPLETED`.
- **Reason:** The overloaded `COMPLETED` let bulk-status spoof closure's delivery attestation into a hash-chained audit record (RA-ARCH-01 M2).
- **Alternatives:** keep single status (rejected — spoofable).
- **Consequences:** Draft PR #1967 is a temporary defence-in-depth fix pending the durable state-model change.
- **Evidence:** RA-ARCH-01 M2; RA-ARCH-02 C3; PR #1967. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-009 — Twin geometry canonical; Room models retired
- **Decision:** `ClaimSketch`/`SketchElement` (operator-measured provenance) is canonical for rooms/dimensions/area/volume; dormant `Room`/`RoomAnnotation` retire after a prod row-count check.
- **Reason:** Giving `Room` a writer would create a fourth geometry representation; the twin is the only one with provenance guards and e2e coverage.
- **Alternatives:** promote `Room` (rejected — new duplicate).
- **Consequences:** scope/equipment/PDF consume derived dims with a manual-override flag.
- **Evidence:** RA-ARCH-03 row 4; dry-run A dormant-Room finding. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-010 — Spec is the living source of truth; done means evidenced
- **Decision:** This spec is authoritative and kept current with implementation (§44); every completed backlog item requires named acceptance evidence, not "it compiles"; behaviour changes trigger a spec update + decision record.
- **Reason:** Founder reinforcement (2026-07-17) to prevent spec drift and false completion.
- **Evidence:** founder closing remarks. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-011 — Continuous Implementation Mode
- **Decision:** After both §13 reviews pass, implementation runs as a loop (top backlog item → implement → test → update docs → repeat) that pauses only on a real blocker; compile/merge are not completion.
- **Reason:** Founder request for momentum without drift.
- **Evidence:** founder closing remarks; spec Appendix B. **Date:** 2026-07-17. **Owner:** Phill McGurk.

---
*Non-blocking owner inputs still open (do not block V1 start): authorised drying-goal methodology source; per-organisation completeness baseline content; pilot-partner selection. Tracked here, not escalated.*
