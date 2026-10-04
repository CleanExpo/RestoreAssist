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
 * The `require` is therefore taken out of the URL when the option replaces it.
 */
export function pgPoolTls(connectionString: string): {
  connectionString: string;
  ssl: { rejectUnauthorized: false } | undefined;
} {
  const requireMode = /[?&]sslmode=require(?=&|$)/;
  if (
    !connectionString.includes("supabase") &&
    !requireMode.test(connectionString)
  ) {
    return { connectionString, ssl: undefined };
  }
  return {
    connectionString: connectionString
      .replace(requireMode, (match) => (match[0] === "?" ? "?" : ""))
      .replace("?&", "?")
      .replace(/\?$/, ""),
    ssl: { rejectUnauthorized: false },
  };
}
