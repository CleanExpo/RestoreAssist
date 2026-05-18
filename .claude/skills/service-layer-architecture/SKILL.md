---
name: service-layer-architecture
description: Use when designing or refactoring an API surface where the route handler / Convex action / framework endpoint has accumulated runtime mechanics (provisioning, credential reads, validation, readiness checks, restart/teardown helpers, integration fan-out). Separates the orchestration layer (auth, ownership, status transitions, audit events, persistence, user-facing error policy) from service modules (reusable runtime mechanics that return structured results). Substrate-agnostic — applies to Convex actions, Next.js App Router API route handlers / Server Actions, FastAPI endpoints, NestJS controllers, Express handlers.
metadata:
  origin: David Ondrej framing — codified for portfolio use after the Runtime Reconciliation / Deployment Lifecycle plan, 2026-05-18.
  applies_to: any backend where business logic and runtime mechanics live in the same function
---

# Service Layer Architecture

> **The pattern in one sentence:** the route handler decides _what to do and who is allowed to do it_; the service module decides _how to do it_ and returns a structured result the handler can interpret.

## When to invoke this skill

Use this skill BEFORE touching code when any of these are true:

- A single route file is > 200 lines and mixes auth + persistence + integration calls + retries + telemetry + error mapping.
- You're about to add the same provisioning / credential-lookup / readiness-poll code to a second handler.
- A handler imports a runtime client (Stripe, Xero, Supabase service-role, a worker dispatcher) and immediately calls 4+ methods on it in sequence.
- A bugfix to "how something is provisioned" requires editing N route files in lock-step.
- Tests for a route require mocking auth + DB + every downstream integration — a tell that the route owns too many concerns.

If none of the above, this skill is overkill. Don't introduce a service layer for a 20-line CRUD route.

## The two layers, precisely

### Action layer (a.k.a. orchestration layer / use-case layer)

Lives in: the **route handler** (`app/api/**/route.ts`), the **Server Action** (`app/_actions/*.ts`), the **Convex action** (`convex/*.ts`), the **FastAPI endpoint** (`app/server/routes/*.py`).

Owns:
- **Authentication.** `getServerSession`, `auth.uid()`, bearer-token verification.
- **Authorization / ownership.** "Does this user own this resource?" "Does this workspace permit this transition?"
- **Status transition policy.** "An inspection can move from SUBMITTED → CLASSIFIED only when …"
- **Audit events.** `AuditLog.create({ action: "INSPECTION_SUBMITTED", actorId, … })`.
- **Persistence orchestration.** Calls Prisma / Convex mutations directly OR delegates to a service module that returns data to persist.
- **User-facing error policy.** "HTTP 402 if subscription expired", "HTTP 403 if not your inspection", "HTTP 409 if status mismatch", "HTTP 500 + log if anything else".
- **Telemetry.** `console.error("[Inspections]", …)` and structured logging.

Does **not** own:
- Network retries to third parties.
- Credential lookup from secret managers or env.
- Health/readiness probes against external systems.
- Worker / dispatcher / runtime provisioning (memory allocation, container spin-up).
- Pure validation logic (format checks, shape checks). Validation that requires a DB read is action-layer; pure validation is service-layer.

### Service-module layer (a.k.a. domain-service layer / runtime layer)

Lives in: `lib/services/<domain>/<concern>.ts` (Next.js), `services/<domain>.py` (FastAPI), a separate `convex/_services/` folder kept off the public action graph (Convex).

Owns:
- **Gateway credentials reads.** "Get the Xero access token for org X" — a function, not inline code in every handler that talks to Xero.
- **Runtime setup.** Dispatcher init, memory allocation, container provisioning, model client warming.
- **Validation helpers.** Pure functions that say `{ ok: true }` or `{ ok: false, errors: [...] }`.
- **Readiness probes.** `await isXeroReady(orgId)` — returns structured `{ ready: boolean, reason?: string, retryAfterMs?: number }`.
- **Restart / teardown helpers.** Idempotent functions you can call from a cron job AND from a user-triggered route.
- **Retry policy.** Exponential backoff, jitter, circuit-breaker state.
- **Structured-result contract.** Every public service function returns a **discriminated-union result type**, never throws for expected outcomes.

The structured-result shape (TypeScript):
```ts
export type ServiceResult<T, E extends string = string> =
  | { ok: true; data: T }
  | { ok: false; reason: E; detail?: string; retryAfterMs?: number };
```

The action layer reads `result.ok` and maps to HTTP semantics. The service layer never knows what HTTP is.

## The cardinal rule

**A service module never reads `request`, `session`, or `cookies`. It receives every dependency as a function argument.** If it needs the workspace ID, the caller passes it in. If it needs a DB client, the caller passes it in. This is what makes service modules:

1. **Reusable** — same function works from an API route, a cron job, an admin script, a test.
2. **Testable** — no auth fakery required, just pass test inputs.
3. **Substrate-portable** — swap Next.js for FastAPI, the service module moves untouched.

Conversely, **an action never imports a third-party SDK directly**. If you find `import Stripe from "stripe"` inside `app/api/billing/route.ts`, refactor that line into `lib/services/billing/stripe-gateway.ts` and let the action call a wrapper.

## Anti-patterns this prevents

| Smell | What's wrong | Service-layer fix |
|---|---|---|
| **Fat action** — 400+ line handler that does everything | Untestable; every change risks regressions in unrelated concerns | Split: action keeps auth + status; mechanics move to service module |
| **Copy-paste credential reads** — 8 handlers all call `getXeroToken()` inline | Token-refresh logic drifts; one handler updates, others break | One `lib/services/xero/credentials.ts` with `getValidXeroAccessToken(orgId)` |
| **Throw-and-catch ladder** — service throws `XeroAuthError`, handler catches it, maps to 401, then throws `XeroRateLimitError`, handler catches it, maps to 429 | Errors-as-control-flow; new error class needs a touch in every handler | Service returns `{ ok: false, reason: "RATE_LIMITED", retryAfterMs }`; handler has one switch on `reason` |
| **Inline retry loops** — `for (let i = 0; i < 3; i++) try { … } catch {}` in a route | Retry policy diverges per route; impossible to instrument | Service module owns retry; route just awaits one call |
| **DB-write inside provisioning helper** — `provisionWorker()` writes `Worker.status = "PROVISIONED"` | Helper can no longer be called from a dry-run / restart context | Helper returns the new status; action decides whether to persist |

## How this maps across substrates

| Substrate | Action layer | Service-module layer |
|---|---|---|
| **Convex** | `convex/<domain>.ts` action / mutation | `convex/_services/<domain>/<concern>.ts` (folder convention; not exported from convex root) |
| **Next.js App Router** | `app/api/<domain>/route.ts` or `app/_actions/<domain>.ts` (Server Actions) | `lib/services/<domain>/<concern>.ts` |
| **FastAPI** | `app/server/routes/<domain>.py` endpoint | `app/server/services/<domain>/<concern>.py` |
| **NestJS** | `<Domain>Controller` | `<Domain>Service` (Nest already enforces this — the skill is about not letting the service grow into a god-class) |
| **Express** | `routes/<domain>.ts` handler | `services/<domain>/<concern>.ts` |

The principle is identical. The naming differs.

## Test-design implications

### Service-module tests
- **Unit tests, fully mocked downstream.** Inject the DB client. Inject the HTTP client. Inject the clock.
- Cover the **structured-result space**: every `reason` value has at least one test producing it.
- No request/session fixtures. No HTTP framework imports.
- Example file path: `lib/services/xero/__tests__/credentials.test.ts`.

### Action tests
- **Integration tests, mock at the service-module boundary only.** Stub `getValidXeroAccessToken` to return `{ ok: true, data: "fake-token" }` or `{ ok: false, reason: "REFRESH_FAILED" }`.
- Cover HTTP-status mapping: every `result.reason` should produce a deterministic HTTP code.
- Use the real framework (Next.js / Convex / FastAPI test client) for routing + auth + serialisation.
- Example file path: `app/api/xero/__tests__/sync.test.ts`.

### What you do **not** test
- The framework itself. If Next.js correctly extracts `params.id` from the URL, that's the framework's job.
- Implementation details of service modules from action tests. If `credentials.ts` adds retry, action tests don't need updating.

## Concrete refactor recipe (TDD)

When converting a fat action into action + service:

1. **Identify the seams.** Read the action. Underline every line that does NOT belong in the action-layer list above. Those become the service module.
2. **Name the service.** `lib/services/<noun>/<verb>.ts` — e.g. `lib/services/inspection/submit-orchestrator.ts`. One verb per file when possible.
3. **Write the failing service test first.** Mock the DB client and any HTTP client. Assert the structured result for the happy path and one failure path.
4. **Extract the code.** Move lines out of the action into the service. Make the action call `await submitOrchestrator({ inspectionId, prisma, fetch })`.
5. **Run the service test.** Make it pass.
6. **Update or write the action test.** Stub the service module's exported function. Assert HTTP status mapping for each `reason`.
7. **Run both test suites.** Commit only when both green.
8. **Repeat for the next seam** in the same action.

**Frequent commits — one extracted concern per commit.** If you extract 4 concerns from one action, that's 4 commits, not 1. This makes the diff reviewable and reversible.

## What this skill does NOT prescribe

- **Folder shape inside `lib/services/`.** Flat vs nested is per-project taste. Suggestion: nest by domain (`lib/services/inspection/`, `lib/services/billing/`) once you have 3+ files per domain.
- **DI container.** No. Pass dependencies as function arguments. A 30-line constructor with 8 dependencies is a smell, not a feature.
- **Naming a class.** Service modules are usually a set of exported functions, not a class. Use a class only when the runtime state genuinely belongs together (a long-lived connection pool, a worker queue, a circuit breaker).
- **Synchronous vs async.** Both fine. Match the substrate's idiom.

## Cross-references

- **`superpowers:subagent-driven-development`** — when implementing a multi-step refactor, dispatch a fresh subagent per service-module extraction so context stays focused.
- **`superpowers:test-driven-development`** — the recipe above is TDD; this skill is the layout, TDD is the discipline.
- **Domain-Driven Design** — this maps to the **application-service vs domain-service** distinction. Search "Vaughn Vernon application service" for the deepest formal treatment.
- **Hexagonal Architecture / Ports & Adapters** — actions are the inbound ports; services are the use cases; integrations are the outbound adapters. Same shape, different vocabulary.
- **Clean Architecture (Uncle Bob)** — actions are the "interface adapters" layer; services are the "use case interactors". Same shape again.

David Ondrej's framing is a practitioner's distillation of these three traditions, with names tuned for the Convex / Next.js generation.

## Quick checklist (pin this above your refactor)

- [ ] Action only does: auth, ownership, transition policy, audit, persist-or-delegate, user-facing error mapping.
- [ ] Service only does: mechanics — returns `{ ok, data | reason }`.
- [ ] Service does not import the HTTP framework.
- [ ] Service does not read `session` / `request` / `cookies`.
- [ ] Action does not import a third-party SDK directly.
- [ ] One structured-result type per service module, exported.
- [ ] Unit tests for service; integration tests for action.
- [ ] One concern extracted = one commit.
- [ ] If you can't write a sentence describing the service in one line, split it again.
