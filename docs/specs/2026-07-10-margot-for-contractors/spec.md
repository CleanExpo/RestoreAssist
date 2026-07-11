# Margot for Contractors (RA-7026 Phase 2) — spec

**Status:** APPROVED BUILD (founder-selected 2026-07-10; two load-bearing forks resolved below)
**Repo:** RestoreAssist only
**Builds on:** Phase 1 per-contractor pricing grounding (merged #1890/#1892, live)

## Problem

Margot today is a single-principal *personal* assistant for the founder:
`app/api/margot/chat/route.ts` hardwires the persona `"You are Margot, Phill
McGurk's personal assistant"` [VERIFIED app/api/margot/chat/route.ts:52], is
**admin-gated** via `verifyAdminFromDb` [VERIFIED :373], and carries founder-only
tools (Linear, schedules, hermes-proxy, image-gen) [VERIFIED :438-443]. No
subscribed *contractor* can use it. The product's AI centrepiece is invisible to
paying customers.

## Desired outcome

Every subscribed contractor can ask a **read-only** RestoreAssist domain
assistant questions grounded on (a) IICRC standards, (b) general restoration
knowledge, and (c) **their own** configured pricing — with **zero** ability to
reach another tenant's data or the founder's personal Margot/tools.

## Resolved forks (founder, 2026-07-10)

1. **Architecture → SEPARATE surface.** A new contractor endpoint
   (`/api/assistant/chat`), physically distinct from the personal Margot route,
   which stays 100% untouched. Cleanest guarantee of no cross-tenant / no
   personal-tool leak: they are different endpoints, not a role-branch.
2. **Capability → READ-ONLY advisor (v1).** Grounded Q&A only. No tools, no
   writes. Actions are a later epic.

## Non-goals (v1)

- No write/action tools (no create inspection/report/scope).
- No change to the personal `/api/margot/chat` route or its persona/tools.
- No new UI in this increment (endpoint + grounding first; surface follows).
- No exposure to contractors until the flag is deliberately flipped on.

## Constitution constraints that shape this (CLAUDE.md)

- **Rule 1** auth on every route (`getServerSession`).
- **Rule 5** subscription gate before AI calls — allowlist `TRIAL`/`ACTIVE`, else 402.
- **Rule 8** rate-limit key = `session.user.id` (not IP).
- **Rule 16** read before modify; **tenancy**: every data read org-scoped.
- **merge-gate / auto-merge estate**: ship dark-by-default behind a flag defaulting OFF.

## Functional requirements

- **FR1 — Dark by default.** `CONTRACTOR_ASSISTANT_ENABLED !== "true"` → the route
  responds `404` (invisible). [ships off]
- **FR2 — Auth.** No session → `401`.
- **FR3 — Subscription gate.** Effective subscription (own, or org-owner's for
  team members via `getEffectiveSubscription`) not in `{TRIAL,ACTIVE}` → `402`.
- **FR4 — Rate limit.** Per-`userId`, e.g. 30 / 15 min → `429` when exceeded.
- **FR5 — De-hardwired persona.** Domain-expert RestoreAssist assistant; no
  "Phill McGurk", no founder tools, explicitly read-only, AU English.
- **FR6 — Tenant-scoped pricing grounding.** On pricing intent, inject ONLY the
  **caller's own** `OrganizationPricingConfig` via the existing
  `buildPricingGrounding(prisma, callerOrgId, query)`; unconfigured → setup nudge,
  never a foreign figure.
- **FR7 — Standards grounding.** Reuse the RAG reasoning retrieval; on pricing
  intent drop the KNOWLEDGE tier (no foreign $), same as Phase 1.
- **FR8 — No tools.** `streamText` with system + messages only — no tool surface.
- **FR9 — No cross-tenant reads.** The only tenant data touched is the caller's
  own org pricing; standards are shared non-tenant knowledge.

## Acceptance criteria (Given/When/Then)

- **AC1** Given flag off, When any request, Then `404` and no model call.
- **AC2** Given flag on + no session, Then `401`.
- **AC3** Given flag on + session with `CANCELED`/`EXPIRED` sub, Then `402`.
- **AC4** Given flag on + `TRIAL`/`ACTIVE` session, When a pricing question, Then
  the system prompt contains the caller-org rates and no other org's figures.
- **AC5** Given two different orgs, When each asks the same pricing question,
  Then each system prompt carries only its own org's rates (tenancy).
- **AC6** Given >30 requests/15 min for one user, Then `429`.
- **AC7** The response never exposes a tool/action; the persona omits "Phill".

## Ordered increments (each dark-by-default, independently shippable)

1. **Endpoint foundation (this PR):** gated route + auth + subscription + rate
   limit + de-hardwired grounded persona + pricing/standards grounding + tests.
   Flag stays OFF.
2. **Their-data grounding:** org-scoped read of the caller's own recent
   inspections/reports as optional context (strictly `where.organizationId`).
3. **UI surface:** a dashboard assistant panel calling the endpoint.
4. **Go-live:** founder flips `CONTRACTOR_ASSISTANT_ENABLED=true` after tenancy
   review.
5. **(Later epic) Actions:** per-tenant-audited write tools.

## Follow-ups / debt

- De-dup `buildStandardsGrounding`/`STANDARDS_HINT`/`latestUserText`: this PR puts
  the SSOT in `lib/assistant/grounding.ts`; the personal Margot route keeps its
  inline copy for now (no test coverage there — refactor separately to avoid
  regressing a live admin path).
