/**
 * SSL helpers for Prisma migrate / recover / drift against managed Postgres
 * (Heroku, Supabase, etc.) whose chains Node/pg reject by default.
 *
 * Prisma Heroku docs: append `sslmode=no-verify` for PrismaPg / pg.
 * Newer `pg` treats `prefer`/`require`/`verify-ca` as `verify-full`, which
 * surfaces SELF_SIGNED_CERT_IN_CHAIN on Heroku's default certs.
 *
 * Scoped to migrate-pipeline scripts — does not rewrite Heroku Config Vars.
 * Localhost / 127.0.0.1 URLs are left unchanged.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * @param {string | undefined | null} connectionString
 * @returns {string | undefined | null}
 */
export function withPgMigrateSsl(connectionString) {
  if (!connectionString) return connectionString;

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    return connectionString;
  }

  const mode = (url.searchParams.get("sslmode") || "").toLowerCase();
  if (mode === "no-verify" || mode === "disable") {
    return connectionString;
  }

  // Replace require/prefer/verify-* so pg does not verify Heroku's chain.
  url.searchParams.set("sslmode", "no-verify");
  return url.toString();
}

/**
 * Mutate DATABASE_URL / DIRECT_URL on `env` for Prisma CLI + pg clients.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applyMigrateSslToEnv(env = process.env) {
  if (env.DATABASE_URL) {
    env.DATABASE_URL = withPgMigrateSsl(env.DATABASE_URL) ?? env.DATABASE_URL;
  }
  if (env.DIRECT_URL) {
    env.DIRECT_URL = withPgMigrateSsl(env.DIRECT_URL) ?? env.DIRECT_URL;
  } else if (env.DATABASE_URL) {
    // Match build.sh: DIRECT_URL falls back to DATABASE_URL for migrate.
    env.DIRECT_URL = env.DATABASE_URL;
  }
  return env;
}

/**
 * Explicit pg `ssl` option when the URL (or host) needs insecure trust.
 * Prefer pairing with `withPgMigrateSsl` so Prisma CLI and pg agree.
 * @param {string | undefined | null} connectionString
 * @returns {{ rejectUnauthorized: false } | undefined}
 */
export function pgMigrateSslOption(connectionString) {
  if (!connectionString) return undefined;
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (LOCAL_HOSTS.has(hostname)) return undefined;

  // Remote migrate targets (Heroku DYNO, managed hosts, or rewritten URL).
  if (
    connectionString.includes("sslmode=no-verify") ||
    connectionString.includes("supabase") ||
    connectionString.includes("amazonaws.com") ||
    hostname.includes("heroku") ||
    process.env.DYNO
  ) {
    return { rejectUnauthorized: false };
  }

  // Any other remote URL during migrate: same trust as Heroku docs.
  return { rejectUnauthorized: false };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Print `export KEY='…'` lines for `eval "$(node … --export-shell)"` in build.sh.
 */
export function printExportShell(env = process.env) {
  applyMigrateSslToEnv(env);
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (env[key]) {
      process.stdout.write(`export ${key}=${shellSingleQuote(env[key])}\n`);
    }
  }
}

import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (
  entry &&
  import.meta.url === pathToFileURL(entry).href &&
  process.argv.includes("--export-shell")
) {
  printExportShell();
}
