import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * RA-4990 — bump per-Prisma-Client connection limit from the Supabase
 * pgbouncer default of 1 to 5. The default surfaced P2024
 * `Timed out fetching a new connection from the connection pool` errors
 * whenever multiple queries fired concurrently within one serverless
 * invocation (e.g. the setup-wizard's hydrate route + FeatureHealthCard
 * polling + OAuth callback writes all competing for one connection).
 *
 * Safe because Supabase's pooler.supabase.com endpoint defaults to a
 * project-level pool of 60+ transactions in `transaction` mode; per-
 * Client `connection_limit=5` means ~12 concurrent serverless invocations
 * before the pooler saturates, well above steady-state load.
 *
 * Append the param only when DATABASE_URL is set (so local Prisma CLI
 * tooling using the bare default URL is unaffected).
 */
function withPoolConfig(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connection_limit=/.test(url)) return url; // already configured
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

const augmentedUrl = withPoolConfig(process.env.DATABASE_URL);

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    datasources: augmentedUrl ? { db: { url: augmentedUrl } } : undefined,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
