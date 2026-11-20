# P2 — RestoreAssist (after operational quality)

**Start when:** P1 is **shipped and signed off** (deploy, migrate, green golden E2E, Phill attestation). P2 must **not block** the P1 operational week — schedule it as the next program lane.

**North star:** V1 claim + financial integrity on real jobs, AU/NZ parity, tenant-safe Supabase, honest builds, and payment rails you can prove in CI.

**Source of truth for scope:** `docs/architecture/RESTOREASSIST-V1-BACKLOG.md` (Phases 1–2), `docs/production-grade-implementation/RLS_P0_WORKSTREAM.md`, `docs/deps/BUILD-TYPE-ERRORS-2026-08-25.md`.

---

## How to run P2 (program shape)

Run **four parallel tracks** with a weekly integration review (product + eng + Phill). Each track has a **single exit metric** so progress is measurable.

| Track | Themes | Exit metric |
|-------|--------|-------------|
| **A — Claim & field truth** | V1 Phase 1 claim integrity, offline sync in prod | One job: baseline → monitor → certify → PDF shows relational readings |
| **B — Money spine** | V1 Phase 2 financial canonical, Stripe Connect E2E | One job: rate card → approved estimate → invoice → payment recorded (test mode) |
| **C — Locale & platform** | NZ compliance gate, RLS remediation | NZ org completes setup + one inspection; RLS batch 5 applied on sandbox with harness green |
| **D — Engineering hygiene** | `ignoreBuildErrors` removal | DO build uses `ignoreBuildErrors: false` and CI `tsc` matches npm tree |

**Dependency rule (V1 backlog):** Phase 1 claim items that unblock certification and PDF (P1-1, P1-2, P1-4) before drying-cert E2E; Phase 2 financial (P2-1 → P2-3) before Connect E2E; P3-6 NZ locale before GST consolidation (P3-7).

---

## RA-P2-1 — V1 Phase 1: Claim integrity

**Why:** Insurers and auditors care about **defensible drying**, **readings in the report**, and **controlled status history** — not demo PDFs filled from blobs.

**Backlog mapping:** V1 `P1-1` … `P1-13` (claim integrity section). P1-12 (SketchRoom) is **DONE**; use it as the pattern for migrations + tests.

### Definition of done (100%)

1. **Baseline & monitoring (P1-1):** Field/API can set `MoistureReading.isBaseline` and `isMonitoringPoint`; UI exposes both without re-keying.
2. **Drying certify (P1-2, D-003):** Drying-goal logic uses **latest valid reading per point/material**; day-1 wet reading does not permanently block certify; unit tests cover sequences.
3. **Invalidation (P1-3):** Readings can be invalidated with audit trail (reason, actor, replacement link) — never silent delete.
4. **Readings in PDF (P1-4):** IICRC PDF pulls **relational** moisture readings (with baseline/monitoring flags), not hand-keyed JSON blobs only; snapshot test stable.
5. **Report delivery state (P1-5, P1-6):** Six-fact status + `report_sent` tied to real delivery events (build on PR #1967 / closure work).
6. **S500 intake (P1-8, P1-9):** Category/Class + loss timeline required before scope/closure where spec demands.
7. **Safety & disposal (P1-10, P1-11):** SWMS/hazard gates and authority-to-dispose enforced on scope actions.
8. **ClaimProgress CAS (P1-7):** All writers use version-CAS or progress service — concurrency test green.

### Work packages (recommended order)

| Sprint slice | Items | Verification |
|--------------|-------|--------------|
| **1 — Moisture write path** | P1-1 API + field forms + quick entry | Integration: POST moisture with flags persisted |
| **2 — Drying engine** | P1-2 `lib/progress` / drying guards refactor | Unit: reading sequences; existing `drying-invoice-dispute` tests extended |
| **3 — PDF truth** | P1-4 PDF generator + report assembly | Integration + PDF snapshot diff |
| **4 — Certify E2E** | Wire progress “drying goal achieved” to UI | E2E: field readings → certify → email/template path |
| **5 — Governance** | P1-3, P1-5, P1-6, P1-7 | Audit log assertions; state-machine unit tests |
| **6 — S500 + WHS** | P1-8–P1-11 | E2E ACM-blocks-stripout; completeness pack tests |

### Risks

- **Threshold numbers:** D-003 allows scaffold without final numeric methodology — document “operator confirms target” in UI until Phill signs thresholds.
- **Scope creep:** Phase 1 is **integrity**, not Margot (Phase 4) — defer AI narrative to P2+ unless it blocks PDF.

---

## RA-P2-2 — V1 Phase 2: Financial canonical

**Why:** Hardcoded line prices and orphan invoice clients destroy trust with paying owners and break Xero reconciliation.

**Backlog mapping:** V1 `P2-1` … `P2-5`.

### Definition of done (100%)

1. **Rate card (P2-1):** Every production scope/estimate line gets `suggestedRate` from `OrganizationPricingConfig`; grep-guard fails on `$50` hardcodes.
2. **Estimate snapshot (P2-2):** Approve freezes line economics; later rate-card edits do not mutate approved estimate.
3. **Invoice from estimate (P2-3):** Invoice lines from snapshot; customer from `Inspection.clientId`; idempotent `Invoice.sourceInspectionId`.
4. **Ledger (P2-4):** Stripe/web/manual payments write `InvoicePayment`; closure/paywall sees correct paid state.
5. **Idempotency (P2-5):** Web client sends `Idempotency-Key`; DB partial-unique on external payment ids.

### Work packages

| Slice | Deliverable | Test |
|-------|-------------|------|
| 1 | Delete/replace hardcoded estimate paths; wire pricing config | Unit + `grep` CI script |
| 2 | Approve estimate → immutable snapshot model | Integration: mutate rate card after approve, lines unchanged |
| 3 | Generate invoice from inspection + estimate | Integration + e2e invoice leg (extend golden flow) |
| 4 | Payment recording + Stripe webhook ledger | Webhook integration tests (existing billing suite) |
| 5 | Idempotency on invoice pay routes | Concurrency test |

### Dependency

- **P3-2 client spine** strongly recommended before invoice E2E if “oldest client” bugs persist — schedule early in Track B if repro still exists on main.

---

## RA-P2-3 — NZ compliance gate (AU-default today)

**Why:** Defaulting AU law on NZ jobs is a **compliance liability** (`lib/documents/job-jurisdiction.ts` already warns about this).

**Backlog mapping:** V1 `P3-6` (IN PROGRESS), `P3-7` GST consolidation.

### Definition of done (100%)

1. **Org authority:** Setup activation persists **country**, **NZBN vs ABN**, region, timezone — server validates on activate (NZ path already partially in `BusinessDetailsCard` / setup checks).
2. **Job authority:** Inspection/report **jurisdiction** resolves from org + property country (`resolveJobJurisdiction`) — no silent AU fallback when NZ signals exist.
3. **GST/currency:** Invoice, estimate, credit note use `getGstTreatment(country)` — **no AU-only 10% fallbacks** (P3-7).
4. **Copy & standards:** Help/compliance surfaces show NZ paths (AS/NZS moisture references where applicable).
5. **E2E:** One NZ signup/setup path (wizard or manual NZBN) → dashboard → report footer shows NZ GST 15%.

### Work packages

| Slice | Task |
|-------|------|
| 1 | Audit all `country === 'AU' \|\| true` and GST 0.1 literals — static guard test |
| 2 | Middleware/setup: **block activate** if NZ org missing NZBN/region |
| 3 | PDF + scope narrative NZ branches (`lib/export/scope-narrative` tests as template) |
| 4 | Phill: one NZ pilot org on staging |

---

## RA-P2-4 — Offline sync in production flow

**Why:** Field techs lose signal on site; queue exists (`lib/nir-sync-queue`, `ClientMutation` ledger) but prod flow must **drain reliably** under real auth and conflict rules.

### Current state

- Web field UI: offline copy + `queueWrite` / drain patterns (`QuickMoistureEntry.offline.test.tsx`, `client-mutation-ledger` tests).
- Mobile: separate sync engine goals in `docs/root-archive/goals.md` (may still be stub — verify `mobile/lib/sync/engine.ts`).

### Definition of done (100%)

1. **Web Capacitor / PWA path:** Tech captures moisture/photo offline → reconnect → **exactly-once** on server (idempotency keys).
2. **Conflict policy:** Stale sketch/moisture returns **409** with recoverable UI (RA-7542 patterns).
3. **Observability:** Dashboard or admin shows pending queue depth per inspection (optional P2.1 — nice for support).
4. **Prod config:** No feature flag required for queue in production; documented in ops runbook.
5. **E2E:** Network offline in Playwright → save reading → online → reading visible on inspection detail + report draft.

### Work packages

| Slice | Task |
|-------|------|
| 1 | Map all field write routes for `Idempotency-Key` coverage |
| 2 | E2E offline moisture (extend `tech-evidence-capture` or dedicated spec) |
| 3 | Mobile engine parity OR explicit “web-first P2, mobile P2b” decision documented |
| 4 | Load test: 50 queued writes drain without duplicate rows |

---

## RA-P2-5 — RLS ~119 tables remediation

**Why:** Supabase anon/authenticated clients must not read cross-tenant rows; RA-4956 treated this as **release-gate** class work.

**Source:** `docs/production-grade-implementation/RLS_P0_WORKSTREAM.md`, `scripts/audit-rls.ts`, `.github/workflows/rls-isolation.yml`.

### Definition of done (100%)

1. **`audit-rls.ts` exits 0** against production catalog (or staged mirror) — no unscoped operational table.
2. **Five batches applied** on sandbox, then prod with rollback SQL per batch.
3. **Prisma migrations** for each batch (no ad hoc dashboard-only edits).
4. **Harness green:** `scripts/rls-harness/` + `verify-live-rls.ts` on sandbox after each batch.
5. **Owner-gated migration:** Founder approves prod apply window; evidence attached to RA-4956.

### Work packages (match RLS doc batches)

| Batch | Focus | Gate |
|-------|--------|------|
| 1 | Service-only deny default | Webhooks + cron smoke |
| 2 | Public reference read-only | Help/standards pages |
| 3 | User/org/workspace | Auth, invite, billing |
| 4 | Inspection children | Field + report generation |
| 5 | Report/invoice/portal/integration | Portal + Xero + exports |

### Risks

- **Prisma vs live drift:** Resolve 5 tables only in prod (`BusinessProfile`, etc.) before batch 4–5.
- **initplan performance:** Keep `lint-rls-policy-initplan.mjs` in CI for new policies.

---

## RA-P2-6 — Remove `ignoreBuildErrors: true`

**Why:** DO production build uses **npm** and can ship TypeScript errors while CI (pnpm) is clean — see `docs/deps/BUILD-TYPE-ERRORS-2026-08-25.md`.

### Definition of done (100%)

1. **`npx tsc --noEmit`** exit 0 on **npm ci** tree (same as DigitalOcean).
2. **`next.config.mjs`:** `typescript.ignoreBuildErrors: false` (and consider `eslint.ignoreDuringBuilds` separately).
3. **CI:** Add job step that runs `tsc` with npm lockfile weekly or on main.
4. **No regressions:** `node scripts/type-check.mjs` (or project standard) required on PRs.

### Work packages

| Slice | Task |
|-------|------|
| 1 | Re-measure error count on current main with npm |
| 2 | Fix errors in clusters (API routes, Prisma selects, test typings) |
| 3 | Align pnpm/npm overrides if version skew causes drift |
| 4 | Flip flag on branch; run full `npm run build` on DO-like runner |
| 5 | Document in P0 checklist: build must fail on TS errors |

---

## RA-P2-7 — Stripe Connect E2E

**Why:** Payments add-on advertises Connect rail (`lib/billing/payments-addon.ts`); **no E2E** proves onboarding + payment intent today.

### Definition of done (100%)

1. **Test mode Connect:** Seed connected account (Stripe test helpers or mock) for a workspace.
2. **E2E flow:** Owner enables Payments add-on → Connect onboarding stub completes → create payment for invoice → webhook marks paid.
3. **Isolation:** E2E uses Stripe test keys only; no live charges.
4. **CI:** Spec in billing or dedicated workflow with secrets in GitHub Actions.
5. **Docs:** Runbook for founder Connect test account rotation.

### Work packages

| Slice | Task |
|-------|------|
| 1 | Inventory Connect routes + webhooks (grep `connect.stripe.com`, account links) |
| 2 | Add `e2e/stripe-connect-happy-path.spec.ts` behind env guard |
| 3 | Wire webhook fixture from existing `stripe-payment-intent-webhook.spec.ts` patterns |
| 4 | Depends on P2-3 invoice spine — invoice must exist before Connect charge |

---

## Suggested timeline (do not block P1 week)

| Weeks after P1 sign-off | Focus |
|-------------------------|--------|
| **1–2** | P2-6 npm tsc burn-down (parallel); RLS batch 1–2 on sandbox |
| **3–4** | Claim integrity slices 1–3 (moisture flags, drying logic, PDF readings) |
| **5–6** | Financial P2-1–P2-3 + extend golden E2E invoice leg |
| **7–8** | NZ gate P3-6/P3-7 + offline E2E |
| **9–10** | RLS batches 3–5 + prod rollout window |
| **11–12** | Stripe Connect E2E + claim governance P1-5–P1-11 hardening |

Adjust aggressively if Phill prioritises **money spine** or **RLS** for a pilot customer.

---

## Cross-cutting standards (P2)

| Standard | Rule |
|----------|------|
| **Evidence over compile** | Each epic closes with test name + screenshot or SQL audit output |
| **Migrations** | Prisma + Supabase policies in version control; rollback script per prod apply |
| **No AU defaults in NZ** | Code review checklist item |
| **Feature flags** | Large RLS / financial changes behind flags until sandbox week green |
| **Linear** | Epic `P2 — V1 integrity & platform`; one issue per backlog `P1-x` / `P2-x` item |

---

## Exit criteria (program complete)

Phill signs **P2 attestation** when all are true:

1. Golden E2E includes **certify + PDF readings + invoice from estimate** (or documented staging-only with prod migrate complete).
2. NZ staging org completes one job with **15% GST** and correct jurisdiction copy.
3. RLS audit **0 critical gaps** on prod catalog; harness artifact archived.
4. Production DO build with **`ignoreBuildErrors: false`**.
5. Stripe Connect E2E green in CI (test mode).
6. Offline E2E: moisture survives offline → sync on reconnect.

Until then, P2 is **in progress**, not done.
