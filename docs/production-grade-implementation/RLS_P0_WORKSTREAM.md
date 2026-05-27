# RLS P0 Workstream

Date: 2026-05-28
Release gate: RA-4956
Source snapshot: `.claude/aggregation/supabase/rls-categorisation.md`

## Decision

Treat the 119 production tables with RLS disabled as a P0 release-gate blocker. No new pilot rollout should begin until the first production-safe policy batch is applied to sandbox, smoke-tested, and reviewed for tenant isolation.

## Execution Order

1. Confirm production database wiring points to `restoreassist-prod-2026` (`udooysjajglluvuxkijp`) before writing or applying any policy.
2. Apply service-only deny-by-default policies first for operational tables that should never be exposed to anon/authenticated browser clients.
3. Apply read-only public reference policies for standards, regulatory, cost, and release-reference tables.
4. Apply user-, organization-, workspace-, inspection-, report-, invoice-, and integration-scoped policies in small batches with tests per batch.
5. Investigate the five tables present in production but absent from Prisma (`BusinessProfile`, `EquipmentDeployment`, `MoistureMeter`, `Room`, `RoomAnnotation`) before choosing policy or decommissioning.

## Initial Batches

| Batch | Tables                                                                                                                                            | Policy shape                                                                       | Gate                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| 1     | Service-only tables, including webhook, audit, cron, integration-auth, agent, and security-event tables                                           | Enable RLS; no anon/authenticated policies; service role only                      | Sandbox app smoke still passes               |
| 2     | Public reference tables, including `AuthorityFormTemplate`, `Citation`, `RegulatoryDocument`, `RegulatorySection`, `IicrcChunk`, and `AppRelease` | Authenticated read-only; writes service role only                                  | Dashboard/reference reads pass               |
| 3     | `User`, `Account`, `Session`, `UserInvite`, organization pricing/config tables                                                                    | Scope to `auth.uid()` and organization membership; writes through server APIs only | Auth, invite, team, and billing tests pass   |
| 4     | Inspection child tables (`MoistureReading`, `AffectedArea`, `Classification`, `ScopeItem`, `InspectionPhoto`, assessments)                        | Join through `Inspection` workspace access                                         | Restore flow and report generation pass      |
| 5     | Report, invoice, estimate, client portal, and integration chain tables                                                                            | Join through owning report/invoice/client/integration workspace or user            | Portal, invoice, Xero, and export tests pass |

## Acceptance Criteria

- Migration generated through Prisma migration workflow, not raw ad hoc schema edits.
- Policies reviewed against `session.user.id` / Supabase `auth.uid()` identity assumptions.
- Sandbox validation includes auth, onboarding, storage, inspection create/edit, handover, report generation, portal access, billing portal, and webhook smoke.
- Production rollout has rollback SQL prepared before apply.
- RA-4956 release-gate evidence references the migration, smoke results, and policy review notes.
