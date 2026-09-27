/**
 * How long a caller waits for a free connection from the `pg` pool that
 * lib/prisma.ts builds. Kept in its own module so code that opens an
 * interactive transaction (whose Prisma `maxWait` defaults to 2s) can match
 * the pool without importing lib/prisma.ts, which many tests mock wholesale.
 */
export const PG_POOL_CONNECTION_TIMEOUT_MS = 20_000;
