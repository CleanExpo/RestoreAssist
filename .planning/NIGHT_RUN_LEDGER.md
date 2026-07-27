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

## Wave 6 — discovery pass 2026-07-26 (30 items, each evidenced to file:line)

Ranked by (impact x confidence) / effort. Items 33-38 are the ship-first set: all small,
all traceable to a single line.

| # | Task | Evidence | Size |
|---|---|---|---|
| 33 | Duplicate legal invoice numbers under concurrency | `app/api/invoices/[id]/variations/route.ts:234` read-then-write outside a transaction; siblings do it inside one (`app/api/invoices/route.ts:315`) | S |
| 34 | GST-free lines silently taxed at 10% | same file `:207-212` computes per-line GST, `:230` overwrites with flat `subtotal * 0.1` | S |
| 35 | `puppeteer` prod dependency with zero imports | `package.json:226`; only other hit is a `serverExternalPackages` entry | S |
| 36 | Android Google Sign-In ships a literal TODO client ID | `lib/oauth-native.ts:62`; var absent from `.env.example`, workflows and `vercel.json` — Play Store blocker | S |
| 37 | The 4 red tests need no DB — lazy-Proxy getter throws on property access | `lib/prisma.ts:63`; fix is `vi.mock`. **Do NOT set a dummy DATABASE_URL** — 27 suites use `skipIf(!DATABASE_URL)` and would un-skip into real connection failures | S |
| 38 | Prod builds ignore type + lint errors | `next.config.mjs:33,36` with 214 `as any` in API routes | S |
| 39 | `findManyWithoutTake` guard false-negatives on a nested `take:` | `scripts/audit-api-routes.ts:146` matches the whole call block | S |
| 40 | `hasUnsafeRawSql` misses generic-annotated tagged templates | `scripts/audit-api-routes.ts:157`; `app/api/search/route.ts:47,67,86` invisible to the gate | S |
| 41 | 18 unbounded `findMany` in `lib/` — auditor only scans `app/api` | worst: `lib/restore/plan.ts:38`, `lib/telemetry/kpis.ts:40` | M |
| 42 | Voice-note transcribe skips MIME allowlist when Content-Type absent | `app/api/ai/voice-note-transcribe/route.ts:108` — rule 11 violation on a paid path | S |
| 43 | `parse-pdf` validates `file.type` only, no magic bytes | `:65`; canonical impl at `app/api/reports/upload/route.ts:43-53` | S |
| 44 | `sign-in-as` can forge an ADMIN session in prod; sibling cannot | `app/api/test/sign-in-as/route.ts:35` vs `seed-trial-user/route.ts:28-31` | S |
| 45 | NZ compliance gates are unconditional no-ops | `lib/compliance/nzbs-compliance-gate.ts:69` hardcodes `"AU"`; NZBC logic below is dead code | M |
| 46 | ~100 `(prisma as any)` casts on models that exist | sketch geometry + integration credentials lose type checking | M |
| 47 | 3 storage crons run 10-15min with watchdog disabled | `lib/cron/expected-jobs.ts:69-82`; the customer-evidence durability path | M |
| 48 | Invoice send/checkout have no rate limit | `app/api/invoices/[id]/send`, `/checkout`, `/payments` | S |
| 49 | `reopen` accepts `voidInvoice: true` and does nothing | `app/api/inspections/[id]/reopen/route.ts:193-205` | S |
| 50 | Bluetooth GATT UUIDs + byte parser are unvalidated guesses | `lib/nir-bluetooth-service.ts:43,406,420` — silent moisture-reading corruption into insurer reports | M |
| 51 | Flood/bushfire/heritage overlays are hardcoded stubs | `lib/nir-location-services.ts:61,146,197` | M |
| 52 | NZ weather stub + snapshot never persisted | `lib/weather/weather-provider.ts:6,218`; `lib/weather/auto-tag.ts:8` | M |
| 53 | 5 more files carry wrong S520:2024 chapter citations | `lib/iicrc-checklists.ts:844-908`, `lib/equipment-calculator-mould.ts:177+`, `lib/equipment-hepa-negative-air.ts:9` — founder-gated on licensed PDFs | M |
| 54 | Setup-wizard SSE polls 1/s against a `max: 5` pool | `app/api/setup/hydrate/stream/route.ts:1` | S |
| 55 | Setup hydrate rate limit not keyed on `session.user.id` | `app/api/setup/hydrate/route.ts:16` — rule 10 | S |
| 56 | Deprecated + duplicated deps | legacy `@google/generative-ai` still the imported one; `framer-motion` + `motion`; Windows-only `lightningcss-win32`; `radix-ui` meta with zero imports | M |
| 57 | Four PDF libraries + unmaintained `html2canvas` | decide and document the canonical PDF path | S |
| 58 | Two suppressed advisories with no expiry | `package.json:44-47` | S |
| 59 | N+1 in the evidence submission gate | `lib/evidence/submission-gate.ts:49-50` — runs on every rule-23 promotion check | M |
| 60 | 11 icon-only buttons with no accessible name | `NotificationBell.tsx:172,182` and 9 others | S |
| 61 | 90 `<Input>` with no id/aria-label/placeholder | in-table editable grids (contents-manifest, scope-items, payments) | M |
| 62 | 5 client bundles over 2,000 lines | `InitialDataEntryForm.tsx` (5,006), `NIRTechnicianInputForm.tsx` (3,972) — the field surface on site 4G | M |

**Verified clean, do not re-investigate:** rule 7 (`error.message` in 500s) is genuinely
enforced; `app/api` unbounded `findMany` is clean and the `ra-query-ok` convention is used
properly; zero `it.skip`/`.only` in the repo and the `skipIf(!DATABASE_URL)` pattern is
correctly backed by `scripts/ci/test-with-db.sh` + parity check.

## Measurement — `headers()` static-rendering cost (clean, 2026-07-26)

Measured twice; the second run used an isolated worktree of untouched `origin/main` so no
file mutation could contaminate it (the first run was tainted: the layout was restored
mid-compile in the same directory the build reads from).

| Build | Static | Dynamic |
|---|---|---|
| `origin/main` (clean baseline) | 68 | 290 |
| With the fix | 7 | 351 |

**61 routes lose static generation**, including `/pricing`, `/about`, `/features`, `/blog`,
`/blog/[slug]`, `/contact`.

### This is NOT a founder decision — it is a scoping bug in my implementation

I put the `headers()` read in the ROOT layout, which opts the whole tree out of static
generation. Measured from the clean baseline: **all 8 routes that actually render a
BillingGate were already static** (`/compliance`, `/pricing`, `/dashboard/{credits,
integrations,pricing,settings,subscription,success}`). Scoping the provider to just those
segments costs **~8 routes instead of 61** — the 53 marketing and blog routes stay static.

Insertion points, checked:
- `app/compliance/layout.tsx` — **already a server component**, no refactor
- `app/pricing/layout.tsx` — **already a server component**, no refactor
- `app/dashboard/layout.tsx` — is `"use client"`, and there are no per-route layouts beneath
  it, so this one needs a server wrapper with the client logic moved into a child

The 7 dashboard routes are auth-gated with zero crawler value, so their going dynamic costs
essentially nothing in business terms. The real win is keeping `/pricing`, `/blog` and the
rest of the marketing surface static.

Middleware segmentation was my earlier suggestion and should NOT be pursued first — it was
proposed without a prototype or a cost comparison, and the scoped-layout approach above is
cheaper, needs no request rewriting, and two of its three insertion points are free.

**Next action:** move the read out of `app/layout.tsx` into the three scoped layouts, then
re-measure to confirm the static count returns to ~60.

## Review gate — task #32 BillingGate, dual-family status 2026-07-27

| Family | Scope reviewed | Verdict |
|---|---|---|
| Claude (adversarial) | full fix incl. hydrateRoot probe + positive control | FAIL → all P1/P2 drained |
| Codex (cross-family) | **wiring only** — 4-link chain, 5 named files | **PASS** on `cd3c5234` |

Codex evidence: token match `capacitor.config.ts:75` ↔ `lib/capacitor.ts:67`; computed verdict
passed at `app/layout.tsx:141,164`; server verdict wins with client fallback at
`BillingGate.tsx:67,73-79`; `undefined` vs explicit `null` distinguished at `:85-88`.

**Scope honesty:** Codex answered the ONE narrow question it was asked (is the chain wired
correctly). That is not a full-scope PASS and must not be reported as one. Its two caveats —
`force-static` emptying the verdict, and pre-token shells being uncovered — are the same two
already documented in the component header, which it cited back (`:29-31`, `:32-33`).

**Process note:** three earlier Codex dispatches produced nothing. Root cause diagnosed —
`codex exec` needs the brief piped with a trailing `-`; a positional prompt hangs on stdin in
a non-TTY background run. Recorded as memory `feedback_codex_exec_stdin_invocation`. Two of
those three were wrongly written up as "Codex stalled".

**Still open on this branch:** the root-layout scoping bug (61 routes dynamic; 53 recoverable
by moving the `headers()` read into the 3 segment layouts). That is mine to fix, not a
founder decision.

### Correction — RA-7096 "single source of truth" was overclaimed

The commit message for `lib/invoices/totals.ts` says the extraction stops the two
implementations drifting again. **Verified false the same session:**
`grep -c "computeInvoiceTotals" app/api/invoices/route.ts` returns **0**, and that route
still carries its own copy (`:256` `gstAmount += itemGst`, `:290`/`:297` discount handling).

Actual state: the BROKEN caller (variations) now uses the helper and is fixed; the CORRECT
caller was left untouched. Net effect is a third location, not one. The GST defect is
genuinely closed; the duplication that caused it is not.

**Follow-up (task #63):** migrate `app/api/invoices/route.ts` to `computeInvoiceTotals`.
Non-trivial — that route also owns `validateAdjustments`, `estimateLineItemId` passthrough
and different field shapes, and it is a working money path, so it needs its own tests and
review rather than a rushed refactor at the end of a long session.
