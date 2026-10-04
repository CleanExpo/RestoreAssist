import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PG_POOL_CONNECTION_TIMEOUT_MS, pgPoolTls } from "./prisma-pool-config";

declare global {
  var prisma: PrismaClient | undefined;
  var pgPool: Pool | undefined;
  // Installed by config/vitest.db-guard.ts only; absent outside tests.
  var __testDbGuard: ((connectionString: string) => void) | undefined;
}

/**
 * RA-4990 — cap concurrent connections per serverless invocation.
 * Prisma 7 uses a `pg` Pool via driver adapter (URL `connection_limit` is ignored).
 */
function createPool(connectionString: string): Pool {
  // Under tests, refuse a non-local URL before the pool exists. The hook is
  // installed only by the vitest setup file, so this does nothing elsewhere.
  globalThis.__testDbGuard?.(connectionString);
  return new Pool({
    ...pgPoolTls(connectionString),
    max: 5,
    connectionTimeoutMillis: PG_POOL_CONNECTION_TIMEOUT_MS,
  });
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize PrismaClient");
  }

  const pool = globalThis.pgPool ?? createPool(connectionString);
  if (process.env.NODE_ENV !== "production") globalThis.pgPool = pool;

  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

/**
 * Lazy singleton. Prisma 7's pg driver adapter needs DATABASE_URL at
 * CONSTRUCTION (pre-7 clients deferred until first query), so an eager
 * module-scope `createPrismaClient()` throws during `next build` page-data
 * collection in any environment without DATABASE_URL — which is why every
 * Vercel deploy of main broke after the Prisma 7 upgrade (RA-7079). Construct
 * on first property access instead; runtime behaviour is unchanged.
 */
let client: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (client) return client;
  client = globalThis.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalThis.prisma = client;
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getPrismaClient(), prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(getPrismaClient())
      : value;
  },
  has(_target, prop) {
    return Reflect.has(getPrismaClient(), prop);
  },
});
