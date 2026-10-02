#!/usr/bin/env node
// Refuses a test run whose environment can reach a Postgres that is not on
// this machine. DB-gated suites skip only when DATABASE_URL is unset, so a
// shell with a production URL exported would run their deleteMany cleanup
// against it.
//
// The host is read with pg's own parser, resolved through pg, so the guard and
// the connection cannot disagree: a `?host=` query parameter beats the URL
// hostname in pg. Output names the variable, the rule and the host only, never
// the value, because a refused value is usually a production URL with its
// password in it.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { parse } = createRequire(require.resolve("pg"))("pg-connection-string");

export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const GUARDED_NAME = /^(?:DATABASE_URL|DIRECT_URL|[A-Z0-9_]+_DATABASE_URL|DATABASE_URL_[A-Z0-9_]+)$/;
const POSTGRES_SCHEME = /^\s*(?:postgres|postgresql|prisma\+postgres):\/\//i;
const HOST_PARAMS = new Set(["host", "hostaddr"]);

export class LocalTestDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "LocalTestDatabaseError";
  }
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The parsed host is trusted only when the raw authority (between `//` and the
// next `/`, `?` or `#`) is that host, optionally after `userinfo@` and before
// `:port`, and no `@` follows in the path. An unencoded `/` in a password
// makes pg return part of the password as the "host"
// (`postgresql://secret/x@db.example/y` parses to host `secret`); the `@`
// after the `/` is the tell, so that shape is refused and never printed.
function authorityEndsWithHost(raw, host) {
  const match = /^[a-z+]+:\/\/([^?#]*)/i.exec(raw.trim());
  if (!match) return false;
  const [authority, ...path] = match[1].split("/");
  if (path.join("/").includes("@")) return false;
  const shown = host.startsWith("[") || !host.includes(":") ? host : `[${host}]`;
  return new RegExp(`^(?:[^@]*@)?${escape(shown)}(?::\\d+)?$`, "i").test(authority);
}

const bare = (host) => host.replace(/^\[(.*)\]$/, "$1").toLowerCase();

/** One connection string. Returns null when local, else { rule, host }. */
export function checkConnectionString(raw) {
  if (raw.trim() === "") return { rule: "is set but blank", host: "<unparseable>" };
  let config;
  try {
    config = parse(raw.trim());
  } catch {
    return { rule: "does not parse", host: "<unparseable>" };
  }
  const query = raw.split("#")[0].split("?")[1];
  if (query) {
    for (const key of new URLSearchParams(query).keys()) {
      if (HOST_PARAMS.has(key.toLowerCase())) {
        return { rule: `sets \`${key.toLowerCase()}\` in its query`, host: "<ambiguous>" };
      }
    }
  }
  const host = typeof config.host === "string" ? config.host : "";
  if (host === "") return { rule: "names no host (pg would fall back to PGHOST)", host: "<none>" };
  if (host.includes(",")) return { rule: "names more than one host", host: "<ambiguous>" };
  if (!authorityEndsWithHost(raw, host)) {
    return { rule: "host cannot be read without the credentials", host: "<ambiguous>" };
  }
  if (!LOCAL_HOSTS.has(bare(host))) return { rule: "host is not local", host };
  return null;
}

/** Every guarded entry in env that is not local. "" counts as unset. */
export function findViolations(env) {
  const found = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value === "") continue;
    if (!GUARDED_NAME.test(name) && !POSTGRES_SCHEME.test(value)) continue;
    const violation = checkConnectionString(value);
    if (violation) found.push({ name, ...violation });
  }
  const direct = env.DIRECT_URL;
  if (typeof direct === "string" && direct !== "" && direct !== env.DATABASE_URL) {
    if (!found.some((v) => v.name === "DIRECT_URL")) {
      found.push({ name: "DIRECT_URL", rule: "differs from DATABASE_URL", host: "<not shown>" });
    }
  }
  return found;
}

export function describeViolations(found) {
  return (
    "test database guard refused: " +
    found.map((v) => `${v.name} ${v.rule} (host=${v.host})`).join("; ") +
    ". Tests may only reach a Postgres on localhost, 127.0.0.1 or ::1."
  );
}

/** Throws LocalTestDatabaseError when any guarded entry is not local. */
export function assertLocalTestDatabase(env) {
  const found = findViolations(env);
  if (found.length > 0) throw new LocalTestDatabaseError(describeViolations(found));
}

/** The host pg would use for a URL that already passed the guard. */
export function localHostOf(raw) {
  return checkConnectionString(raw) === null ? parse(raw.trim()).host : null;
}

/** The same rules for one string, e.g. the URL a pool is about to use. */
export function assertLocalConnectionString(raw, name = "connection string") {
  const violation = typeof raw === "string" ? checkConnectionString(raw) : null;
  if (violation) throw new LocalTestDatabaseError(describeViolations([{ name, ...violation }]));
}

export function main(env = process.env) {
  try {
    assertLocalTestDatabase(env);
  } catch (error) {
    if (!(error instanceof LocalTestDatabaseError)) throw error;
    console.error(`[test-db-guard] ${error.message}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
