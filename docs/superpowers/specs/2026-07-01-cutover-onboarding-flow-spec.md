# SPM Spec — Cutover Onboarding Flow (Connect-Your-Database → First Claim)

> `/spm` with judge-convergence, 2026-07-01. Extends the merged tenant-DB pilot core
> (`lib/tenant/*`, `prisma/tenant/*`) into the client-facing onboarding a restoration
> company walks before deploying their first claim on their own database.

## 1. Task being planned
- **Original request:** spec the cutover onboarding flow (authority to author/revise the spec granted).
- **Interpreted task:** the client-facing wizard step where a tenant **connects/provisions their own CRM database**, sees it's isolated, and reaches **their first claim** — wiring the merged pilot core into a real UI.
- **Target outcome:** a new "Connect your database" step in the existing setup wizard that provisions-or-accepts a tenant DB, tests + baseline-migrates it, stores creds encrypted, and gates first-claim on DB-ready; the learning area surfaces the explainer videos + DB-type tutorials.
- **Non-build clarification:** plan only; no code until accepted.

## 2. Current project context
- **Repo/branch:** RestoreAssist, main @ `6035ac48` (pilot core merged).
- **Existing scaffolding to extend (do NOT greenfield):** `components/setup/SetupShell.tsx` + card wizard (`StorageCard` = the provision-vs-BYO pattern to mirror; `VideoExplainer.tsx` = the explainer-video slot); `app/setup/`, `app/onboarding/account-type`, `app/api/onboarding`, `app/api/setup`; learning area `app/dashboard/learn`.
- **Pilot core available:** `resolveTenantDb()`, `prisma/tenant` schema + migration, `inspection-outbox`, `inspection-parity`; per-workspace encrypted `ProviderConnection` + `credential-vault`; `Workspace.storageProvider` BYOS fields.
- **Known behaviour:** `StorageCard` is partly UI-only (`components/setup/StorageCard.tsx:64` "UI-only for now"). Inspection writes currently hit the shared DB.
- **Unknowns:** which managed-Postgres provider you-provision uses; exact first-claim entry after setup.

## 3. Problem statement
- **User:** a restoration-company owner onboarding to RestoreAssist.
- **Pain:** to get the cost/security benefit of their own DB, they need a guided, safe way to connect it — without a DBA.
- **Current workaround:** none; the shared DB is implicit today.
- **Business impact:** unlocks the cost-off-your-books + per-client isolation story at signup.
- **Technical impact:** first client-facing consumer of the tenant-DB seam.
- **Why now:** the pilot proved the seam; the onboarding is the value delivery.

## 4. Desired outcome
- **User-facing:** a clear "Connect your database" step (provision-for-me default, or paste a connection string) → tested → isolated → "you're ready", then a guided first claim; the learning area shows the 3 explainer videos + DB-type tutorials.
- **Internal:** workspace marked tenant-DB-ready only after a real connectivity + baseline-migration pass; creds envelope-encrypted; first-claim gated on ready.
- **Success:** a fresh tenant can go signup → connected+isolated → first claim saved to *their* DB, with recovery at every failure.
- **What must not happen:** a "connected" state that isn't really reachable/migrated; any plaintext connection string; first-claim writes lost or mis-routed; a non-ready workspace silently using the shared DB when it thinks it's isolated.

## 5. Scope
### In scope
- New `DatabaseCard` in `SetupShell` (mirror `StorageCard`): provision-for-me | bring-your-own connection string.
- `POST /api/onboarding/database` — validate → test connectivity → run tenant baseline migration → store encrypted → mark ready. Idempotent.
- Wire `VideoExplainer` slot to the (parked) explainer set; `app/dashboard/learn` to a `dbType → curated YouTube tutorial set`.
- First-claim gate: block "deploy first claim" until tenant-DB-ready; success routes the write through `resolveTenantDb`.
### Out of scope
- Migrating the other 193 models / the 147 Inspection read-serving sites (that's the broader cutover); rendering the videos (parked); provisioning-provider selection UI beyond the default.
### Explicit non-goals
- No multi-DB-engine support beyond Postgres in v1.
### Assumptions (confirmable — authority granted to set)
- DB hosting default = **you-provision** managed Postgres per tenant; BYO-connection-string as the alternate.
- The write-cutover for first-claim depends on the **pilot's real flagged-workspace parity** passing first (owner shared-DB creds) — see §8 dependency.
### Constraints
- No local prod DB; provisioning/migrations run server-side/CI. Rule 18 (no auto-merge). Envelope encryption via `credential-vault`.

## 6. Existing capability review
| Capability | Location | Reusable? | Notes |
|---|---|--:|---|
| Card wizard shell | `components/setup/SetupShell.tsx` | Yes | Add `DatabaseCard` alongside the others |
| BYOS provision-vs-BYO UX | `components/setup/StorageCard.tsx` | Yes (mirror) | Same two-option pattern; finish its UI-only stub separately |
| Explainer-video slot | `components/setup/VideoExplainer.tsx` | Yes | Host the 3 parked explainers |
| Tenant seam | `lib/tenant/*`, `prisma/tenant/*` | Yes | The provisioning target + routing |
| Encrypted cred store | `ProviderConnection` + `credential-vault` | Yes | Connection-string home |
| Learning area | `app/dashboard/learn` | Yes | DB-type tutorial surface |

## 7. Specialist board review
| Role | Finding | Risk | Recommendation |
|---|---|---|---|
| Product Manager | Real signup value; must not add DBA friction | Med | Default to provision-for-me; BYO is the advanced path |
| Architect | Reuse card shell + tenant seam; keep provisioning idempotent | Med | One `POST /api/onboarding/database` state machine |
| UX/UI | Needs empty/testing/migrating/error/recovery + an "isolated" confidence signal | High | Explicit per-phase states; never a bare spinner |
| Security | Connection string = high-value secret | High | Test-before-store, envelope-encrypt, server-only, audit, drop-DB gated |
| QA/Test | Provisioning + migration are the risky bits | High | Integration test on ephemeral Postgres (pilot already proved the seam) |
| Devil's Advocate | Don't ship "first claim to your DB" before the pilot's real run proves parity | High | Gate the write-cutover on the pilot; ship connect+isolate first |

## 8. Judge challenge (convergence pass — honest)
| Category | Score | Notes |
|---|--:|---|
| First-source evidence | 24/25 | Grounded in real setup scaffolding + merged pilot core; provisioning-provider specifics UNSUPPORTED until chosen |
| Clear user/business problem | 20/20 | Direct signup value: the client-facing delivery of the cost+security initiative |
| Reuse of existing capability | 15/15 | Card shell, VideoExplainer, tenant seam, cred store, learn area all reused |
| Security/privacy safety | 14/15 | Strong plan (test-before-store, envelope encryption, audit); connection-string handling is inherently high-risk → not a free 15 |
| UX clarity | 9/10 | Full state set specified; final point needs the real screens to validate |
| Testability | 10/10 | Seam already proven on real Postgres; provisioning integration-testable |
| Cost/control simplicity | 4/5 | A multi-part build (card + API + provisioning + migration + routing + learn), though each part reuses existing shape |
| **Total** | **96/100** | **APPROVE BUILD** (phased — connect+isolate first; write-cutover after the pilot's real run) |

**Honest ceiling / dependency (no fake 100):** the last points are held by (a) an unchosen provisioning provider and (b) the inherent size/risk of connection-string handling — real, not wording. **Hard dependency:** the "deploy first claim to *your* DB" write-path must not ship before the **pilot's real flagged-workspace parity passes** (needs owner shared-DB creds). So this build ships in two gates: **G1 connect+provision+isolate+learn** (buildable now), **G2 first-claim write-cutover** (after the pilot's real run).

## 9. Proposed solution (smallest safe, phased)
### User flow
Setup wizard → **Connect your database** card → choose *Provision for me* (default) or *Paste connection string* → Testing → Migrating → **Connected & isolated** (badge + VideoExplainer) → learning area offers DB-type tutorials → **Deploy your first claim** (enabled only when ready; G2).
### System flow
`DatabaseCard` → `POST /api/onboarding/database` state machine: `validate → testConnectivity → runTenantBaselineMigration → storeEncrypted(ProviderConnection) → markWorkspaceReady`. Idempotent + resumable per phase.
### Data flow
Connection string → tested → tenant baseline migration (from `prisma/tenant`) applied → string envelope-encrypted into `ProviderConnection`. First-claim (G2): `Inspection` write routes via `resolveTenantDb`, mirror-synced via the outbox.
### Permission flow
Only workspace admins connect the DB; string decrypts server-side only; drop/rotate is a confirmed destructive action.
### Failure flow
Any phase fails → surface the phase + reason + a Retry that resumes from the failed phase; workspace stays not-ready; first-claim stays gated; nothing half-stored.
### Rollback path
Disconnect → mark not-ready, drop the encrypted string (confirmed); tenant DB droppable; shared DB untouched.

## 10. UX requirements
Entry: a `DatabaseCard` in the setup wizard. States: **empty** (not connected, two options), **testing/migrating** (per-phase progress, not a bare spinner), **error** (phase + reason + Retry-from-phase), **connected** (green "Isolated — your database" badge + VideoExplainer). Confidence signals: show the tested connection host (masked) + "migrated ✓". First-claim CTA disabled with a tooltip until ready. Accessibility: labelled inputs, `aria-live` on phase changes, reason reachable by assistive tech.

## 11. Technical requirements
- **New:** `components/setup/DatabaseCard.tsx`; `app/api/onboarding/database/route.ts` (state machine); `lib/tenant/provision.ts` (test + migrate + store); `lib/learn/db-tutorials.ts` (`dbType → tutorial ids`).
- **Changed:** `SetupShell` (add card); the first-claim entry (gate on ready; G2 routes write via `resolveTenantDb`); `app/dashboard/learn` (render DB-type tutorials + explainer slot).
- **Schema:** add `Workspace.tenantDbStatus` (`none|provisioning|ready|error`) + tenant-DB registration fields (reuse `ProviderConnection` for the string) — additive nullable migration.
- **Backward compat:** workspaces with `tenantDbStatus=none` behave exactly as today (shared DB).
- **Observability:** per-phase provisioning logs + a status metric.

## 12. Security and privacy requirements
Connection string: **tested before stored**, envelope-encrypted (per-tenant data key) via `credential-vault`, server-side only, never in client bundles/logs. Admin-only. Audit connect/rotate/disconnect. Drop-DB + disconnect are confirmed destructive actions. Reject non-Postgres / malformed strings at validate.

## 13. Verification plan
### Static
`npx tsc --noEmit` · `npx eslint <changed>` · `pnpm check:standards && pnpm check:no-verbatim`
### Unit
`provision` state-machine transitions (each phase, resume-from-failure); `db-tutorials` mapping; `DatabaseCard` state rendering (empty/testing/error/connected).
### Integration (seam already proven — extend it)
Ephemeral Postgres: provision → migrate → store(mock vault) → markReady → (G2) first-claim write routes to tenant DB → parity 100% (reuse the proven harness).
### UI/browser
Wizard: connect happy path + a forced connectivity failure showing Retry-from-phase.
### Evidence required before done
The provisioning integration output + a green first-claim parity (G2) + no-plaintext-string grep. Do not claim pass without the real output.

## 14. Loop + stress testing
Normal: provision-for-me succeeds. BYO: valid string connects. Malformed string → rejected at validate. Unreachable host → error + Retry, nothing stored. Migration fails mid-way → not-ready, resumable. Duplicate submit → idempotent (one connection). Permission: non-admin blocked. First-claim before ready → gated. Regression: `tenantDbStatus=none` workspaces unchanged.

## 15. Acceptance criteria
- [ ] `DatabaseCard` in the setup wizard offers provision-for-me (default) + BYO connection string, with empty/testing/migrating/error/connected states + Retry-from-phase.
- [ ] `POST /api/onboarding/database` runs validate→test→migrate→storeEncrypted→markReady, idempotently, resuming from a failed phase; never half-stores.
- [ ] Connection string is tested before storage, envelope-encrypted, server-only; a grep proves no plaintext in code/logs/client.
- [ ] `Workspace.tenantDbStatus` gates first-claim; `none` workspaces behave exactly as today (regression test).
- [ ] Learning area surfaces the explainer slot + a `dbType → curated tutorial set`.
- [ ] **G2 (after pilot real run):** a first claim by a ready workspace writes through `resolveTenantDb`; parity harness = 100%.
- [ ] tsc 0 errors; unit + integration + gates green.

## 16. Goal command
```text
/goal Implement gate G1 of the accepted cutover onboarding spec: the DatabaseCard + POST /api/onboarding/database provisioning state machine + encrypted storage + tenantDbStatus gating + learn-area DB tutorials. Completion: a fresh workspace can connect/provision a tenant DB (tested + baseline-migrated), reach a "connected & isolated" state, and see first-claim gated until ready — proven on an ephemeral Postgres. Required proof: provisioning integration output, DatabaseCard state tests, no-plaintext-string grep, green tsc + gates. Constraints: do NOT ship the first-claim write-cutover (G2) — that waits on the pilot's real flagged-workspace parity; no plaintext secrets; tenantDbStatus=none unchanged; stop + /session-handoff if blocked by the provisioning-provider choice or shared-DB creds.
```

## 17. Implementation sequence
1. **Inspect** — SetupShell card wiring + onboarding routes. Stop: card API contract unclear.
2. **G1 build** — DatabaseCard + provisioning state machine + schema + encrypted store + learn tutorials. Stop: provisioning provider unchosen (use BYO-string path + note).
3. **Verify** — unit + ephemeral-Postgres integration + no-plaintext grep.
4. **Stress** — §14 cases.
5. **Judge** — re-`/judge` built G1 vs spec (≥85).
6. **Handoff** — `/session-handoff`; G2 deferred to the pilot's real run.

## 18. Session handoff seed
Planned the cutover onboarding: DatabaseCard (provision/BYO) → test → migrate → encrypted store → tenantDbStatus gate → learn-area videos+tutorials → first claim (G2, gated on the pilot real run). Reuses SetupShell/VideoExplainer/tenant seam/cred store/learn area. Key files: `components/setup/DatabaseCard.tsx`, `app/api/onboarding/database/route.ts`, `lib/tenant/provision.ts`, `lib/learn/db-tutorials.ts`. Deferred: G2 write-cutover (needs pilot real run + shared-DB creds), provisioning-provider choice, video render.

## 19. Final recommendation
**Approve — build G1 now** (connect + provision + isolate + learn), it's reversible and reuses proven pieces; **hold G2** (first-claim write-cutover) until the pilot's real flagged-workspace parity passes.

```text
SPM spec complete. Next safe action: on your go, run the §16 /goal to build gate G1; G2 waits on the pilot's real run.
```
