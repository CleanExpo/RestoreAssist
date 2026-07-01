# Session Handoff

_Updated 2026-07-01 via /session-handoff. Repo: RestoreAssist (CleanExpo/RestoreAssist)._

## 1. Summary of what was done

- **Resumed** from the branded-reports/floorplan PR5 handoff, then ran two programs to a clean stop.
- **Branded-reports + floorplan program — COMPLETE, all merged + prod-green:** PR4b (upload-on-apply #1532 · reposition/scale + lock-aspect #1533 · report freshness #1534) and PR5 Premium gating (#1535).
- **Client-owned CRM database program — STARTED, 3 slices merged + prod-green:** tenant-DB pilot core (#1536, seam proven on real Postgres), cutover onboarding G1 (#1537), guided sticky-free flow v1 (#1538).
- **Tooling:** authored + installed a new `/storm` skill (Stanford multi-perspective audit); enhanced `/judge` to converge to a real 100/100 (Pi-Dev-Ops PR #410, merged to Pi origin/main).
- **Shaping:** grill → judge → reduced-scope on the next task; Linear updated (project status + RA-6873 + RA-6875).
- **Not touched / deferred:** provisioning worker + G2 write-cutover (owner-gated); explainer video render; tutorial curation; the LLM setup assistant (experiment).

## 2. Where it started

- **Original request:** resume the branded-reports program (PR5 pending), then pull Pi-CEO-Dev PR#400 + install updates. Escalated into completing branded-reports and building the client-owned-DB program.
- **Starting branch:** main. **Starting area:** `lib/reports/*`, sketch components, `app/api/reports/[id]/pdf`.
- **Constraints:** rule 18 (no auto-merge; each merge was user-authorized); no local prod DB; TLS-proxied registry; Phill Rule 1 (no net-new lucide imports); no emojis; no-false-truths / proof-discipline.

## 3. Decisions locked + what shipped

**Decisions locked**
- PR5 entitlement = **Included in Premium** (owner decision). Evidence: PR #1535 merged.
- Client DB architecture = **control-plane / data-plane split** — our DB keeps the tenant account; each client's own Postgres holds their CRM. Evidence: grill + specs.
- Provider = **Supabase, client-owned + client-paid, guided create + paste** (BYO string; OAuth auto-provision deferred). Evidence: grill 2026-07-01.
- v1 setup = **guided flow, NO LLM tool-execution** (BYOK layer has no tool-calling; assistant → EXPERIMENT RA-6875). Evidence: `/judge` 82→REDUCE SCOPE.

**What shipped**
- **Branch:** main (all work merged).
- **Commits (this session, merged):** #1532–#1535 (branded reports), #1536 (pilot core), #1537 (cutover G1), #1538 (guided flow). Pi-Dev-Ops #410 (judge).
- **Behaviour change:** reports embed floorplan + photos + firm branding (Premium-gated scrape); onboarding has a Connect-Your-Database guided step (DB-type tutorials, inline validation, confirm-before-connect, host confidence signal); tenant-DB seam + schema exist behind `tenantDbStatus` (default `none` = today's behaviour).
- **User-facing:** the floorplan/branded report; the guided DB-connect card. **Internal:** `lib/tenant/*` (resolver, provision state machine, parity, outbox, onboarding-helpers), `prisma/tenant/*`, `lib/learn/db-tutorials`, `Workspace.tenantDbStatus`/`tenantDbConnectionEnc`.

## 4. Key files

| File | Status | Why it matters | Next owner |
|---|---|---|---|
| `lib/tenant/provision.ts` | Created (merged) | Provisioning state machine — the worker's core logic | RA-6873 |
| `lib/tenant/resolve-tenant-db.ts` | Created (merged) | Per-tenant client resolver (LRU + pooled) | RA-6873 |
| `lib/tenant/onboarding-helpers.ts` | Created (merged) | Validator, first-claim gate, host signal | — |
| `components/setup/DatabaseCard.tsx` | Modified (merged) | The guided connect UI | — |
| `prisma/tenant/schema.prisma` + `prisma/tenant/migrations` | Created (merged) | Data-plane schema (deploy per-tenant) | RA-6873 |
| `docs/superpowers/specs/2026-07-01-cutover-onboarding-flow-spec.md` | Modified | The spec (reduced v1 scope) | RA-6873 |
| `docs/superpowers/grills/2026-07-01-tenant-db-onboarding-grill.md` | Created | Resolved decision tree | RA-6873 |
| `.claude/snapshots/last-task.md` | Modified | This handoff | next agent |

## 5. Running state

- **Branch:** main @ `bbe2d2bc`, in sync with origin/main. **Working tree:** clean (only untracked `.claude/snapshots/`).
- **Local server / background processes:** none running (all CI monitors stopped).
- **Open PR/issue:** no open PRs. Linear: **RA-6873** (worker + G2, High, Backlog), **RA-6875** (LLM assistant EXPERIMENT, Low, Backlog).
- **Environment:** no local prod DB (Docker Postgres works on a free high port — 5432 is squatted); prisma generate needs `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **Known blockers:** RA-6873 needs owner shared-DB read creds + Supabase confirm.
- **Safe to stop:** Yes — everything merged + prod-green; nothing in flight.

## 6. Verification — how to confirm things still work

**Type + unit (touched areas)**
```bash
cd /d/RestoreAssist
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL="" DATABASE_URL="" npx vitest run lib/tenant/__tests__/ lib/learn/__tests__/ components/setup/__tests__/ "app/api/onboarding/database/__tests__/"
```
**Gates (these gate CI — check before any commit)**
```bash
pnpm check:standards && pnpm check:no-verbatim && pnpm run check:no-emoji && bash .github/scripts/design-md-lint.sh
```
**Schemas**
```bash
DATABASE_URL="postgresql://u:p@localhost:5432/db" DIRECT_URL="postgresql://u:p@localhost:5432/db" NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma validate
TENANT_DATABASE_URL="postgresql://u:p@localhost:5432/t" NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma validate --schema=prisma/tenant/schema.prisma
```
**Smoke:** Not applicable locally — prod validated by Vercel prod build + Deployment Parity Check (all green through `bbe2d2bc`).

## 7. Deferred + open questions

**Deferred**
- **Provisioning worker + G2 (RA-6873)** · Owner: next agent (needs creds) · Blocking the "clients actually use their own DB" outcome.
- **Explainer video render** · Owner: Phill (render cost/brand) · Non-blocking; storyboards parked at `.harness/remotion/ra-byodb-onboarding-2026-07-01/`.
- **Setup-aware YouTube tutorial curation** (real video IDs) · Owner: Phill · Non-blocking.
- **In-app BYOK-LLM assistant + MCP (RA-6875)** · Owner: next agent · Non-blocking (experiment; needs BYOK tool-calling first).

**Open questions**
- **Supabase provider confirm + shared-DB read creds** · Owner: Phill · Blocking RA-6873.
- **G2 read scope** (narrow first-claim vs wider) · Owner: next agent · Confirm when building.

## 8. Pick up here

```text
Start here:
1. Read this handoff + memory (byo-client-db-program.md) + the grill/spec.
2. If Phill supplied shared-DB creds + Supabase confirm -> build RA-6873 (provisioning worker: Vercel-cron that tests + direct-SQL-migrates the pasted Supabase string -> ready; then narrow G2 via resolveInspectionDb accessor). TDD; green-before-commit; PR, do not merge.
3. Prove on an ephemeral Docker Postgres (free high port, e.g. 55432; apply prisma/tenant migration.sql directly -- `prisma migrate deploy --schema=prisma/tenant` wrongly picks up the MAIN migrations dir).

Do not redo:
- Branded reports (PR1-4, PR4b, PR5 -- merged), pilot core (#1536), cutover G1 (#1537), guided flow (#1538) -- all merged + prod-green.

First command to run:
git -C /d/RestoreAssist log origin/main --oneline -5
```

## 9. Risk notes

- **CI gotchas (both hit this session, now known):** a net-new `lucide-react` import fails DESIGN.md lint (Phill Rule 1 — use `marks.tsx` or drop icons); any emoji (incl. a check-mark) fails `check:no-emoji`. Run both gates locally before committing.
- **Prisma-in-serverless:** the worker must NOT spawn `prisma migrate deploy` (it hangs on Vercel) — apply tenant baseline via direct SQL.
- **BYOK has no tool-calling** — the LLM assistant (RA-6875) is unbuilt infra, not a quick add.
- **Local prod DB creds are stale** — migrate via CI, not this box. Deployment Parity Check is the authoritative prod signal.

## 10. Handoff quality check

- No unsupported shipping claims — every "merged" is a real PR number, prod-green via Deployment Parity.
- No fake verification — commands listed to run; suite numbers were real run output this session.
- No hidden "still running" — all monitors stopped; tree clean; no open PRs.
- Branch/state explicit (main @ bbe2d2bc, in sync, clean).
- Deferred (RA-6873/6875, videos) separated from completed (the 8 merged PRs).

Handoff complete. Next safe action: on Phill's shared-DB creds + Supabase confirm, build RA-6873 (provisioning worker + narrow G2) TDD-first.
