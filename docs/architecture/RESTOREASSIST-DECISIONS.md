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

### D-012 — Water Category/Class, loss timeline, safety record, and disposal authority are required canonical datums

- **Decision:** V1 captures, as canonical `Inspection`/`Hazard`/`AuthorityFormInstance` data: water Category (S500 Cat 1/2/3) and Class (1–4) with citation; loss timeline (cause, date of loss, date notified, first-attendance); a signed pre-work safety record (SWMS/JSA); typed hazards (ACM/electrical/structural/biological) with WHS pathway; and authority-to-dispose gating any contents/strip-out disposal.
- **Reason:** Review B (restoration operations) found these load-bearing for operating and defending a water claim years later — classification drives PPE/containment/strip-out and equipment sizing; the loss timeline governs coverage and the mitigation duty; the safety record is the WHS defence; disposal authority prevents the most common post-job dispute.
- **Alternatives:** derive classification at report time (rejected — not a record); free-text incident (rejected — undefensible).
- **Consequences:** new §8 rows; §10/§12 required fields; §16 disposal gate; §25 water-pack baseline; seeded claim (§39) exercises all.
- **Evidence:** Review B M1–M4. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-013 — Closure financial precondition

- **Decision:** Closure requires an invoice that exists and is **reconciled** (issued with a balancing payment ledger); **full payment is not required to close by default** and is an organisation-configurable precondition.
- **Reason:** Review A (engineering ambiguity) M2 — `invoice_paid`-gates-closure was undefined; a wrong guess either blocks trivial-balance closures or closes with money owed.
- **Evidence:** Review A M2; traceability §E.9. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-014 — Xero is the V1 exit-gate accounting provider

- **Decision:** The seeded reference claim (§39) reconciles against **Xero**; QBO/MYOB remain supported but are not required for the V1 exit gate.
- **Reason:** Review A M3 — §39 is a hard gate and needs a named, deterministic provider; Xero is the most complete existing integration (dry-run C).
- **Evidence:** Review A M3. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-015 — Scheduling competency is an RA-local tag in V1

- **Decision:** "Required competency" is an RA-local skill/role tag on technician + appointment; CARSI-credential-gated dispatch is V1.x.
- **Reason:** Review A M4 — competency had no data model; a CARSI lookup would add a cross-system dependency V1 does not otherwise build; keeps §27 CARSI boundary clean.
- **Evidence:** Review A M4. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-016 — Completeness output is advisory; state machines authored

- **Decision:** The completeness projection is advisory (its `blockingRequirements` informs the human; enforcement lives in the §9 state machines and §23 closure gate). The per-machine state-transition tables §9 promised are authored in traceability §E. The water-damage rule _content_ carries the same scaffold latitude as drying thresholds.
- **Reason:** Review A M1 (absent state tables — the headline) and M5 (completeness enumeration/scaffold asymmetry).
- **Evidence:** Review A M1, M5; traceability §E. **Date:** 2026-07-17. **Owner:** Phill McGurk.

---

### D-017 — Retention is a matrix, not a universal period

- **Decision:** Retention is governed by a matrix (record category × claim type × jurisdiction × contractual/insurer/tax/employment/privacy obligation × litigation-hold/active-dispute), separately addressing claim records, reports, photographs, moisture readings, sketches, communications, contracts, estimates, invoices, payments, tax records, employee records, safety records, AI prompts/outputs, audit logs, portal records, deleted accounts, and backups. No universal "6–7 year" period is encoded. Until the matrix is formally approved with AU legal + privacy review, no automated destruction of claim evidence occurs; preservation/litigation holds are supported; account closure preserves legally relevant records; inactive/archived/restricted/deleted states stay distinct.
- **Reason:** Founder correction (2026-07-17) — a single hardcoded period is legally wrong across record types and jurisdictions.
- **Evidence:** founder addendum §8; spec §31, Appendix C §C-8. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-018 — Continuous Implementation Protocol governance

- **Decision:** The controlling implementation protocol (spec Appendix C) is (1) timeless — it embeds no specific PR numbers; operational artefacts like the interim closure-safeguard PR and the spec-consolidation PR live here in the decision log and in traceability, not in the protocol; (2) tool-agnostic — the `/goal start|status|pause|stop|reconcile` commands are project workflow conventions, not native CLI/agent features, and any tooling may implement them provided the behavioural intent is preserved; (3) adaptive — backlog priority and dependencies are re-evaluated after each completed workstream; (4) release-gated — _implementation complete_ is not _release ready_: production release requires a formal readiness review (security, migrations, rollback, founder approval); (5) single-source — no feature may introduce a second editable source of truth; the domain model is extended and reused only.
- **Reason:** Founder tightenings (2026-07-17) to keep the protocol clean, tool-agnostic, and safe.
- **Operational artefacts (kept out of the protocol body):** the interim closure-safeguard PR is #1967 (temporary defence-in-depth, unmerged); the spec-consolidation PR is #1968.
- **Evidence:** founder addendum §11; spec Appendix C. **Date:** 2026-07-17. **Owner:** Phill McGurk.

### D-019 — Job Story Spine is a projection, not an authority

- **Decision:** The Job Story Spine renders state derived from the unified claim/progress model. It authors no lifecycle state and creates no independent closure gate.
- **Reason:** RestoreAssist already has multiple domain lifecycles. A fifth writable lifecycle would create contradictions rather than continuity.
- **Alternatives:** a standalone spine state machine (rejected — duplicate authority); derive from one existing lifecycle before P1-7 (rejected — incomplete representation).
- **Consequences:** Job Overview, Field Capture and Consumer Overview spine screens depend on P1-7; projections must expose source facts and freshness.
- **Evidence:** `RESTOREASSIST-JOB-CONTINUITY-RECONCILIATION.md` §3.1 and §9. **Date:** 2026-08-28. **Owner:** Phill McGurk.

### D-020 — Continuity findings extend the single completeness engine

- **Decision:** Continuity findings are advisory output of the single deterministic completeness engine. Information and advisory findings are surfaced directly; required and critical outcomes are expressed by authored state-machine guards and the closure gate.
- **Reason:** This preserves D-004 and D-016 and prevents a competing rules engine from silently becoming a new compliance authority.
- **Alternatives:** a separate Continuity Check Engine (rejected — duplicate rules and enforcement ambiguity).
- **Consequences:** The Job Continuity checks land as rules within P4-3 and cross-job triage consumes those same findings.
- **Evidence:** `RESTOREASSIST-JOB-CONTINUITY-RECONCILIATION.md` §3.3 and §9. **Date:** 2026-08-28. **Owner:** Phill McGurk.

### D-021 — Organisation locale is the tenant authority

- **Decision:** `Organization.country` is the authoritative source for business identifier, currency, GST treatment, date format and default timezone. Per-record locale fields are derived or explicit snapshots; they never override the organisation implicitly.
- **Reason:** RestoreAssist serves Australia and New Zealand. Locale inferred from an individual sketch, address string or hardcoded GST constant can produce incorrect commercial and consumer output.
- **Alternatives:** infer locale per workflow (rejected — inconsistent); AU defaults with NZ exceptions (rejected — NZ becomes a second-class path).
- **Consequences:** setup captures AU/NZ country, jurisdiction-appropriate business identifier and timezone; GST callers converge on `getGstTreatment()`.
- **Evidence:** `RESTOREASSIST-JOB-CONTINUITY-RECONCILIATION.md` §5 and §9. **Date:** 2026-08-28. **Owner:** Phill McGurk.

---

### D-022 — Funded trial may use the platform Anthropic key (RA-6801)

- **Decision:** An in-date `TRIAL` account with `creditsRemaining >= 1` and a configured platform `ANTHROPIC_API_KEY` may generate reports without a workspace BYOK key. BYOK remains the optional upgrade path. `ACTIVE` / `CANCELED` / `PAST_DUE` / expired / zero-credit accounts must not receive that key.
- **Reason:** Founder choice on RA-6801 (2026-09-13): a stranger who starts a free trial must complete signup → first report without pasting a personal API key. D-006's silent-fallback ban still holds for paid workspaces.
- **Alternatives:** pre-signup BYOK disclosure only (rejected — leaves the trial non-working); copy the platform key into `ProviderConnection` (rejected — secret duplication).
- **Consequences:** `lib/ai/platform-trial-credential.ts` is the single predicate. Onboarding, check-credits, setup `byok_keys`, and `resolveWorkspaceAiKey` consume it. Report-gen routes keep calling `resolveWorkspaceAiKey`.
- **Evidence:** RA-6801 SPM walk 2026-09-13; founder AUTO option 1. **Date:** 2026-09-13. **Owner:** Phill McGurk.

---

### D-023 — One sharing rule owns who reaches a record, and lists compose it with AND (RA-7582)

- **Status:** Extends the rule already implemented and tested in `lib/auth/assert-tenancy.ts` (RA-1709 / P0-5). Adoption alone was not enough — see the reach split below.
- **Decision:** **Reach is resolved separately for reading and for writing.** A caller may *read* a record when they own it, OR are an `ACTIVE` member of its workspace, OR its owner belongs to the same organisation — where "same organisation" requires the caller's own `organizationId` to be non-null, and applies at **every** role, not only `ADMIN`. A caller may *write* a record only when they own it, are an `ACTIVE` member of its workspace, or are a tenant `ADMIN` widened to their own organisation — the pre-existing write rule, unchanged. Only a platform-support operator allowlisted by stable `User.id` (`PLATFORM_SUPPORT_USER_IDS`) crosses tenants, for either. `lib/auth/assert-tenancy.ts` remains the sole owner of this rule. Read-by-id paths call an `assert*Tenancy` helper; list paths call a `resolve*Reach` helper and merge the returned filter with **`AND`**, never by assigning `OR`.
- **Reason:** RA-7582 — `inspections`, `reports`, `clients` and `invoices` each hardcoded `{ userId: session.user.id }`, so a second user in the same business saw an empty product and the owner never saw the technician's work. The rule existed and was enforced on detail routes, but simply adopting it would have fixed only the owner's half: `resolveTenantScope` widened to the organisation only for `role === "ADMIN"` (`lib/auth/assert-tenancy.ts:92`), while invited team members are assigned `MANAGER` or `USER` and never `ADMIN` (`app/api/invites/[token]/route.ts:43`, `:578-579`). A technician would still have seen an empty product, because the one clause that could have saved them — active workspace membership — matches almost nothing while `workspaceId` goes unwritten on create. Splitting read reach from write reach delivers the rule the ticket asked for: everyone in the business sees the business's work; role still decides what they may change.
- **Alternatives:** Scope by the `workspaceId` column on each model (rejected — it is nullable and is not written by the create paths, so scoping by it would match only rows whose workspace is null). Give every user their whole organisation unconditionally (rejected — a null `organizationId` would collapse every solo operator into one shared tenant; `resolveTenantScope` already refuses this at `lib/auth/assert-tenancy.ts:96-100`). Add a Prisma `$extends` tenancy middleware (rejected for now — it hides the filter from the route that must justify it, and `lib/prisma.ts` is deliberately 72 lines with no middleware).
- **Consequences:** `resolveInspectionReach` gains siblings for `Client`, `Invoice` and `Report`. The four list endpoints and their read-by-id, update and delete siblings consume them. **Composition is `AND`, never `OR`.** The search filters on inspections, clients and invoices assign `where.OR = [...]` directly (`app/api/inspections/route.ts:164`, `clients/route.ts:38`, `invoices/route.ts:36`); a tenancy filter expressed as `OR` would be silently overwritten by that assignment and the endpoint would return other tenants' rows. Widening reach from one user to an organisation also widens every list's result set, so the `take` limit required by RULES.md rule 4 is load-bearing, not cosmetic.
- **Evidence:** RA-7582; `lib/auth/assert-tenancy.ts:39-49` (scope kinds), `:96-100` (null-organisation guard), `:107-119` (ownership clauses), `:220-232` (`resolveInspectionReach`); `app/api/inspections/route.ts:151`; `docs/session-handoffs/audits-20260920/audit-1-crm.md` §3. **Date:** 2026-09-20. **Owner:** Phill McGurk.

---

### D-024 — Live trial-reminder cron is GitHub Actions against restoreassist.app (RA-7597)

- **Decision:** Production day-3 / last-chance trial-reminder emails are scheduled by `.github/workflows/cron-production-trial-reminders.yml`, which GETs `https://restoreassist.app/api/cron/trial-reminders` with `CRON_SECRET`. They are not scheduled as DigitalOcean App Platform `jobs`.
- **Reason:** `vercel.json` crons run only on the Vercel project (sandbox database). The reviewed `.do/app.yaml` is a single `web` service; `digitalocean-production-release.py` `validate_app_identity` refuses any `jobs` / `workers` group, so adding a DO scheduler would break the release contract and is not a $0 change. GitHub Actions already reaches the live host (`smoke-prod.yml`, `trigger-ascora-sync.yml`).
- **Alternatives:** DO scheduled job in `.do/app.yaml` (rejected — release contract + extra App Platform component); in-process timer on the web service (rejected — restarts duplicate work, no durable audit); leave Vercel-only (rejected — production never emails).
- **Consequences:** Welcome emails and the founder sign-up alert stay on the sign-up request path and are unchanged. Manual dispatch defaults to a local dry-run that does not hit production — the current live route ignores `?dryRun=1` and would send. After this SHA is serving restoreassist.app, `probe_production=true` queries candidates without sending or writing `CronJobRun`. The production `CRON_SECRET` must exist as a repo Actions secret, the same requirement as `trigger-ascora-sync.yml`.
- **Evidence:** RA-7597; `scripts/ci/digitalocean-production-release.py` `validate_app_identity`. **Date:** 2026-09-21. **Owner:** Phill McGurk.

---

### D-025 — Billing filters allow-list `operator_measured` (missing tag still bills); decompose default stays (RA-7611)

- **Decision:** `measuredSketchData()`, `roomsFromSavedGraph` (`lib/sketch-estimate-extractor.ts`) and `isMeasuredRoom` share `isOperatorMeasuredProvenance`. That predicate is true for `operator_measured` **and** for a missing tag (`undefined` / `null` / `""`). Any *explicit* value other than `operator_measured` (`ai_suggested`, `underlay_reference`, unknown tags) does not bill. A new `ai_suggested` tier lands Vision/cloud-AI rooms; Confirm (optional dimension correction) promotes them to `operator_measured` and stores confirmation on `SketchRoom`, not `SketchElement`. `lib/sketch/decompose-elements.ts` still defaults a missing provenance tag to `operator_measured` — that default is **not** changed in RA-7611. On sketch save, unconfirmed → confirmed stamps `confirmedBy` from the session user id and `confirmedAt` from server time; client-supplied values for both are ignored.
- **Reason:** Founder decision 2026-09-21 on RA-7611. The three filters were deny-lists that excluded only `underlay_reference`, so AI geometry could bill. A strict `=== "operator_measured"` allow-list then dropped legacy untagged rooms (SketchEditor polygons with no `data`, pre-RA-6760 V2 import) and silently lost them on PDF/scope routes that use `serverAuthoritativeFloors` with no saved-graph fallback. Changing the decompose default would silently re-tag every existing sketch that has no provenance on its Fabric objects; that needs a fixture of production data before it is safe.
- **Alternatives:** keep the deny-list and add `ai_suggested` to it (rejected — any future tag would bill); change the decompose default in the same PR (rejected — existing untagged sketches would flip meaning without a data survey); treat missing tags as non-measured (rejected — regresses technician-drawn rooms that have always billed).
- **Consequences:** Untagged Fabric objects still pass the three billing filters, matching pre-RA-7611 behaviour. Vision import writes `ai_suggested` + `captureAdapter: "cloud_ai"`. RoomPlan stays `underlay_reference` until Confirm. Provenance legend counts must use the same predicate so untagged rooms appear as hand-drawn, not "reference only".
- **Evidence:** RA-7611; founder comment 2026-09-21; independent review of #2265 (P0 missing-tag). **Date:** 2026-09-21. **Owner:** Phill McGurk.

---

### D-026 — Photo AI accept/reject is `ai_suggested`; ACM may raise the WHS gate and may never clear it (RA-7613)

- **Decision:** `auto-classify-photo` results stay suggestions until a technician accepts them. Accepted labels persist as `ai_suggested` on `InspectionPhoto.metadata.photoAi` (existing JSON column — no schema change) and produce zero billable quantities until Confirm promotes provenance to `operator_measured` (RA-7611 allow-list). A classification that includes `ASBESTOS_SUSPECT` raises the existing WHS strip-out gate (`evaluateWhsGate`). AI output can raise that latch and cannot clear it, including a later no-ACM classification; only a person recording a WHS pathway clears the block. Voice transcripts map onto ANZ material slugs, `cat1|cat2|cat3`, and numeric dimensions by exact catalog match; unmatched terms are shown for confirmation and never guessed.
- **Reason:** Photo AI and voice notes currently never become job data (zero UI callers for auto-classify; no voice-to-fields mapper). Letting AI write measured quantities or clear a suspected-ACM flag would bill unconfirmed geometry and silently drop a safety gate.
- **Alternatives:** copy classifier JSON straight into labelled columns as measured (rejected — RA-7611); let a later no-ACM vision run clear the gate (rejected — AI must not undo a safety raise); fuzzy-match voice materials (rejected — guessed slugs become job data).
- **Consequences:** Classify is propose; accept writes `ai_suggested` job fields; Confirm is the person. Evidence submission is never blocked (RA-7076). Strip-out stays blocked until a recorded WHS pathway.
- **Evidence:** RA-7613; RA-7611 D-025; RA-7035 propose→confirm; RA-7076 flags-never-block. **Date:** 2026-09-21. **Owner:** Phill McGurk.

---

_Non-blocking owner inputs still open (do not block V1 start): authorised drying-goal methodology source; the full per-stage water-damage completeness rule list (baseline minimum is specified; engine scaffolds now); per-organisation completeness baseline content; the approved retention matrix (D-017 — legal/privacy review before any automated destruction); pilot-partner selection. Tracked here, not escalated._
