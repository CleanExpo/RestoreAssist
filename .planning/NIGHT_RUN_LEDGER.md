# Night-run ledger — 25-item programme

Stage values: `TODO` → `DEFINED` → `PLANNED` → `BUILT` → `VERIFIED` → `REVIEWED` → `SHIPPED`,
or `BLOCKED (reason)`. The loop advances exactly one task by exactly one stage per iteration
and writes the result here. Grounded in the backlog document, the live Linear queue, and
defects found in the 2026-07-25 review wave.

**Founder-gated** items cannot be completed by any agent. They are listed so they are visible,
never so they look actionable.

## Wave 1 — Launch blockers

| # | Task | Source | Stage | Notes |
|---|---|---|---|---|
| 1 | Standards Currency Registry | backlog #6 | **REVISE — back to DEFINE** | Judge verdict: `.planning/specs/01-JUDGE-VERDICT-revise.md`. `nextRevisionExpected` is `year+5` arithmetic carrying zero information; the section index is a PARTIAL ToC so "unresolvable" proves nothing; `pnpm check:standards` already exists and the spec never mentioned it. Rescoped to extending `citation-validity.ts` and hardening the AI report citation path. No code until the spec is rewritten. |
| 2 | ABR production credential | RA-6678 (P0) | BLOCKED | **Founder-gated.** `ABR_API_GUID` unset in prod; every ABN lookup returns MALFORMED. Agent scope limited to a health check + graceful degradation. |
| 3 | Email DNS completion | RA-6955 | BLOCKED | **Founder-gated.** Root domain has no SPF/DKIM; Resend rejects sends. |
| 4 | Sandbox release-gate repair | RA-5624 | TODO | Sandbox health `degraded`; release-gate smoke cannot certify. |
| 5 | Go-live scorecard refresh | RA-6999 | TODO | Rebuild the 100/100 tracker against post-merge reality (~55–60/100 at last count). |
| 6 | Evidence ledger burn-down | RA-6909 | TODO | 194 Done tickets with zero merge evidence; parallel `Explore` sub-agents batch the verification. |

## Wave 2 — Product moat

| # | Task | Source | Stage | Notes |
|---|---|---|---|---|
| 7 | Customer Portal Explainer Hub v1 | backlog #4 | TODO | The identified wedge vs Encircle/DocuSketch/ServiceM8/Ascora. |
| 8 | Restoration Pulse epic | RA-6948 | TODO | Judge scored 84/100; AFCA complaint data is genuine whitespace. |
| 9 | Offline Field Capture Integration | backlog #5 | TODO | Sync engine built but never mounted in the production flow. |
| 10 | Floorplan Underlay add-on | backlog #7 | TODO | Gated, watermarked, excluded from measured quantities. |
| 11 | Apple RoomPlan LiDAR | RA-7091 | TODO | Native capture; explicitly no Matterport dependency. |
| 12 | Mapping spec reconciliation | RA-5689 | TODO | Resolve the ADR-001 geometry decision that stalled RA-2947. |
| 13 | Sketch endpoint snap + guides | RA-6969 | TODO | Remaining polish split out of the merged A5 work. |

## Wave 3 — Trust and compliance

| # | Task | Source | Stage | Notes |
|---|---|---|---|---|
| 14 | Trust and Compliance Centre | backlog #10 | TODO | Customer-visible posture backed by real gates. |
| 15 | Prod RLS remediation plan | memory | BLOCKED | ~119 tables without RLS. Plan is agent work; **the migration run is owner-gated** — never autonomous. |
| 16 | Sidekick transcript resume | review deferral | TODO | Reopening the sheet loses the conversation. |
| 17 | Live Teacher session lifecycle | review deferral | TODO | No end-session endpoint; repeated opens orphan sessions. |
| 18 | AI usage ledger (RA-1087) | review deferral | TODO | No `workspaceId` on the session, so spend never reaches `logAiUsage`. |

## Wave 4 — Commercial and operations

| # | Task | Source | Stage | Notes |
|---|---|---|---|---|
| 19 | Technician Dispatch + Seat Enforcement | backlog #8 | TODO | The missing commercial bridge for BYOK monetisation. |
| 20 | Integration Health Action Queue | backlog #9 | TODO | Turn Xero/MYOB/Ascora sync failures into an ordered queue. |
| 21 | **Lifetime customers 402'd on 10 paid AI routes** | review deferral, reclassified P1 | BUILT + VERIFIED, awaiting review | Reading the code inverted the assumption: the shared helper never read `lifetimeAccess` and allowlisted a non-existent `LIFETIME` enum value. The turn route was right. Fixed; 94 consumer tests pass; RED observed on 6 tests first. Spec: `.planning/specs/21-lifetime-access-gate-defect.spec.md`. |
| 22 | SEO playbook sign-off | RA-1664 | BLOCKED | **Founder-gated.** Dry-run complete, waiting on four answers. |
| 23 | Software directory presence | RA-1664 finding | TODO | Absent from G2/Capterra/GetApp AU while competitors own comparison results. |
| 24 | Board-meeting watchdog | RA-7085 | TODO | Scheduled task silent 475h. |
| 25 | Launch marketing set | new | TODO | Explainer video + copy for the three shipped P0s. |

## Wave 5 — discovered by the judge gate, 2026-07-26 (all evidence-backed)

| # | Task | Source | Stage | Notes |
|---|---|---|---|---|
| 26 | Correct the §5.1 justification merged in PR #1988 | judge verdict | TODO | The code comment claims §5.1 "has no entry", which a partial index cannot prove. The §10.6 change stands on the semantic argument alone; the comment and test reason must be corrected. |
| 27 | Fix three wrong citations in `app/compliance/page.tsx` | judge verdict | TODO | `:60` health & safety cites §5.1 (Psychrometry) → §8. `:68` and `:73` cite §4.2 (Building Science) → §9.2. Verify against the licensed PDF before changing. |
| 28 | Replace superseded AS/NZS 4360:2004 in `lib/scope-biohazard.ts:50` | judge verdict | TODO | Cited as live authority; the file's own comment concedes ISO 31000 superseded it. |
| 29 | Harden the AI report citation path | judge verdict | TODO | `lib/reports/generate-report-ai.ts:872-874` lets the model invent clause numbers into insurer PDFs; `:1028-1031` hard-codes wrong material→clause prose. Inject citations from `standardCite()` or validate model output before the PDF. **Highest liability item found tonight.** |
| 30 | Wire `classifyClauseRef` into the report path | judge verdict | TODO | The five-value classifier exists and is scoped to Live Teacher only. Wiring it to reports is the 90% win the currency module was not. |
| 31 | Registry coverage honesty | judge verdict | TODO | ~30 AS/NZS, NADCA and AS standards the product cites sit outside `STANDARDS_VERSIONS`. Either cover them or state coverage explicitly wherever status is shown. |

| 32 | **BillingGate hydration fail-open — App Review 3.1.1** | frozen-head review of #1989 + independent review of 401ac914 | **BLOCKED — founder/Board** | The iOS shell loads server-rendered HTML (`capacitor.config.ts:22` → `https://restoreassist.app`, no `output:"export"`), and React 19 uses `getServerSnapshot` while hydrating, so WKWebView paints the billing UI and holds it for the whole bundle-download window. **Cannot be closed inside the component** — the server cannot distinguish an iOS shell request from a crawler. Needs `appendUserAgent`/`overrideUserAgent` in the native shell config plus server-side detection, which changes the App Store build. Partial fix (fresh-mount path + null-fallback bug) is committed at 2c8cab6a with two skipped tests asserting the correct end state. |

## Run log

| When | Task | Stage reached | Evidence |
|---|---|---|---|
| 2026-07-26 | iOS billing-gate fix (out of band) | REVIEWED, awaiting merge | PR #1989 **OPEN + draft, NOT merged** (`mergedAt: null`, 2 checks pending). type-check 0, 11/11 tests, positive control cited. **The App Review violation remains live on main until this merges.** |
| 2026-07-26 | #1 Standards Currency Registry | DEFINED | Two verified findings: `nextRevisionExpected` has zero consumers repo-wide; NCC due 2025 is already past. Wiki recall MISSED (no vault page on standards currency) — index repair owed. |
