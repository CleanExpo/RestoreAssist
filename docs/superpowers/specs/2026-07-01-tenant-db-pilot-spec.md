# SPM Spec — Client-Owned CRM Database: Read-Shadow Pilot

> Produced by `/storm` → `/judge` → `/spm` on 2026-07-01. Scope: the smallest safe,
> reversible slice that proves the per-tenant data-plane seam before any write cutover.

## 1. Task being planned
- **Original request:** "Clients use their own DB and Storage" — our DB holds the client's (tenant's) account details; the client's DB holds their CRM/customers.
- **Interpreted task:** Prove the control-plane / data-plane split on a single tenant and a single model (`Inspection`) via a **read-shadow behind a feature flag** — not a full cutover.
- **Target outcome:** One flagged non-production workspace's `Inspection` rows live in an isolated per-tenant Postgres, kept in sync, and served-read verified byte-for-parity against the shared DB, with flag-off returning to exactly today's behaviour.
- **Non-build clarification:** This spec plans; it does not implement. Full model routing (147 `.inspection.` sites) and write cutover are explicitly out of scope.

## 2. Current project context
- **Repo:** CleanExpo/RestoreAssist · **Branch:** main @ `a903893f` · **Tree:** clean (untracked `.claude/snapshots/`).
- **Relevant systems:** single global `PrismaClient` off one `DATABASE_URL` (`lib/prisma.ts:34`); per-workspace encrypted credential store `ProviderConnection` + `credential-vault` (`schema.prisma:5851`); prod migrations via `prisma migrate deploy` in `scripts/build.sh:23`.
- **Blast radius measured:** `.inspection.` queried at **147 sites** (`app/api`,`lib`) → full-model routing is NOT a pilot.
- **Existing skills found:** `/storm`, `/judge`, `/spm`, `/session-handoff` (`~/.claude/skills`).
- **Known behaviour:** all tenants share one Postgres; `Inspection.workspaceId` FKs `Workspace` (`schema.prisma:2024`).
- **Unknowns:** target tenant-DB engine/host (assumed you-provision, confirmable); serverless connection-pool ceiling per tenant.

## 3. Problem statement
- **User:** you (platform owner) + restoration-company tenants.
- **Pain:** all CRM PII co-located in one shared DB; your Supabase bill carries every tenant's rows; no per-tenant data isolation.
- **Current workaround:** row-level `workspaceId` scoping — shared blast radius, shared cost.
- **Business impact:** cost carried by you; weaker isolation/data-residency story for security-sensitive clients.
- **Technical impact:** 71 cross-plane FK refs assume one DB; no routing/provisioning/migration-fan-out exists.
- **Why now:** you want the seam proven before committing to the platform change.

## 4. Desired outcome
- **User-facing:** none this phase (read-shadow is invisible; serving unchanged).
- **Internal:** a working `resolveTenantDb(workspaceId)` seam, one provisioned tenant DB, one-way `Inspection` sync, and an automated **read-parity report** proving tenant-DB reads equal shared-DB reads for the flagged workspace.
- **Success:** parity check passes for 100% of the flagged workspace's inspections; flag-off path provably identical to today; provision + migrate + rollback each demonstrated.
- **What must not happen:** no write reroute; no change to any non-flagged workspace; no cross-DB FK; no plaintext connection strings; no silent divergence between shared and tenant data.

## 5. Scope
### In scope
- `resolveTenantDb(workspaceId)` tenant-client factory (LRU-cached, idle-evicted).
- Separate `prisma/tenant/schema.prisma` containing **only** `Inspection` + a one-way `user_ref(id,name,email,role)` mirror.
- Provision job (one tenant DB), baseline migrate, encrypted connection string in `ProviderConnection`.
- One-way backfill + outbox-driven sync of the flagged workspace's `Inspection` rows.
- A read-parity harness (compare tenant-DB vs shared-DB reads) behind a per-workspace flag.
### Out of scope
- Write reroute; the other 193 models; the 147 `.inspection.` serving sites; cross-tenant admin analytics rollup; token-portal resolution; storage.
- **Client explainer videos** — a hard gate on the *cutover* phase, NOT the pilot (see Client-cutover dependencies below).

### Client-cutover dependencies (downstream of this pilot — recorded so they aren't lost)
- **Explainer videos are REQUIRED before any client deploys their first claim on their own DB.** Produced via the Synthex Remotion package (`/remotion-video` → `remotion-orchestrator`, single Synthex ElevenLabs voice + brand-config). Minimum set: (1) "Connect your database" (provisioning/connection setup), (2) "How your data stays isolated" (the security/ownership story), (3) "Deploy your first claim" (the first-claim walkthrough). Gated on the client onboarding flow existing — there is nothing to narrate until then. Owner-confirm the set + brand before render (renders cost ElevenLabs + Remotion compute).
- **Setup-aware learning area (curated YouTube tutorials).** In the learning area, surface third-party "how to connect your database" tutorials **conditioned on the client's chosen DB type** (Supabase / AWS RDS / Neon / self-hosted Postgres / …) — a `dbType → curated tutorial set` map, shown alongside our own explainer videos. Complements (does not replace) the explainers: ours = the RestoreAssist flow; these = vendor-specific DB setup. Maintenance note: external links can rot — store curated IDs + a periodic link-check, and prefer official-vendor channels. Gated on the learning area + DB-setup flow existing.
### Explicit non-goals
- No 100/100 "full platform" claim. This proves the seam only.
### Assumptions (confirmable)
- **DB hosting:** you-provision an isolated managed Postgres per tenant.
- **Legal DPA:** tracked as an owner task, not built here.
### Constraints
- No local prod DB creds (`memory: restoreassist-local-env`); migrations run via CI/provision job. Rule 18: no auto-merge to main.

## 6. Existing capability review
| Capability | Location/source | Reusable? | Notes |
|---|---|--:|---|
| Encrypted per-workspace credential store | `schema.prisma:5851` `ProviderConnection`; `lib/credential-vault.ts` | Yes | Home for the tenant connection string — do NOT build new secrets store |
| Global Prisma client pattern | `lib/prisma.ts:34` | Yes (extend) | Add a tenant factory alongside; don't replace |
| Migration deploy pipeline | `scripts/build.sh:23` | Partial | Reuse `migrate deploy`; add per-tenant target |
| Outbox/event pattern | (absent) | No | New, minimal, scoped to `Inspection` only |
| BYOS storage provider | `schema.prisma:897` | Not this phase | Storage is a separate project |

## 7. Specialist board review
| Role | Finding | Risk | Recommendation |
|---|---|---|---|
| Product Manager | Read-shadow delivers no user value alone; it's risk-reduction | Low | Frame as internal proof gate, not a release |
| Software Architect | Tenant factory + separate schema is the right seam; single-tenant DB voids the 71-FK problem | Med | Keep `user_ref` one-way + reconciled |
| UX/UI | No UI; only an internal parity dashboard/log | Low | Emit a machine-readable parity report |
| Security | N connection strings = blast radius; mirror can leak identity | Med | Per-tenant key derivation; `user_ref` minimal fields only |
| QA/Test Lead | Needs a real second test DB; parity must be exact | Med | Provide an ephemeral tenant Postgres in CI |
| Devil's Advocate | Storage cutover may be the better first project for the cost goal | Med | Proceed with pilot; revisit storage-vs-DB after seam is proven |

## 8. Judge challenge (convergence pass — real fixes, honest ceiling)
| Category | Score | Notes |
|---|--:|---|
| First-source evidence | **25/25** | Was 24 (PARTIAL). Closed with official Prisma docs on multi-client connection-pool exhaustion in serverless (§11) → SUPPORTED, not asserted |
| Clear user/business problem | **19/20** | De-risks a real owner-driven cost+security initiative before a large spend = genuine (indirect) business value. Last point inherently held — a pilot ships no user-facing feature |
| Reuse of existing capability | 15/15 | Reuses `ProviderConnection`/`credential-vault`/migrate pipeline |
| Security/privacy safety | **15/15** | Was 14. Closed with per-tenant envelope encryption (§12) → a single control-plane compromise no longer yields all connection strings under one key |
| UX clarity | 9/10 | Capped — an internal read-shadow has no user surface; the parity report is the only interface. Not honestly a 10 |
| Testability | 10/10 | Parity is objectively checkable; flag-off reversible |
| Cost/control simplicity | 5/5 | One tenant, one model, flag-gated, reversible |
| **Total** | **98/100** | **APPROVE BUILD** |

**Decision: APPROVE BUILD** (flag-gated, reversible pilot).

**Honest ceiling (per the `/judge` convergence rule — no fabricated 100):** the remaining **2 points** (business 20, UX 10) are *structurally* held by what a pilot **is** — internal risk-reduction with no user-facing surface. They cannot be earned by editing the spec; only by **expanding scope** to a real tenant cutover that delivers user-visible isolation — which this pilot deliberately defers. A literal 100 here would be inflation. **98 is the true ceiling for this scope; the path to 100 is the next project (first real cutover), not a wording change.**

## 9. Proposed solution
### User flow
None. Internal only; serving path unchanged for every workspace.
### System flow
Request for flagged workspace → serve `Inspection` from shared DB (unchanged) → **in parallel** read the same rows via `resolveTenantDb(workspaceId)` → assert equality → emit parity result. Flag off → tenant path never runs.
### Data flow
Shared DB = source of truth. Backfill copies the flagged workspace's `Inspection` rows to the tenant DB; an outbox row per `Inspection` write drives ongoing one-way sync. `user_ref` mirror synced one-way from control plane.
### Permission flow
Tenant connection string decrypted from `ProviderConnection` via `credential-vault`; only server-side; never sent to client.
### Failure flow
Tenant DB unreachable / parity mismatch → log + increment a mismatch metric → serving is unaffected (shared DB authoritative). Repeated mismatch quarantines the workspace from the pilot (flag auto-off).
### Rollback path
Flip the per-workspace flag off → tenant path dormant; drop the tenant DB. Zero data loss (shared DB untouched throughout).

## 10. UX requirements
No end-user UX. Internal: a parity report (JSON + log line) with entry point (a script/endpoint), "no rows yet" empty state, in-progress state, mismatch error state with the offending inspection id, and a clear pass/fail summary.

## 11. Technical requirements
- **New files:** `lib/tenant/resolve-tenant-db.ts` (factory+cache); `prisma/tenant/schema.prisma` + baseline migration; `lib/tenant/inspection-parity.ts`; `scripts/provision-tenant-db.ts`; `lib/tenant/inspection-outbox.ts`.
- **Changed files:** `Inspection` write sites gain an outbox emit (scoped, additive) — NOT the 147 read sites.
- **Schema impact:** additive control-plane columns for pilot flag + tenant-DB registration on `Workspace`; new tenant schema (separate history).
- **Config/env:** per-tenant connection string (encrypted, not env); pilot flag.
- **Backward compatibility:** flag-off ≡ today. No read serving changes.
- **Performance / connection safety (first-source):** official Prisma docs — *"Creating multiple instances of `PrismaClient` can exhaust your database connection pool, especially in serverless or edge environments"* (prisma.io/docs · query-optimization). Therefore the tenant factory MUST: (a) bound the client cache (LRU + idle eviction), and (b) use a **per-tenant pooled connection URL** (Supabase pooler / pgbouncer), never a raw connection per invocation. This is a hard requirement, not a nicety.
- **Observability:** parity pass/mismatch counter; provision/migrate logs.

## 12. Security and privacy requirements
- Connection string encrypted at rest (`credential-vault`, AES-256-GCM) under a **per-tenant data key** (envelope encryption; the tenant key wraps the connection string, a KMS/root key wraps the tenant key). A single control-plane compromise therefore does **not** yield all tenant connection strings with one key — it closes the "N strings, one key" blast-radius. Decrypt server-side only.
- `user_ref` mirror carries minimal identity (id, name, email, role); one-way; reconciled to prevent drift.
- No cross-DB FK. No plaintext secrets in logs. Audit provision + flag flips.
- Destructive-action control: dropping a tenant DB requires explicit owner confirmation.

## 13. Verification plan
### Static checks
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` · `npx eslint <changed>` · `pnpm check:standards && pnpm check:no-verbatim`
### Unit tests
`resolveTenantDb` cache/eviction; parity comparator (equal → pass, diff → mismatch with id); outbox emit shape.
### Integration tests
Against an ephemeral tenant Postgres: provision → migrate → backfill → parity == 100% for a seeded workspace; flag-off → tenant path not invoked.
### UI/browser verification
N/A (no UI).
### Smoke tests
Provision job dry-run; parity report on a seeded fixture.
### Manual review
Confirm no non-flagged workspace touches the tenant path (grep the flag guard).
### Evidence required before done
Parity report showing 100% match for the flagged workspace; a demonstrated rollback (flag off → tenant path dormant); green tsc + unit + integration + gates. **Do not claim pass without the actual report output.**

## 14. Loop testing and stress testing
Normal: seeded workspace parity 100%. Edge: inspection updated mid-sync (outbox eventual-consistency window bounded + re-checked). Malformed: corrupt tenant row → mismatch surfaced, serving unaffected. Large: backfill N=10k inspections. Empty: workspace with zero inspections → empty parity pass. Duplicate: outbox idempotency (same inspection twice → one tenant row). Permission failure: bad connection string → provision fails loudly, no half-state. Network failure: tenant DB down → serving unaffected, mismatch metric flat (skips, not fails). Regression: non-flagged workspaces unchanged. Human checkpoint: owner reviews parity report before any write-cutover spec.

## 15. Acceptance criteria
- [ ] `resolveTenantDb(workspaceId)` returns a cached tenant `PrismaClient` from the encrypted `ProviderConnection`; unit-tested cache + idle eviction.
- [ ] `prisma/tenant/schema.prisma` contains only `Inspection` + `user_ref`, with its own migration applied to a provisioned tenant DB.
- [ ] One flagged non-prod workspace's `Inspection` rows are backfilled + kept in one-way sync via outbox (idempotent).
- [ ] Automated parity report shows **100%** read-equality (shared vs tenant) for the flagged workspace, with any mismatch naming the inspection id.
- [ ] Flag-off is provably identical to current behaviour (test asserts the tenant path is never invoked).
- [ ] Rollback demonstrated: flag off → tenant path dormant; tenant DB droppable with no shared-DB impact.
- [ ] No cross-DB FK exists; no plaintext connection string in code, logs, or client payloads.
- [ ] tsc 0 errors on changed files; unit + integration suites green; standards + no-verbatim gates pass.

## 16. Goal command
```text
/goal Implement the accepted SPM spec for the Client-Owned CRM read-shadow pilot. Completion condition: parity report shows 100% Inspection read-equality for one flagged non-prod workspace between the shared DB and a provisioned per-tenant DB, with flag-off proven identical to current behaviour and rollback demonstrated. Required proof: the parity report output, passing unit+integration tests against an ephemeral tenant Postgres, green tsc + standards + no-verbatim, and a grep proving no non-flagged workspace touches the tenant path. Constraints: no write reroute; do not touch the 147 Inspection read-serving sites; no unrelated files; no secrets in code/logs; no cross-DB FK; stop and produce /session-handoff if blocked by missing tenant-DB provisioning credentials or destructive-migration approval.
```

## 17. Implementation sequence
1. **Inspect** — Objective: confirm outbox insertion points for `Inspection` writes. Files: `Inspection` write sites. Checks: list of write sites. Stop: >a handful of write sites unexpectedly.
2. **Add tenant seam** — Objective: `resolveTenantDb` + `prisma/tenant` schema + provision script. Files: `lib/tenant/*`, `prisma/tenant/*`, `scripts/provision-tenant-db.ts`. Checks: unit tests green; provision dry-run. Stop: connection-pool ceiling unclear.
3. **Sync + parity** — Objective: backfill + outbox + parity harness. Files: `lib/tenant/inspection-outbox.ts`, `inspection-parity.ts`. Checks: integration parity 100% on seed. Stop: parity <100%.
4. **Stress test** — Objective: run §14 cases. Checks: all pass; mismatches surfaced not swallowed. Stop: any silent divergence.
5. **Judge final** — Objective: re-`/judge` the built result vs this spec. Checks: ≥85. Stop: <85.
6. **Session handoff** — Objective: `/session-handoff` with parity evidence + write-cutover deferral.

## 18. Session handoff seed
Planned the read-shadow pilot for the client-owned CRM DB: one flagged workspace, `Inspection` only, tenant DB provisioned + synced one-way, read-parity proven, serving unchanged. Key files: `lib/tenant/resolve-tenant-db.ts`, `prisma/tenant/schema.prisma`, `lib/tenant/inspection-parity.ts`, `scripts/provision-tenant-db.ts`. Expected verification: 100% parity report + flag-off identity + rollback. Deferred: write cutover, the 147 serving sites, other 193 models, storage, cross-tenant analytics, token-portal resolution, the legal DPA (owner task), and the client explainer-video set (`/remotion-video`) — REQUIRED before any client's first claim, gated on the onboarding flow. Pickup: run the `/goal` in §16.

## 19. Final recommendation
**Approve experiment / Proceed to implementation** — this is a reversible, flag-gated pilot that proves the per-tenant seam (routing, provisioning, migration, sync, parity, rollback) before the expensive 71-FK / 147-site cutover.

```text
SPM spec complete. Next safe action: on your go, run the §16 /goal to build the read-shadow pilot (flag-gated, reversible, no serving changes).
```
