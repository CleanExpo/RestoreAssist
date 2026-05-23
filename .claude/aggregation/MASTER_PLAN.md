# RestoreAssist — Master Plan to Finish

**Date:** 2026-05-18
**Synthesised from:** Linear, Pi-CEO, 2nd Brain wiki, Hermes, Vercel, GitHub, Supabase, local repo.
**Source files:** see `./linear/`, `./pi-ceo/`, `./wiki/`, `./hermes/`, `./vercel/`, `./github/`, `./supabase/`, `./sources/` in this folder.

---

## 1. Where we actually are

### Production is live but unverified
- `https://restoreassist.app` — Vercel-managed, 155 days to domain renewal. Latest prod deploy `dpl_6Gpguj…` built 2026-05-16 21:59 AEST from `main@0409c17` ("RA-3001 TLS pinning" PR #946). Node 24.x. No failed deploys in last 20.
- Prod Supabase: `udooysjajglluvuxkijp` ("restoreassist-prod-2026", ap-southeast-2). **72 Users · 56 Organizations · 5 Inspections · 4 Reports · 51 invites pending · 12 form templates · 12,703 cron-job runs.** This is real, not test.
- Old empty project `oxeiaavuspvpvanzcrjc` ("RestoreAssist") still ACTIVE_HEALTHY with 1 user. Decommission decision needed.
- Sprint M complete (185 Linear issues Done); SP-3 (Stripe upgrade paths, 18 tasks) shipped 2026-05-15; SP-8 (Help Library, 14 tasks) shipped 2026-05-15; iOS sign-in P0 loop fixed 2026-05-15; marketing-URL domain hotfix 2026-05-15 (.com.au → .app, this has bitten us twice).

### Three big classes of work-in-flight, not yet shipped
1. **Production go-live gate (RA-4956)** with five P0/P1 sub-issues open (RA-4951/4952/4853/4954/4955). The gate itself is `Ready for Pi-Dev`, not started.
2. **Pilot cutover (RA-1718)** with the runbook ready, soft-launch (RA-1723) + full rollout (RA-1724) both `Todo`. **Owner-action gated** — Claude won't run prod migrations.
3. **Wave 2 specs locked** but unimplemented: Customer Portal (13 decisions locked 2026-05-15) · SP-G AI Setup Agent · SP-6 Email BYOK · SP-H Knowledge Substrate / pgvector RAG. All in spec stage; no code yet.

### Local state is messy
- Current branch `release/sandbox-to-main-2026-05-16-final` (`88278f58`) is **behind `origin/main`** (`0409c17`) — origin already has the TLS-pinning commit this release branch doesn't.
- `git status`: 1 modified iOS Package.resolved + 3 untracked top-level dirs (`.agents/`, `.codex/`, `AGENTS.md`).
- `.claude/PROGRESS.md` is corrupted — substantive narrative frozen 2026-04-18, tail is 100+ empty "Session End" hook stamps. **Use `git log` + Linear, not PROGRESS.md.**
- 12 stray `worktree-agent-*` branches in local git, 1 local-only branch `ra-4951-ci-env-stabilisation` never pushed.

### Hidden risks the existing Linear board does not surface
- 🚨 **Supabase RLS disabled on 119 of ~180 prod tables.** Anyone with the anon key (which Next.js ships to the browser) can read or write 119 tables including `User`, `Account`, `Organization`, `UserInvite`, `Notification`, `ChatMessage`, `WebhookEvent`, `StripeWebhookEvent`, `SecurityEvent`, all clinical assessment tables, all integration auth tables (Xero, Ascora, DR/NRPG). **No Linear issue exists for this yet.** This is the single biggest production-readiness gap.
- 🟠 `NODE_TLS_REJECT_UNAUTHORIZED` is set in Production env vars (50d old). Disables TLS cert verification. Likely a debugging leftover; needs immediate audit/removal.
- 🟠 Multi-stage CI workflow `deploy-production.yml` has been **broken since 2026-04-25** (RA-3004 In Progress) — prod deploys haven't fired from CI in 23 days. Deploys are happening via Vercel-from-GitHub-default; the workflow itself never triggers.
- 🟠 Two RA Supabase projects exist; only one (`udooysjajglluvuxkijp`) holds prod data. Confirm `DATABASE_URL` env points at it.
- 🟠 Hermes' "Wiki Enhancement Scan" (07:30 daily) + "Overnight Run Status" (07:45 daily) — both enabled, `last_run_at = None`. Untested.
- 🟠 Hermes' "App Store Monitor" job — malformed, never executed. Either fix or delete.
- 🟢 Authority-graded charter says **Phase 1 (security hardening) is RED** (347× `console.log`, 14× `dangerouslySetInnerHTML`, 9× hardcoded passwords). Last seen in `Pi-Dev-Ops-task3-tmp/.harness/business-charters/projects/restoreassist-charter.md` — verify whether these are pre-existing-known or new since 2026-04-11.

### What the wiki master plan says we're driving toward
From `~/2nd Brain/2nd Brain/Wiki/master-plan-2b-by-2028-v3.md` and `decisions/2026-05-10-empire-overview.md`:
- **Q2 2026 (now):** RA is the empire's #2 priority. SYN-921 (NIR video) is the launch unlock for restoration vertical.
- **Q3 2026:** RA "at baseline" + NRPG 50 founding firms + CARSI S500/S520 live.
- **Q4 2026:** RA at 500 paid technicians + DR multi-tenant beta with 10 pilots.
- **Q2 2027:** RA at 5,000 techs across 2 verticals.
- **30 Jun 2028:** $2B exit target.
- **Pricing decision pending (Fork 7):** $79/tech/mo recommended.
- **RA-2074 (HIGH, Backlog):** "Stay logged in" persistent sign-in is named as an **adoption blocker** for the 500-tech target.

---

## 2. Stages to finish (the roadmap)

Numbered in execution order. Each stage has a single concrete exit criterion; don't move on until it's hit.

### Stage 0 — Unfreeze the trunk (this session, < 1 day)

| Step | Owner | Verify |
|---|---|---|
| Merge `release/sandbox-to-main-2026-05-16-final` → main (or rebase to pick up `0409c17`) | Phill | `git log main | head -3` shows release-branch commits on top of TLS-pinning commit |
| Decide on `.agents/` `.codex/` `AGENTS.md` (gitignore or commit) | Claude proposes, Phill picks | `git status --short` is clean |
| Fix `.claude/PROGRESS.md` hook so it stops appending empty stamps | Claude | next commit doesn't add a "Session End" line |
| GC 12 stray `worktree-agent-*` branches (keep only active ones) | Claude | `git branch | grep worktree-agent | wc -l` < 3 |
| Audit + remove `NODE_TLS_REJECT_UNAUTHORIZED` from Vercel Production env unless documented why it's needed | Phill | `vercel env ls production | grep NODE_TLS_REJECT_UNAUTHORIZED` empty |
| Reconcile RA V2 (Sketch & Property Data) milestones — all six show 100% but RA-2947 is `Todo`. Either fix the milestone status or open work | Claude | Linear project shows accurate progress |

**Exit:** trunk is clean, prod env vars are sane, project tracking matches reality.

---

### Stage 1 — Close the production go-live gate (this week)

**Master ticket:** RA-4956 (P0, Ready for Pi-Dev).

| Sub-issue | Status | Scope |
|---|---|---|
| RA-4951 | In Progress | Stabilise CI Prisma test env — `DATABASE_URL` injection for Vitest integration suites |
| RA-4952 | Ready for Pi-Dev | Fix middleware regressions: expired-trial redirect (307) + unauth pass-through |
| RA-4859 | In Progress | Add `POST /api/inspections/[id]/handover` route — SP-J blocker, terminal CTA after SP-A close |
| RA-4953 | Todo (P1) | Fix Google Drive onboarding smoke (strict locator on "Show confirm password" button) |
| RA-4954 | Todo (P1) | TypeScript route validator drift — clean `.next/dev` types, fix `app/faq` module mismatch |
| RA-4955 | Todo (P1) | Close 4 moderate vulns in `mermaid` dependency chain |
| **NEW — open as P0** | — | **Enable RLS + policies on the 119 unprotected prod tables** (see `./supabase/state.md`). Single biggest production-readiness gap not yet in Linear. |

**Exit:** RA-4956 closes with 100/100 score. `pnpm test:smoke:sandbox` + `pnpm test:integration` + `pnpm type-check` + `pnpm audit --prod --audit-level=moderate` all green from a clean checkout.

---

### Stage 2 — Security cluster cleanup (parallel to Stage 1, 2–3 days)

| Issue | Status | Why it's a pilot-blocker |
|---|---|---|
| RA-2989 | Todo | 6 secrets leaked 2026-05-11 transcript — Anthropic, Linear, OpenAI keys. Rotate all six + audit usage. |
| RA-3009 | In Progress | `/api/admin/seed-demo` on prod uses `?key=` query secret. Replace with `verifyAdminFromDb`. |
| RA-3034 | In Progress | Supabase **SERVICE_ROLE** JWT committed in `Pi-Dev-Ops/scripts/sync_harness_to_supabase.py:22`. Rotate the key, rewrite git history (or accept the exposure permanently). |
| RA-3025 | In Progress | `.npmrc` dropped from main — restore so `npm ci` stops failing. |
| RA-3004 | In Progress | `deploy-production.yml` broken since 2026-04-25 — fix or delete; clarify what triggers prod deploys today. |
| RA-3006 | In Progress | Gitignore the 23 runtime-mutated `.harness/` files (merge-conflict generator). |
| RA-3018 | In Progress | Remove Slack notification step from `deploy-production.yml` (portfolio "No Slack" rule). |
| RA-3012 | In Progress | Wrap `railway variables` with secret-value-stripper. |
| RA-1219 | In Review | `WebhookEvent` external idempotency key + unique index (replay-attack defence). |

**Exit:** zero `audit-finding-2026-05-11` labelled issues open. Secret rotation logged in 1Password.

---

### Stage 3 — Soft pilot (Beyond Clean, 24h window) — Stage 1+2 must be green

**Ticket:** RA-1723 (Phase 5.5, Todo).
- Pick the friendliest pilot. **Recommend Beyond Clean** per runbook.
- Per-pilot A–E checklist + day-1 monitoring (M.1–M.5) from `docs/PILOT_CUTOVER_CHECKLIST.md`.
- Holds for 24h before Stage 4.

**Exit:** RA-1723 done. Monitoring green. No rollback.

---

### Stage 4 — Full pilot rollout (Elite + CRSA)

**Ticket:** RA-1724 (Phase 5.6, Todo). Onboards the remaining 2 pilots in parallel after RA-1723 holds 24h.

**Exit:** RA-1724 done. RA-1718 closes.

---

### Stage 5 — Xero stability sprint — hard deadline 2026-06-20

**Why this date:** ATO EOFY lockout 2026-06-30. After 2026-06-30 any Xero reconciliation failure is a compliance event, not just a support ticket.

**Linear milestone:** "Xero Stability Sprint" on RestoreAssist Compliance Platform project (target 2026-06-20, currently **0% progress**).

| Issue | Title |
|---|---|
| RA-902 | High: `syncInvoiceToProvider` is a stub in-memory queue (verify customer exposure first) |
| RA-868 | xeroTokenManager.ts — centralised token refresh utility |
| RA-869 | xeroAccountCodeResolver.ts — per-category account code routing |
| RA-870 | Fix Xero discount GST bug (taxType none, ABN contact taxNumber) |
| RA-871 | xeroWebhookProcessor.ts — cron route for Xero payment back-sync |
| RA-920 | Medium: Xero stale event rejection blocks sync retries (409 treated as) |

Per board decision 2026-04-14 (RA-923): if ATO deadline <60 days, this sprint moves to Track 2 ahead of architectural fixes. **It's now 33 days out — already past that threshold.**

**Exit:** all six issues Done. End-to-end Xero invoice → payment cycle smoke-tested on a real pilot org.

---

### Stage 6 — App Store / Play Console unblock (parallel, since 2026-04-08)

- **Play Console:** account `airestoreassist@gmail.com`, $25 paid 2026-04-07, restricted since 2026-04-08 over phone + identity verification. **DUNS confirmed** (per wiki `play-console-account.md` 2026-05-15). **Do not create a new account** — escalate the existing one.
- **App Store Connect:** check status (no recent action surfaced in Hermes or Linear).
- **Gmail watch on Play Console / D&B / Apple replies** — already a session-start memory; surface any new replies.

**Exit:** both stores accept fresh build submission.

---

### Stage 7 — Wave 2 implementation (post-pilot, 4–8 weeks)

Specs locked 2026-05-15. **Implementation has not started.**

| Spec | PR # (spec) | Scope |
|---|---|---|
| Customer Portal + Multi-Seat Licensing | #1096, #1097, #1101 | 13 Phill-locked decisions. Strategic wedge vs Encircle / DocuSketch. |
| SP-G AI Setup Agent | #1086 | First-run agent walks the user through workspace setup |
| SP-6 Email Provider BYOK | #1088 | Tenant brings own SMTP (Gmail / Outlook / SES) for outbound mail |
| SP-H Knowledge Substrate | #1089 | Obsidian → pgvector RAG over RA standards corpus |

**Recommend sequencing:** SP-G (lowest risk, biggest activation lift) → SP-6 (gates client-portal emails) → Customer Portal (depends on SP-6) → SP-H (independent, can run in parallel).

**Exit:** all four merged + 30-day prod telemetry shows feature use.

---

### Stage 8 — V2 Floor Plan epic (12–16 weeks)

**Ticket:** RA-2947 (P=2, Todo, Epic). Linked project: "RestoreAssist V2 - Sketch & Property Data".

Differentiator vs Encircle (smartphone scan), Magicplan (single-room), DocuSketch (hardware + rush fees): pre-load the floor plan from `realestate.com.au` / `domain.com.au` **before the tech rolls.** 8 sub-tickets RA-2948 onwards.

Milestones already scoped (M1 Foundation → M6 Reporting & Export). The 100% milestone progress reading in Linear is wrong; **resolve in Stage 0.**

**Exit:** RA-2947 closes. V2 sketch pipeline integrated into report export.

---

### Stage 9 — Adoption blockers from the master plan

From `master-plan-2b-by-2028-v3.md`:
- **RA-2074 (HIGH, Backlog):** "Stay logged in" persistent sign-in. Named as 500-tech-target adoption blocker. **Lift to Active before Stage 7.**
- **Pricing decision (Fork 7):** $79/tech/mo recommended but unlocked. Phill decision required.
- **NRPG founding-firm intro (W2.11)** — first NRPG founding-member intro is on the 14-day plan.
- **PM-Restoration scaffold (W2.1)** — autonomous PM bot for RA pricing, LiDAR, NRPG intake, DR sprint 1. Spec exists; no code.

These are not all sequential — pricing decision can land any time; PM-Restoration is its own track.

---

## 3. Critical-path dependency graph

```
Stage 0 (unfreeze trunk)
   │
   ├─→ Stage 1 (close 100/100 gate)  ──┐
   ├─→ Stage 2 (security cluster)    ──┼─→ Stage 3 (soft pilot RA-1723)
   │                                    │       │
   │   Stage 6 (App Store unblock) ─────┘       └─→ Stage 4 (full pilot RA-1724)
   │   (parallel, since 2026-04-08)                       │
   │                                                       ▼
   │                                              Stage 5 (Xero sprint, due 2026-06-20)
   │                                                       │
   │                                                       ▼
   │                                              Stage 7 (Wave 2 implementation)
   │                                                       │
   │                                                       ▼
   │                                              Stage 8 (V2 Floor Plan)
   │
   └─→ Stage 9 (adoption blockers — RA-2074, pricing, PM-Restoration) — opportunistic, not gated
```

**Hard date:** Stage 5 must complete by 2026-06-20. Stage 5 depends on Stage 4. Stage 4 depends on Stage 3. Stage 3 depends on Stages 1+2. Backwards from 2026-06-20 with 7-day buffer:
- Stages 1+2 done **2026-05-25**
- Stage 3 (24h soft pilot) done **2026-05-27**
- Stage 4 (full pilot) done **2026-05-31**
- Stage 5 buffer starts **2026-06-01**
- 19 days to ship 6 Xero issues — tight but feasible if Stages 1–4 hold the schedule.

If Stage 1+2 slip past 2026-05-25, Xero EOFY is at risk.

---

## 4. Immediate next actions (today / this session)

1. **Decide on `.agents/`, `.codex/`, `AGENTS.md`** — gitignore or commit. (Recommend gitignore — both look like agent-scaffold artifacts.)
2. **Open Linear P0:** "Enable RLS + write policies on 119 prod tables in `restoreassist-prod-2026`." Title sub-issue of RA-4956. Estimate 2–3 days.
3. **Audit `NODE_TLS_REJECT_UNAUTHORIZED`** in Vercel production env vars. Remove if not justified.
4. **Merge `release/sandbox-to-main-2026-05-16-final` → main** (or rebase to pick up `0409c17`). The release branch is sitting 22 commits ahead of itself with main moved ahead independently.
5. **Fix `.claude/PROGRESS.md` hook** so it stops appending empty Session End stamps. Either fix the hook to write substantive entries, or delete it.
6. **Reconcile V2 milestone progress** — all 6 milestones show 100% but RA-2947 epic is `Todo`. Update Linear or open the implementation tickets.
7. **Decide RA Supabase project canonicality** — keep `udooysjajglluvuxkijp` as the single prod DB. Either decommission `oxeiaavuspvpvanzcrjc` or document it.

---

## 5. How this folder is laid out

```
.claude/aggregation/
├── MASTER_PLAN.md           ← this file
├── linear/inventory.md      ← Linear projects + milestones + open P0/P1 issues
├── pi-ceo/inventory.md      ← Pi-CEO board records, specs, runbooks, n8n workflows
├── wiki/inventory.md        ← 2nd Brain wiki pages + decisions + logs touching RA
├── hermes/inventory.md      ← Hermes routines, crons, launch agents, charter
├── vercel/state.md          ← Vercel project, deployments, env-var names, domains
├── github/state.md          ← Repo, open PRs (0), merged PRs (50+), branches, commits
├── supabase/state.md        ← Both Supabase projects, RLS-disabled finding, migrations
└── sources/repo-state.md    ← Local repo: branch, PROGRESS.md status, .claude/ layout
```

Each `inventory.md` / `state.md` is self-contained. Read this MASTER_PLAN first; drill into a specific source only when you need detail.

---

## 6. Open questions for Phill

Things this aggregation can't answer:
1. **Is the wiki master plan still the authoritative roadmap, or has it drifted?** Last update 2026-05-15; 3 days ago.
2. **Which pilot goes first** — Beyond Clean (recommended), Elite, or CRSA?
3. **Pricing — $79/tech/mo go/no-go?** Wiki Fork 7 names this as a load-bearing decision.
4. **Decommission or keep `oxeiaavuspvpvanzcrjc` Supabase project?**
5. **`NODE_TLS_REJECT_UNAUTHORIZED` in prod env — historical leftover or deliberate?**
6. **Is the broken `deploy-production.yml` workflow still needed** if Vercel-from-GitHub is doing the actual deploys?

These are decision-asks, not investigation-asks. The investigation is done.
