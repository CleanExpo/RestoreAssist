#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";

export function fingerprintIdentity(identity) {
  const database = identity.database_name;
  const schema = identity.schema_name;
  const instanceSentinel = identity.instance_sentinel;
  if (
    typeof database !== "string" ||
    database.trim().length === 0 ||
    typeof schema !== "string" ||
    schema.trim().length === 0 ||
    typeof instanceSentinel !== "string" ||
    instanceSentinel.trim().length === 0
  ) {
    throw new Error("database identity query returned incomplete fields");
  }
  // A direct migration connection and the runtime transaction pooler are
  // intentionally different network endpoints. The release contract is the
  // logical PostgreSQL namespace and migration-owned per-database sentinel
  // they expose, not their proxy address/port. The sentinel distinguishes two
  // independent clusters that happen to use the same database/schema names.
  // NUL is not valid in PostgreSQL database or schema names, so this is an
  // unambiguous, versioned encoding shared with the health endpoint.
  return createHash("sha256")
    .update(`restoreassist-logical-db-v2\0${database}\0${schema}\0${instanceSentinel}`)
    .digest("hex");
}

export function assertExpectedLogicalIdentity(identity, expectedDatabase, expectedSchema, source) {
  if (
    identity.database_name !== expectedDatabase ||
    identity.schema_name !== expectedSchema
  ) {
    throw new Error(`${source} connected to the wrong canonical database or schema`);
  }
  return fingerprintIdentity(identity);
}

async function readIdentity(connectionString) {
  const pg = await import("pg");
  const Pool = pg.Pool ?? pg.default?.Pool;
  if (!Pool) throw new Error("pg Pool implementation is unavailable");
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 20_000,
    ssl: connectionString.includes("supabase")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  try {
    const result = await pool.query(`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name,
             (
               SELECT "instanceId"::text
               FROM "DatabaseInstanceSentinel"
               WHERE "singleton" = true
             ) AS instance_sentinel
    `);
    if (result.rows.length !== 1) {
      throw new Error(`database identity query returned ${result.rows.length} rows`);
    }
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

export async function main(argv = process.argv) {
  try {
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) throw new Error("DIRECT_URL is required");
    const expectedDatabase = process.env.EXPECTED_DIRECT_DATABASE_NAME;
    const expectedSchema = process.env.EXPECTED_DIRECT_DATABASE_SCHEMA;
    if (!expectedDatabase || !expectedSchema) {
      throw new Error("EXPECTED_DIRECT_DATABASE_NAME and EXPECTED_DIRECT_DATABASE_SCHEMA are required");
    }
    const directIdentity = await readIdentity(directUrl);
    const directFingerprint = assertExpectedLogicalIdentity(
      directIdentity,
      expectedDatabase,
      expectedSchema,
      "DIRECT_URL",
    );

    if (argv.includes("--emit-github-env")) {
      const githubEnv = process.env.GITHUB_ENV;
      if (!githubEnv) throw new Error("GITHUB_ENV is required for --emit-github-env");
      await appendFile(
        githubEnv,
        `EXPECTED_DATABASE_FINGERPRINT=${directFingerprint}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      console.log("[database-identity] wrote the direct database fingerprint to GITHUB_ENV");
      return 0;
    }

    const runtimeUrl = process.env.DATABASE_URL;
    if (!runtimeUrl) throw new Error("DATABASE_URL is required for identity comparison");
    const runtimeIdentity = await readIdentity(runtimeUrl);
    const runtimeFingerprint = assertExpectedLogicalIdentity(
      runtimeIdentity,
      expectedDatabase,
      expectedSchema,
      "DATABASE_URL",
    );
    if (runtimeFingerprint !== directFingerprint) {
      throw new Error("DATABASE_URL and DIRECT_URL identify different canonical database/schema values");
    }
    console.log("[database-identity] PASS: runtime and migration URLs identify the same database");
    return 0;
  } catch (error) {
    console.error(`[database-identity] ERROR: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
