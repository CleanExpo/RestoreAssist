# Standards — RestoreAssist

Patterns that linters cannot catch. Reference before writing new modules or refactoring.

> **Reading library internals?** Use opensrc — `rg "pattern" $(opensrc path <pkg>)`. See `.claude/PACKAGE_LOOKUPS.md`. Never invent dependency APIs from memory.

## API Route Pattern

Every API route follows this structure (canonical: `app/api/inspections/route.ts`):

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await prisma.model.findMany({
      where: { userId: session.user.id },
      select: {
        /* explicit fields only */
      },
      take: 50,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[RoutePrefix]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

**Enforced:**

- Auth check is the first operation after session extraction
- `{ data }` on success, `{ error: string }` on failure — never mixed shapes
- `console.error("[BracketedPrefix]", error)` for grep-ability
- Explicit `select` or `include` — never return raw model fields without selection
- `take` limit on all list queries (default 50, max 250)

## Cron Endpoint Pattern

Bearer token auth instead of session (canonical: `lib/cron/auth.ts`):

```typescript
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

## Raw SQL Pattern

Use `Prisma.sql` tagged template composition. Never string-interpolate user values into `$queryRaw`:

```typescript
import { Prisma } from "@prisma/client";

// Build WHERE fragments safely — each ${value} becomes a bound parameter
let where = Prisma.sql`"userId" = ${userId}`;
if (status) where = Prisma.sql`${where} AND "status" = ${status}`;

const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
  SELECT id, name FROM "Model"
  WHERE ${where}
  ORDER BY "createdAt" DESC
  LIMIT ${limit} OFFSET ${offset}
`);
```

String-interpolating a plain `whereClause` variable (e.g. `WHERE ${whereClause}`) passes it as a raw SQL fragment, bypassing parameterisation entirely. Always compose with `Prisma.sql`.

## Error Handling

- API routes: try/catch with `console.error('[Prefix]', error)` + generic 500 — never expose `error.message`
- Integration sync: log and queue for retry — never throw to caller
- Client components: `ErrorFallback.tsx` wraps risky UI sections
- Prisma constraint errors: catch `Prisma.PrismaClientKnownRequestError` — `P2002` = unique violation, `P2025` = record not found

## Domain Naming

| Concept                     | Code name                        | Notes                                                       |
| --------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Inspection report           | NIR (National Inspection Report) | `lib/nir-*.ts`                                              |
| IICRC water damage standard | S500                             | Always cite with year: `S500:2021`                          |
| IICRC mould standard        | S520                             | `S520:2024`                                                 |
| Fire/smoke standard         | S700                             | `S700:2025`                                                 |
| Water damage classification | Category + Class                 | Category 1–3 (contamination), Class 1–4 (evaporation)       |
| Moisture reading            | `MoistureReading` model          | Fields: `moistureLevel`, `surfaceType`, `depth`, `location` |
| State jurisdiction          | Two-letter uppercase             | `NSW`, `VIC`, `QLD`, `SA`, `WA`, `TAS`, `NT`, `ACT`         |

## File Organisation

- **Pages:** `app/dashboard/[feature]/page.tsx` — server component, data fetching here
- **API routes:** `app/api/[resource]/route.ts` — one file per resource, all HTTP methods
- **Business logic:** `lib/[feature].ts` or `lib/[feature]/index.ts` — never in components or pages
- **UI components:** `components/[ComponentName].tsx` — PascalCase, one component per file
- **shadcn/ui:** `components/ui/[component].tsx` — auto-generated, do not modify manually
- **Integration clients:** `lib/integrations/[platform]/` — one directory per external service

## State Management

- Server state: Prisma in API routes or Server Components — no client-side data-fetching libraries
- Client state: `useState`/`useEffect` for local UI state
- Form state: React Hook Form (`useForm` + `zodResolver`) for complex forms
- Mobile state: Zustand store (`mobile/lib/store.ts`)

## Integration Sync

All external syncs are fire-and-forget via the orchestrator pattern (canonical: `lib/integrations/nir-sync-orchestrator.ts`). Failures log to `IntegrationSyncLog` and queue to dead-letter for retry. Never await sync inside a user-facing request handler.

## Progress Framework (RA-1376)

The stage-gated claim lifecycle adds its own invariants above the general standards. Full spec:

- `.claude/board-2026-04-18/progress-framework.md` — the 15 states, transition keys, terminology
- `.claude/board-2026-04-18/progress-principles.md` — 8 engineering constraints
- `CLAUDE.md` rules 21–28 — the enforceable summary

**When touching any `lib/progress/**`, `app/api/progress/**`, `components/Progress\*` surface:**

- Read `.claude/board-2026-04-18/progress-principles.md` before writing code.
- `ProgressTransition` and `ProgressAttestation` are append-only — never `UPDATE`/`DELETE` outside `ClaimProgress` cascade.
- Every transition goes through `lib/progress/service.ts` — never call Prisma directly for state changes.
- Evidence guards return `{ ok: false, missing: string[] }` — surface the missing list to the UI, never a generic "failed".

## Service Layer (2026-05-18)

Route handlers (`app/api/**/route.ts`) own orchestration: auth, ownership, status transitions, audit events, persistence, HTTP error policy. Runtime mechanics — credential reads, retry loops, validation, readiness probes, restart helpers — live in `lib/services/<domain>/<concern>.ts` and return `ServiceResult<T, E>` (see `lib/services/_shared/result.ts`).

Full pattern: `.claude/skills/service-layer-architecture/SKILL.md`.

Canonical examples in this repo:
- `lib/services/xero/credentials.ts` — gateway credential read with structured `XeroCredentialsReason`.
- `lib/services/inspection/validate-submission.ts` — pure validation, no I/O.

When extracting from an existing fat action, use TDD per the skill recipe. One concern extracted = one commit.

### AI Service Pattern

Routes that previously imported `@anthropic-ai/sdk` directly now go through `lib/services/ai/<task>.ts`, which composes `lib/services/ai/anthropic-gateway.ts`. Route → domain-task-service → gateway → SDK. Each layer returns `ServiceResult<T, Reason>`. Reasons compose: a route translates the union `AnthropicReason | <task-specific-reasons>` into HTTP status codes.

Pattern boundaries:
- **`lib/services/ai/anthropic-gateway.ts`** owns SDK instantiation + key resolution + retry envelope + error → reason mapping. Accepts either `userId` (uses `getAnthropicApiKey(userId)`) or an explicit `apiKey` override (platform flows).
- **`lib/services/ai/<task>.ts`** owns prompt construction + response parsing + task-specific pre-flight validation.
- **Routes** own auth, ownership, audit, persistence, HTTP error mapping.

Canonical examples: `lib/services/ai/classify-inspection.ts`, `lib/services/ai/group-readings.ts`, `lib/services/ai/draft-support-ticket.ts` (batch), `lib/services/ai/generate-scope.ts` (streaming).

When extracting a new AI route, copy the recipe from any of those modules — do not invent a new shape.

**Streaming routes** consume `callAnthropicStream` from the same gateway. The service stays thin (wraps the request shape + cache-control system message); the route owns the SSE translation loop, client-disconnect `stream.abort()`, usage logging, and persistence. Pre-stream failures map to ServiceResult reasons BEFORE the `ReadableStream` opens; mid-stream errors are the route's concern via stream events.

**Multi-model fallback routes** consume `callAnthropicWithFallback` from the same gateway. The wrapper composes `tryClaudeModels` (substrate helper at `@/lib/anthropic-models`) with the standard `ServiceResult` envelope — services pass `models?: ModelConfig[]` to override the default chain, plus optional `agentName` / `enableCacheMetrics`. The gateway handles key resolution, SDK construction, and error → reason mapping identical to `callAnthropic`. Services should not construct `new Anthropic({apiKey})` or call `tryClaudeModels` directly — use the gateway. Canonical: `lib/services/ai/generate-interview-question.ts`.

As of 2026-05-18 / PR #1119 the only remaining `@anthropic-ai/sdk` import in `app/api/**` (excluding `__tests__`) is `app/api/webhooks/github/route.ts` (legitimate signature verification). All other AI routes go through the Service Layer.

### Telemetry pattern

AI usage logging (`UsageEvent` user-scoped or `AiUsageLog` workspace-scoped via `lib/usage/log-usage.ts`) was historically written inline from the SDK response. After Service Layer migration, the SDK call lives inside the service module — but the gateway already returns the full `Anthropic.Message` object, which carries `.usage.input_tokens` + `.usage.output_tokens`.

**Recipe — service surfaces usage; route logs it:**

```ts
// In the service module:
export interface FooResult {
  // ... task-specific fields
  usage?: { inputTokens: number; outputTokens: number };
}

export async function generateFoo(args): Promise<ServiceResult<FooResult, FooReason>> {
  const gw = await callAnthropic({ ... });
  if (!gw.ok) return gw;
  return ok({
    foo: parse(gw.data),
    usage: {
      inputTokens: gw.data.usage.input_tokens,
      outputTokens: gw.data.usage.output_tokens,
    },
  });
}
```

```ts
// In the route:
const result = await generateFoo({ apiKey, input });
if (!result.ok) return mapReasonToHttp(result);

if (result.data.usage) {
  logAiUsage({
    workspaceId,
    provider: "ANTHROPIC",
    model: "claude-haiku-4-5-20251001",
    taskType: "foo",
    inputTokens: result.data.usage.inputTokens,
    outputTokens: result.data.usage.outputTokens,
    estimatedCostUsd: computeCost(result.data.usage),
    latencyMs: Date.now() - startedAt,
    success: true,
  }); // fire-and-forget; do not await
}
```

The gateway never writes to telemetry tables — that decision (which model to log, whether to log at all, user-scope vs workspace-scope) belongs to the route. Canonical example: `lib/services/ai/import-sketch-from-image.ts` surfaces `usage`; its route logs via `logAiUsage`. Phase-4 follow-up: retrofit `usage` into wave-1/2/3 service result types where routes lost telemetry during migration.

## Patterns to Avoid

| Pattern                              | Why                                                       | Do instead                                         |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| `findMany()` without `take`          | Unbounded queries crash on large datasets                 | Always add `take: 50` or paginate                  |
| `$queryRaw\`WHERE ${variable}\``     | String fragment bypasses parameterisation → SQL injection | Compose with `Prisma.sql` tagged templates         |
| `any` type                           | Breaks 120+ model type safety chain                       | Use Prisma-generated types or explicit interfaces  |
| `console.log` in production code     | No structured logging                                     | `console.error('[Prefix]', error)` for errors only |
| Direct Stripe calls from components  | Security risk + coupling                                  | Route through `/api/`                              |
| Hardcoded IICRC section numbers      | Standards change between editions                         | Use `lib/nir-standards-mapping.ts` constants       |
| `process.env.X` in client components | Leaks server secrets                                      | Use `NEXT_PUBLIC_` prefix for client-safe vars     |
| `error.message` in API responses     | Leaks internal stack details                              | Return generic `{ error: "..." }` string           |
