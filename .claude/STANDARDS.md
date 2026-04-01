# Standards — RestoreAssist

Patterns that linters cannot catch. Reference these before writing new modules.

## API Route Pattern

Every API route follows this structure (see `app/api/inspections/route.ts` for canonical example):

```typescript
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await prisma.model.findMany({
      where: { userId: session.user.id },
      select: { /* explicit fields */ },
      take: 50,  // always paginate
    })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[API Route Name]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Enforced conventions:**
- Auth check is always the first line after session extraction
- Response shape: `{ data }` for success, `{ error: string }` for failure
- Console.error with `[BracketedPrefix]` for log grep-ability
- Explicit `select` or `include` — never return raw `findMany` without field selection
- `take` limit on all list queries (default 50, max 250)

## Cron Endpoint Pattern

Cron routes use bearer token auth instead of session auth (see `lib/cron/auth.ts`):

```typescript
const authHeader = request.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

## Error Handling

- API routes: try/catch with `console.error('[Prefix]', error)` + 500 response
- Integration sync: errors are logged and queued for retry — never thrown to caller
- Client components: `ErrorFallback.tsx` component wraps risky UI sections
- Prisma errors: catch `Prisma.PrismaClientKnownRequestError` for constraint violations (P2002 = unique, P2025 = not found)

## Domain Naming

| Concept | Code name | Notes |
|---------|-----------|-------|
| Inspection report | NIR (National Inspection Report) | `lib/nir-*.ts` |
| IICRC water damage standard | S500 | Always cite with year: `S500:2025` |
| IICRC mould standard | S520 | `S520:2024` |
| Fire/smoke standard | S700 | `S700:2022` |
| Water damage classification | Category (contamination) + Class (evaporation) | Category 1-3, Class 1-4 |
| Moisture reading | `MoistureReading` model | Fields: `moistureLevel`, `surfaceType`, `depth`, `location` |
| State jurisdiction | Two-letter uppercase | `NSW`, `VIC`, `QLD`, `SA`, `WA`, `TAS`, `NT`, `ACT` |

## File Organisation

- **Page components:** `app/dashboard/[feature]/page.tsx` — server component with data fetching
- **API routes:** `app/api/[resource]/route.ts` — one file per resource, multiple HTTP methods
- **Business logic:** `lib/[feature].ts` or `lib/[feature]/index.ts` — never in components or pages
- **UI components:** `components/[ComponentName].tsx` — PascalCase, one component per file
- **shadcn/ui:** `components/ui/[component].tsx` — auto-generated, do not modify manually
- **Integration clients:** `lib/integrations/[platform]/` — one directory per external service

## State Management

- Server state: Prisma queries in API routes or Server Components — no client-side data fetching libraries
- Client state: React `useState`/`useEffect` for local UI state
- Form state: React Hook Form (`useForm` + `zodResolver`) for complex forms
- Mobile state: Zustand store (`mobile/lib/store.ts`)

## Integration Sync Pattern

All external syncs follow the orchestrator pattern (see `lib/integrations/nir-sync-orchestrator.ts`):

1. Caller fires `syncReport(reportId)` — non-blocking
2. Orchestrator queries user's active `Integration` records
3. For each platform: `platformClient.sync(data)` with circuit breaker + rate limiter
4. Success/failure logged to `IntegrationSyncLog`
5. Failures queued to dead-letter for retry

**Never:** await sync in a user-facing request handler. Always fire-and-forget.

## Patterns to Avoid

| Pattern | Why | Do instead |
|---------|-----|-----------|
| `findMany()` without `take` | Unbounded queries crash on large datasets | Always add `take: 50` or paginate |
| `any` type | Breaks 102-model type safety chain | Use Prisma-generated types or explicit interfaces |
| `console.log` in production code | No structured logging | Use `console.error('[Prefix]', error)` for errors only |
| Direct Stripe API calls from components | Security risk + coupling | Use `/api/` routes as Stripe proxy |
| Hardcoded IICRC section numbers | Standards change between editions | Use `lib/nir-standards-mapping.ts` constants |
| `process.env.X` in client components | Leaks server secrets | Use `NEXT_PUBLIC_` prefix for client-safe vars |
