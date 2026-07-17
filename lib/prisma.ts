import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prisma: PrismaClient | undefined;
  var pgPool: Pool | undefined;
}

/**
 * RA-4990 — cap concurrent connections per serverless invocation.
 * Prisma 7 uses a `pg` Pool via driver adapter (URL `connection_limit` is ignored).
 */
function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 20_000,
    ssl:
      connectionString.includes("supabase") ||
      connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
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
