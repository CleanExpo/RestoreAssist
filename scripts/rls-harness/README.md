# RA-4956 — RLS tenant-isolation verification

Two layers prove the RA-4956 Row-Level-Security policies actually isolate
tenants. Together they replace the manual "apply to sandbox + smoke" step with
something repeatable.

| Layer | File | Runs in CI now? | Proves |
|---|---|---|---|
| **Static coverage** | `scripts/__tests__/audit-rls-coverage.test.ts` (+ `scripts/audit-rls-coverage.ts`) | ✅ yes — pure parse, no DB | Every audited tenant table is RLS-enabled (RA-4970) **and** gets a real scoping policy (RA-4956); no service-only table leaks a policy; no policy is left public-readable. |
| **Integration harness** | `scripts/rls-harness/*.sql` + `run.sh` + `Makefile` | ⚠️ needs a local/ephemeral Postgres | Applies the **real** migration, seeds two tenants, switches JWT/role context, and asserts at runtime that tenant A cannot SELECT/UPDATE/DELETE/INSERT against tenant B's rows, and that the service role bypasses RLS. |

The static layer guards against the regressions parsing **can** catch (a table
silently dropped from policy emission, a typo'd scoping column, a service-only
table accidentally exposed). The integration layer is the one that proves
**isolation actually holds** at the row level — run it before relying on these
policies for client-key access.

---

## Static coverage test (always-on)

```bash
# repo's scripts test config
pnpm exec vitest run --config scripts/__tests__/vitest.config.ts \
  scripts/__tests__/audit-rls-coverage.test.ts
```

No database required. Asserts 119 audited tables partition cleanly into
tenant-scoped (68) / public-ref / service-only / investigate-first, that all
119 are RLS-enabled by RA-4970, and that all 68 tenant tables carry a policy
with a real `auth.uid()` / workspace-helper / org-lookup / parent-join anchor.

---

## Integration harness (needs ephemeral Postgres)

The harness **never touches prod/remote** — `run.sh` refuses any non-local
`DATABASE_URL`. It runs the actual migration files unmodified:

1. `00_supabase_shim.sql` — manufactures the Supabase surface the migration
   needs on a bare Postgres: `auth` schema, `auth.uid()` (reads
   `request.jwt.claims->>'sub'`), and the `anon` / `authenticated` /
   `service_role` roles. On a real `supabase db start` stack these already
   exist, so the shim is a safe no-op.
2. `01_schema_min.sql` — a minimal real-schema subset (User / Organization /
   Workspace / WorkspaceMember / Inspection + one leaf table per scoping
   family). The migration's `to_regclass` guards skip everything else.
3. RA-4970 enable migration, then RA-4956 policy migration — **the real files**.
4. `02_seed.sql` — two tenants (org A/user A, org B/user B).
5. `03_assert_isolation.sql` — the assertions; any breach raises and exits ≠ 0.

### One command (Docker)

```bash
make -f scripts/rls-harness/Makefile rls-test
```

Spins up a disposable `postgres:16`, runs the harness, tears it down, and
propagates the exit code.

### Against a Supabase local stack (recommended — native `auth.*`)

```bash
supabase start
DATABASE_URL="$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  scripts/rls-harness/run.sh
supabase stop
```

### Against your own disposable Postgres

```bash
docker run -d --rm --name ra-rls-pg -e POSTGRES_PASSWORD=pw \
  -p 55432:5432 postgres:16
DATABASE_URL="postgres://postgres:pw@localhost:55432/postgres" scripts/rls-harness/run.sh
docker rm -f ra-rls-pg
```

### What the assertions check

- Tenant A SELECT sees **only** A's rows across all three scoping families.
- Tenant A cannot SELECT / UPDATE / DELETE tenant B's rows (writes affect 0 rows).
- Tenant A INSERT bearing B's `userId` is rejected by the `WITH CHECK` clause.
- The mirror holds for tenant B.
- The **service role** sees all rows (RLS bypass — server code path).
- An `authenticated` request with **no JWT subject** (`auth.uid()` NULL) sees
  nothing — mirrors the NextAuth caveat documented in the migration header.

---

## Scope & honest limits

- The harness exercises **one representative table per scoping family**
  (user-owned, via-inspection child, org-scoped). It does not seed all 68
  tables. The static layer covers breadth (every table has a policy); the
  harness covers depth (the policy logic genuinely isolates). The 2-hop chains
  (`MissingElement`, `AuthorityFormSignature`) and the workspace-membership
  path are not yet seeded — extend `01_schema_min.sql` / `02_seed.sql` to add
  them.
- `auth.uid()` returns `uuid`; the policies cast `::text`. The harness uses
  uuid-shaped user ids so the comparison binds. Production uses `cuid()` ids,
  which are also text — the `::text` cast makes both work, but a live sandbox
  run against real cuid data is still the gold standard before trusting these
  policies for any anon/authenticated client-key surface.
