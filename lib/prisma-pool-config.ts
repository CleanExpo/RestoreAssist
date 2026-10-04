/**
 * How long a caller waits for a free connection from the `pg` pool that
 * lib/prisma.ts builds. Kept in its own module so code that opens an
 * interactive transaction (whose Prisma `maxWait` defaults to 2s) can match
 * the pool without importing lib/prisma.ts, which many tests mock wholesale.
 */
export const PG_POOL_CONNECTION_TIMEOUT_MS = 20_000;

/**
 * The connection string and TLS options for the `pg` pool.
 *
 * Supabase and `sslmode=require` URLs connect over TLS without verifying the
 * server certificate. `pg` lets an `sslmode` in the URL override the `ssl`
 * option and reads `require` as verify-full, so the option alone did nothing:
 * the DigitalOcean console's `?sslmode=require` URL failed every query with
 * "self-signed certificate in certificate chain" (prod outage, 04/10/2026).
 * Every `sslmode` is therefore taken out of the URL when the option replaces
 * a `require`.
 */
export function pgPoolTls(connectionString: string): {
  connectionString: string;
  ssl: { rejectUnauthorized: false } | undefined;
} {
  const hashAt = connectionString.indexOf("#");
  const beforeHash =
    hashAt === -1 ? connectionString : connectionString.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : connectionString.slice(hashAt);
  const queryAt = beforeHash.indexOf("?");
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(
    queryAt === -1 ? "" : beforeHash.slice(queryAt + 1),
  );

  // pg honours the last sslmode when one is repeated.
  const requireMode = params.getAll("sslmode").at(-1) === "require";
  if (!requireMode) {
    return {
      connectionString,
      ssl: connectionString.includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    };
  }
  params.delete("sslmode");
  const query = params.toString();
  return {
    connectionString: `${base}${query ? `?${query}` : ""}${hash}`,
    ssl: { rejectUnauthorized: false },
  };
}
