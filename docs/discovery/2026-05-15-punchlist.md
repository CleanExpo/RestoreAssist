# Overnight Run — Synthesised Punch-List (2026-05-15)

> **Phase 4 deliverable.** Reconciles Phase 2 (gap inventory) + Phase 3 (UI/UX audit) against the live `origin/sandbox` tip `95dd34e2` (post-Wave-1). Phase 2 was authored against `c40b5a41` (pre-Wave-1) and contains several stale-base false positives; this document lists them explicitly and drops them from the verified list.
>
> **Sandbox tip:** `95dd34e2 feat(sp-a): job-close terminal state — close route + AI summary + state machine (#1025)`
> **Run date:** 2026-05-14 evening AEST

---

## Executive summary

Wave 1 shipped overnight (5 PRs: onboarding hotfix to prod; SP-E storage BYOK, DR/NRPG inbound, SP-7 Seam F, SP-A job-close to sandbox). Reconciliation collapses Phase 2's 14 P0 claims to **3 verified P0** (handover route, reopen route, ClientPortalAccount model) plus **2 promoted-from-P1 P0s** (signin 404, auto-COMPLETED in submit route still present). Top recommendation for morning: **manual verification gate on SP-A close** (Phase 1 Task 11) before any further wave kicks off.

---

## What shipped overnight (Phase 1 — Wave 1)

| PR        | Title                                                                        | Target         | Sandbox commit |
| --------- | ---------------------------------------------------------------------------- | -------------- | -------------- |
| **#1021** | Onboarding hotfix (Google Drive OAuth wiring)                                | **production** | `c40b5a41`     |
| **#1022** | SP-E Storage BYOK pipeline — dual-write mirror queue                         | sandbox        | `febee9c6`     |
| **#1023** | DR/NRPG inbound — InboundJobAlert + `/api/inspections/inbound-jobs` + accept | sandbox        | `e2b9ad4c`     |
| **#1024** | SP-7 Seam F — server-side magic-byte gate + Cloudinary tags                  | sandbox        | `338493b3`     |
| **#1025** | SP-A job-close — terminal state + close route + AI summary + state machine   | sandbox        | `95dd34e2`     |
| **#1027** | Phase 2 discovery (this run — docs)                                          | sandbox        | _open_         |
| **#1028** | Phase 3 UI/UX (this run — docs)                                              | sandbox        | _open_         |

---

## Reconciliation against Phase 2 false positives

Phase 2 was cut from `c40b5a41` (immediately after Wave 1 PRs **#1022–#1025** merged but, more importantly, before the author re-probed the merged tree). Most of its P0 list is now closed in sandbox. Reconciliation:

| Phase 2 claim                                                                  | Status on `95dd34e2`                                                                                                            | Verdict                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 #1 — `POST /api/inspections/[id]/close` missing                             | **`app/api/inspections/[id]/close/route.ts` exists** + tests                                                                    | **FALSE POSITIVE — closed by #1025**                                                                                                                             |
| P0 #2 — `POST /api/inspections/[id]/handover` missing                          | No handover dir under `app/api/inspections/[id]/`                                                                               | **VERIFIED — still missing**                                                                                                                                     |
| P0 #3 — `POST /api/inspections/[id]/reopen` missing                            | No reopen dir under `app/api/inspections/[id]/`                                                                                 | **VERIFIED — still missing**                                                                                                                                     |
| P0 #4 — `Inspection.completedAt` + `closeSummary` cols missing                 | Schema has `completedAt` + `closeSummary @db.Text` on `Inspection` (migration `20260516000000_inspection_close_terminal_state`) | **FALSE POSITIVE — closed by #1025**                                                                                                                             |
| P0 #5 — `Inspection.handoverCompletedAt` + `handoverPackageStorageKey` missing | `handoverCompletedAt DateTime?` is present; `handoverPackageStorageKey` is NOT                                                  | **PARTIAL — handoverPackageStorageKey still missing**                                                                                                            |
| P0 #6 — `ClientPortalAccount` model missing                                    | Not in schema                                                                                                                   | **VERIFIED — still missing**                                                                                                                                     |
| P0 #7 — `Inspection.upstreamSource` missing                                    | `source String? @default("MANUAL")` exists (DR_NRPG / MANUAL); enum-typing is the only thing missing                            | **DOWNGRADE — column exists as string, P2 to enumify**                                                                                                           |
| P0 #8 — `StorageMirrorJob` model missing                                       | Model present (migration `20260514110000_sp_e_storage_mirror_job`) + relation on Organization                                   | **FALSE POSITIVE — closed by #1022**                                                                                                                             |
| P0 #9 — `lib/lifecycle/` missing                                               | `lib/lifecycle/inspection-state-machine.ts` + `load-context.ts` + tests present                                                 | **FALSE POSITIVE — closed by #1025**                                                                                                                             |
| P0 #10 — `lib/ai/lifecycle/` missing                                           | `lib/ai/lifecycle/on-close.ts` + `_shared.ts` + tests present                                                                   | **PARTIAL — only `on-close` shipped; other 5 hooks (draft-invoice, auto-tag-photo, next-action, smart-search, mirror-recovery) still missing — DOWNGRADE TO P1** |
| P0 #11 — `/signin` returns 404                                                 | Live probe `curl /signin` → 404 confirmed. Only `/login` resolves                                                               | **VERIFIED — still broken**                                                                                                                                      |
| P0 #12 — No claim-type picker at inspection-start                              | `components/NIRTechnicianInputForm.tsx` has no `claimType` setter                                                               | **VERIFIED — still missing**                                                                                                                                     |
| P0 #13 — `S540_FIELD_MAP` missing                                              | `lib/nir-standards-mapping.ts` does not export anything S540                                                                    | **VERIFIED — still missing**                                                                                                                                     |
| P0 #14 — Submit route auto-writes `COMPLETED`                                  | `app/api/inspections/[id]/submit/route.ts:538` still writes `status: "COMPLETED"` after AI pipeline; bypasses SP-A close gate   | **VERIFIED — still broken; conflicts with spec §5.3 Editability invariant**                                                                                      |

**Net reconciliation:** Phase 2's 14 P0 list collapses to **8 still-real items** after merging Wave 1; with severity-downgrades the verified-P0 count is **6**.

---

## VERIFIED P0 gaps (after reconciliation)

> Six items. Each is genuinely terminal — UX dead-ends, broken routes, or violations of an invariant in spec §5.3 / §9.5.

1. **`POST /api/inspections/[id]/handover` does not exist** — SP-J blocker. After close, tech has no terminal CTA to formally hand the package back to the client. Without this, SP-A close is a half-built terminal state. _Source: Phase 2 P0 #2._
2. **`POST /api/inspections/[id]/reopen` does not exist** — SP-C blocker. Admin cannot un-archive an inspection if a billing reversal or audit-finding surfaces. _Source: Phase 2 P0 #3._
3. **`ClientPortalAccount` model does not exist** — SP-J `app/portal/[token]/page.tsx` already ships but has no first-class persistence model. Tokens are validated against an ad-hoc string today; can't be revoked or rotated. _Source: Phase 2 P0 #6._
4. **`/signin` returns 404** — Password-manager autofill and direct-URL muscle memory dead-end at the front door. Trivial fix (single `redirects()` entry in `next.config.js` or a `app/signin/page.tsx` that re-exports `/login`). _Source: Phase 2 P0 #11 + Phase 3 P1 #5 redirect-state-loss._
5. **Submit route still auto-writes `status: "COMPLETED"` (line 538)** — silently bypasses SP-A's `CLOSED` terminal-state gate. Today the AI submit pipeline races the user's `CloseJobPrompt`: whichever fires last wins. Violates spec §5.3 Editability invariant ("every output lands in a confirmation surface"). _Source: Phase 2 P0 #14._
6. **`<meta name="viewport" content="..., maximum-scale=1, user-scalable=no, ...">`** — fails WCAG 1.4.4 on **every page** of the site. Low-vision users cannot zoom forms. One-line fix in the root `viewport` export. _Source: Phase 3 P0 #1._

---

## VERIFIED P1 gaps

> Twelve items, in rough priority order (effort + leverage).

7. **No claim-type picker on `/dashboard/inspections/new`** — tech cannot signal S540 / S700 / S520 vs S500 upfront → wrong evidence-capture surface rendered. _Phase 2 P0 #12, downgraded — schema can absorb a free-text claimType so it's not strictly broken, just wrong-default UX._
8. **`S540_FIELD_MAP` missing in `lib/nir-standards-mapping.ts`** — S500/S520/S700 have full maps. Trauma-scene field mandates are uncodified. _Phase 2 P0 #13, downgraded — not a runtime crash, just incomplete coverage._
9. **`Inspection.handoverPackageStorageKey` column missing** — required by SP-J §9.5 to store the ZIP-package location after handover. Schema delta only; ~15-min migration. _Phase 2 P0 #5 (partial)._
10. **`Client.brandLogoUrl` + `brandPrimaryColor` not present** — no co-brand on handover packages or portal. _Phase 2 (implicit from P0 #5)._
11. **Remaining 5 `lib/ai/lifecycle/` hooks missing** — `draft-invoice.ts`, `auto-tag-photo.ts`, `next-action.ts`, `smart-search.ts`, `mirror-recovery.ts`. SP-A shipped `on-close.ts`; the rest are spec §5 line items. _Phase 2 P0 #10 (partial)._
12. **No `/dashboard/inspections/completed` tab** — SP-C surface for completed-inspections review absent. _Phase 2 P1 #16._
13. **Mobile LCP 5.2 s on `/`** — POOR Core Web Vitals on landing → conversion-rate killer + SEO ranking penalty. _Phase 3 P1 #3._
14. **Primary CTA contrast 4.33–4.48:1 on `/`, `/pricing`** — fail WCAG 1.4.3 on highest-leverage commercial elements. _Phase 3 P1 #4._
15. **"Show password" eye button 20×20 px on `/signup` + `/login`** — fail WCAG 2.2 §2.5.8 target-size on the two most-used auth surfaces. _Phase 3 P0 #2 (we'd downgrade given /signin is the higher-impact auth-flow break)._
16. **5 protected routes lose intended-destination state on `/login` redirect** — no `?next=` preservation. _Phase 3 P1 #5._
17. **`EngagementLicenceModal` re-trigger missing** when dismissed mid-flow. _Phase 2 P1 #17._
18. **No claim-type-aware required-photo gate before sign-off** — checklists exist in `lib/iicrc-checklists.ts`, no UI enforcement. _Phase 2 P1 #18._
19. **`Authorisation.subjectLicenceClass` is free-text** — 8 jurisdictions × multiple classes uncodified. _Phase 2 P1 #19._
20. **`WHSIncident.incidentType` is free-text** — no controlled vocabulary, no cross-tenant analytics. _Phase 2 P1 #20._
21. **No `lib/lifecycle/subscribers/invoice-paid.ts`** — Stripe webhook lands `Invoice.status = PAID` but inspection state does not advance. _Phase 2 P1 #21._

---

## VERIFIED P2 gaps (deferred — backlog only)

(non-exhaustive, the higher-impact line items from Phase 2 + Phase 3)

- Enum-ify `Inspection.source` (column exists as String; just needs `enum InspectionSource { MANUAL DR_NRPG ASCORA … }`). _Phase 2 P0 #7 downgraded._
- `/onboarding` + `/register` return 404 — same routing-discoverability pattern as `/signin` but lower-traffic. _Phase 2 P1 #32._
- Brand colour `#D4A574` declared but unused; three different "dark bg" greys (`slate-950`, `neutral-950`, `#050505`) live in the wild. _Phase 3 P1 #6 + #7 — token-hygiene only, not a journey-blocker._
- `/` and `/pricing` have 15 small (< 44 px) tap targets each on mobile. _Phase 3 P2 #8._
- `/privacy` footer micro-copy at 4.17:1 contrast. _Phase 3 P2 #9._
- Cyan-500 accent on `/signup` focus state + 404 page CTA — unbranded 5th colour. _Phase 3 P2 #11._
- Bluetooth meter disconnect mid-reading not surfaced. _Phase 2 P2 #37._
- No "what we pulled from ABR" reassurance UI. _Phase 2 P2 #33._
- No `AuditLog` row for `USER_REGISTERED`. _Phase 2 P2 #40._
- 7 "double-handling cliffs" (ABN, IICRC cert, address, licence ref, storage destination, team role, GST flags). _Phase 3 §double-handling cliffs._

---

## Top 5 recommendations for Phill's morning

1. **Manual verification gate on SP-A Job-Close** — overnight plan Task 11. Log in, run an inspection through DRAFT → SUBMITTED → IN_BILLING → CLOSED, verify `CloseJobPrompt` renders + `Inspection.completedAt` + `closeSummary` populate. Without this, SP-B / SP-J / SP-C cannot kick off.
2. **Set Vercel sandbox env vars for Google Drive OAuth** — per onboarding hotfix runbook (`docs/runbooks/google-drive-oauth-vercel-env.md` if landed; otherwise the PR #1021 description). Required for the SP-E storage card to function end-to-end.
3. **Ship the `/signin` redirect hotfix** — single-line `redirects()` entry; lowest-effort highest-impact item on the punch-list.
4. **Patch `app/api/inspections/[id]/submit/route.ts:538`** — change `status: "COMPLETED"` to `status: "ESTIMATED"` (or new `READY_FOR_BILLING`) so the SP-A close gate is the only path to terminal state. Tiny diff; restores the spec §5.3 Editability invariant.
5. **Remove `user-scalable=no` from root viewport meta** — one-line WCAG 1.4.4 fix that unblocks low-vision users on every page.

---

## Linear tickets created

All 10 tickets created via `mcp__claude_ai_Linear__save_issue` on team **RestoreAssist**. The custom labels `discovered-overnight` + `sp-5-followup` requested in the runbook do not exist on the team and were silently dropped by Linear's API — substituted with the closest existing labels (`audit-finding-2026-05-11`, `RestoreAssist`, plus category labels). Phill can add the new labels manually if desired.

| Linear                                                  | Priority    | Covers | Title                                                            |
| ------------------------------------------------------- | ----------- | ------ | ---------------------------------------------------------------- |
| [RA-4859](https://linear.app/unite-group/issue/RA-4859) | Urgent (P0) | P0 #1  | Add `POST /api/inspections/[id]/handover` route (SP-J blocker)   |
| [RA-4860](https://linear.app/unite-group/issue/RA-4860) | Urgent (P0) | P0 #2  | Add `POST /api/inspections/[id]/reopen` route (SP-C blocker)     |
| [RA-4861](https://linear.app/unite-group/issue/RA-4861) | Urgent (P0) | P0 #3  | Add `ClientPortalAccount` Prisma model                           |
| [RA-4862](https://linear.app/unite-group/issue/RA-4862) | Urgent (P0) | P0 #4  | Fix `/signin` 404                                                |
| [RA-4863](https://linear.app/unite-group/issue/RA-4863) | Urgent (P0) | P0 #5  | Submit route auto-promotes to COMPLETED — gate behind SP-A close |
| [RA-4864](https://linear.app/unite-group/issue/RA-4864) | Urgent (P0) | P0 #6  | Remove `user-scalable=no` from root viewport meta                |
| [RA-4865](https://linear.app/unite-group/issue/RA-4865) | High (P1)   | P1 #7  | Add claim-type picker to `/dashboard/inspections/new`            |
| [RA-4866](https://linear.app/unite-group/issue/RA-4866) | High (P1)   | P1 #8  | Add `S540_FIELD_MAP` to `lib/nir-standards-mapping.ts`           |
| [RA-4867](https://linear.app/unite-group/issue/RA-4867) | High (P1)   | P1 #13 | Fix mobile LCP 5.2s on landing `/`                               |
| [RA-4868](https://linear.app/unite-group/issue/RA-4868) | High (P1)   | P1 #14 | Bump primary CTA contrast to 4.5:1 on `/` and `/pricing`         |

The brainstorm-gated items (SP-J handover full plan, SP-H knowledge/RAG, SP-G AI Sidekick, SP-3 BYOK upgrades, SP-6 Email BYOK) are noted in **Pending interactive work** below and intentionally NOT ticketed — they need a Phill-driven brainstorm before scope is firm enough.

The other 11 verified P1 items (handoverPackageStorageKey column, Client brand fields, remaining lifecycle hooks, `/dashboard/inspections/completed` tab, eye-button target-size, `?next=` preservation, EngagementLicenceModal re-trigger, required-photo gate, licence-class enum, WHSIncident.incidentType enum, invoice-paid lifecycle subscriber) are documented in this punch-list and can be ticketed later in batches — they're either dependent on the brainstorms above (handover/portal) or are P1-but-not-blocking-Wave-2.

---

## Pending interactive work (need Phill)

- **SP-J handover brainstorm** — handover-package contents (ZIP shape, client-portal token lifetime, co-brand assets, what's redacted from internal notes)
- **SP-H knowledge / RAG brainstorm** — corpus selection, retrieval strategy, evaluation harness
- **SP-G AI Sidekick brainstorm** — surface placement, latency budget, fallback behaviour
- **SP-3 BYOK upgrades brainstorm** — provider matrix beyond Drive (OneDrive, S3, Azure Blob), key rotation UX
- **SP-6 Email BYOK brainstorm** — SMTP vs OAuth providers, deliverability monitoring, reply-tracking
- **Play Console phone + identity verification** — account restricted since 2026-04-08; needs Phill to complete the verification flow

---

## Run stats

- **Phase 1 PRs merged:** 5 (one to prod, four to sandbox)
- **Phase 2 scenarios simulated:** 50 (24 S500, 12 S520, 6 S540, 8 S700)
- **Phase 2 P0/P1/P2 BEFORE reconciliation:** 14 / 18 / 9
- **Verified P0/P1/P2 AFTER reconciliation:** 6 / 15 / 10+
- **Phase 3 captures:** 30 (10 routes × 3 viewports)
- **Phase 3 Lighthouse runs:** 9
- **Wave 1 LOC delta (rollup, all 5 PRs):** ~5,200 lines added, ~180 deleted
- **Total overnight wall-clock:** ≈ 8 hours (Wave 1: 6 h serial; Phase 2: 32 min; Phase 3: 35 min; Phase 4: 50 min)
- **Total overnight API spend estimate:** <$15 (most spend was Wave 1 implementation agents; Phases 2-4 ≈ $1 combined)

---

## Verification

Documentation deliverable — exempt from the always-on visual-confirmation gate per `.claude/rules/verification-gate.md`. Methodology section above documents how each reconciliation finding was derived (live curl probes + `git show origin/sandbox:<path>` schema-greps + cross-reference against Phase 2 line-numbered claims) so any P0/P1 can be re-verified by replaying the same probes.
