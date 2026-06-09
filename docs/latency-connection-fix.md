# Latency / DB Connection Fix — Investigation Summary

> **Status:** for morning decision. This document records the deeper investigation
> behind the sub-second-profile latency work. The accompanying PR
> (`perf/vercel-region-pin-syd`) ships ONLY the safe half — Sydney region pinning
> in `vercel.json`. The deeper connection-pooler changes below are deliberately
> NOT shipped and need a human decision.

## Root cause

Per-request connection overhead against the Supabase **transaction pooler**.

Evidence from the page-load profile:

- The no-DB notifications endpoint returns in **~346ms** — i.e. the bare
  function/network/cold-path cost with zero database work.
- DB-backed endpoints take **~3s** each.
- A single profile request **stacks several** of these DB endpoints, so the
  wall-clock latency compounds well past one second.

The gap between 346ms (no DB) and ~3s (with DB) is dominated by the cost of
establishing/negotiating a connection to the pooler on each invocation, not by
the queries themselves. Co-locating the functions next to the database removes
the cross-region network leg of that overhead, and connection reuse (see below)
removes the per-request negotiation.

## Safe next steps

### (a) Region pin — SHIPPED in this PR

`vercel.json` now sets `"regions": ["syd1"]`.

- Sydney (`syd1`) = AWS `ap-southeast-2` = the Supabase **prod** region.
- Functions now execute in the same region as the database, removing the
  cross-region round-trip on every DB call.
- Safe and reversible: it only changes where functions run; it touches no
  connection or pooling configuration.

### (b) Vercel Fluid Compute — consider

Fluid Compute keeps function instances warm and lets concurrent invocations
share a single instance, which enables **connection reuse** across requests.
This directly attacks the per-request connection-negotiation cost identified
above. Worth enabling/evaluating; verify it interacts correctly with the
existing Prisma client singleton in `lib/prisma.ts`.

### (c) `pgbouncer=true` in `lib/prisma.ts` — ONLY after confirming the pooler URL

Adding `pgbouncer=true` to the Prisma connection string tells Prisma it is
talking to a transaction-mode pooler (disables prepared statements, which the
transaction pooler does not support across pooled connections).

**Precondition:** confirm the production `DATABASE_URL` actually points at the
Supabase **transaction pooler** (`...pooler.supabase.com:6543`, transaction
mode) before adding this flag. If prod is pointed at the session pooler or a
direct connection, `pgbouncer=true` would be wrong. Do NOT set this flag blind.

## Risk to avoid

**Do NOT set `connection_limit=1`.**

`lib/prisma.ts` deliberately raised the per-Prisma-Client `connection_limit`
from the Supabase pgbouncer default of **1 → 5** (RA-4990) to stop **P2024**
`Timed out fetching a new connection from the connection pool` errors. Those
errors occurred when multiple queries fired concurrently within a single
serverless invocation (e.g. the setup-wizard hydrate route + FeatureHealthCard
polling + OAuth callback writes all competing for one connection).

Reverting to `connection_limit=1` while chasing connection-pooler tuning would
re-introduce P2024 timeouts. The `=5` value is a deliberate fix, documented
inline in `lib/prisma.ts` — leave it alone.

## What this PR changes

- `vercel.json`: add `"regions": ["syd1"]` (step (a) only).
- `docs/latency-connection-fix.md`: this document.

No application code, no Prisma schema, no `lib/prisma.ts`, and no
`connection_limit` / `pgbouncer` changes are included here.
