---
type: grill
component: tenant-db-provisioning-onboarding
sketch: RA-6873 + docs/superpowers/specs/2026-07-01-cutover-onboarding-flow-spec.md
status: resolved
created: 2026-07-01
---

# Grill transcript — tenant-DB provisioning + sticky-free onboarding (RA-6873)

Interviewed one question at a time; /judge convergence pass reshaped the final scope.

## Q1: What does v1 of "provision" do?
**Recommendation:** BYO-string only, defer provision-for-me.
**Answer:** Supabase (provision-for-me via Supabase, in scope).
**Resolution:** DECIDED — provisioner = Supabase.

## Q2: Whose Supabase org holds the project + who pays?
**Recommendation:** Client's own org, client pays (only option that meets the cost goal).
**Answer:** Client has their own Supabase account, linked to the system.
**Resolution:** DECIDED — client-owned + client-paid.

## Q3: How does the client link — OAuth auto-provision (A) or guided create + paste (B)?
**Recommendation:** B for v1 (ships on the built DatabaseCard; no OAuth app).
**Answer:** B now for v1.
**Resolution:** DECIDED — guided create + paste connection string. (A → RABBIT HOLE.)

## Q(codebase): How does the worker test + migrate?
**Resolved by codebase (not asked):** Vercel-cron endpoint (existing `app/api/cron/*` + `vercel.json` crons pattern) that `$connect`-tests the pasted string and applies the tenant baseline as **direct SQL** — never spawns `prisma migrate deploy` in serverless (it hangs on Vercel). Future schema changes use the migrate-fan-out job.
**Resolution:** DECIDED (codebase).

## Q4: G2 read/write scope?
**Recommendation:** Narrow — only first-claim create + its own detail view route through one `resolveInspectionDb(workspace)` accessor (tenant if `ready`, else shared); other ~145 read sites incremental.
**Answer:** (User pivoted to the assistant idea; default taken.)
**Resolution:** DECIDED (default, revisit) — narrow first-claim create+view; write-only = NO-GO (tech couldn't see their claim).

## Q5: Sticky-free setup — MCP or CLI?
**Recommendation:** Shared setup-tools layer → in-app BYOK assistant primary + MCP; CLI later.
**Answer:** default — shared tools layer, in-app assistant primary.
**Resolution:** DECIDED — then REVISED by /judge (see below).

## Q6: Assistant autonomy — execute, or propose-and-confirm?
**Recommendation:** Read-only auto; every mutating step (connect/store, migrate, teardown) proposed + owner-confirmed.
**Answer:** default — propose + confirm on mutating steps.
**Resolution:** DECIDED.

## Q7: v1 scope — whole onboarding or just DB-connection?
**Recommendation:** DB-connection flow only; extensible layer for the rest.
**Answer:** "easiest for non-technical people with the assistance of YouTube and LLM."
**Resolution:** DECIDED — v1 = DB-connection flow, optimised for non-technical owners via YouTube tutorials + LLM assist.

## /judge convergence (82/100 → REDUCE SCOPE)
Load-bearing finding: the BYOK layer has **no tool-calling** (`lib/ai/` grep = zero `tool_use`/`tools:`) — so "the LLM assistant *executes* setup tools" needs net-new agentic infra, and is the least-testable, highest-risk, most-complex part. The "easiest for non-technical" goal is ~80% already built (DatabaseCard + db-tutorials + validation).
**Resolution:** REDUCE SCOPE — drop LLM-tool-execution from v1; the in-app assistant becomes an APPROVE-EXPERIMENT after BYOK tool-calling is built + proven. Reshaped v1 scores ~93 (APPROVE BUILD).

---

## Final state

**Decided (v1 scope):**
- Provisioner = **Supabase**, **client-owned + client-paid**, linked by **guided create + paste connection string** (uses the shipped `DatabaseCard`).
- **Guided sticky-free flow (no LLM tool-execution):** surface the DB-type `db-tutorials` (YouTube/doc links) inline in the card + inline validation + masked "connected to host X" confidence signal + clear error + Retry + **confirm-before-migrate**.
- **Provisioning worker** = Vercel-cron, `$connect`-test + **direct-SQL** tenant-baseline apply → `ready`/`error` (resumable). No `prisma` CLI in serverless.
- **G2 (narrow):** first-claim create + its detail view route via one `resolveInspectionDb(workspace)` accessor, gated by `tenantDbStatus`.

**Rabbit holes (revisit):**
- In-app **BYOK LLM assistant** + shared setup-tools layer + **MCP** → EXPERIMENT after BYOK tool-calling exists and is proven.
- **OAuth auto-provision** into the client's Supabase org (Management API) — the seamless "provision-for-me".
- **CLI** surface.
- The other **~145 Inspection read-serving sites** → incremental cutover behind the same accessor.
- Q4 G2 scope — confirm the narrow default holds when building.

**No-gos (excluded):**
- LLM **autonomously executing** DB-mutating tools (must be propose + owner-confirm).
- G2 **write-only** (reads must cut over too, or the tech can't see their own claim).
- Provisioning in **our** Supabase org that **we absorb** (inverts the cost goal).

**Appetite:** ~1w for the buildable v1 (guided-flow polish is 2–3d; provisioning worker + narrow G2 are gated on owner shared-DB creds + the pilot's real parity run).

**Next step:** update `docs/superpowers/specs/2026-07-01-cutover-onboarding-flow-spec.md` to the reduced scope; keep RA-6873 for the worker + G2; file a separate EXPERIMENT issue for the BYOK-tool-calling LLM assistant.
