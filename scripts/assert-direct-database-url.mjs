#!/usr/bin/env node

export function assertDirectDatabaseUrl(
  rawUrl,
  expectedHost,
  expectedDatabase,
  expectedSchema,
) {
  if (!rawUrl) throw new Error("DIRECT_URL is required");
  if (!expectedHost) throw new Error("EXPECTED_DIRECT_DATABASE_HOST is required");
  if (!expectedDatabase) throw new Error("EXPECTED_DIRECT_DATABASE_NAME is required");
  if (!expectedSchema) throw new Error("EXPECTED_DIRECT_DATABASE_SCHEMA is required");
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DIRECT_URL is not a valid URL");
  }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error("DIRECT_URL must use the PostgreSQL protocol");
  }
  if (parsed.hostname !== expectedHost) {
    throw new Error(
      `DIRECT_URL hostname mismatch: expected ${expectedHost}, observed ${parsed.hostname}`,
    );
  }
  if (parsed.port && parsed.port !== "5432") {
    throw new Error(
      `DIRECT_URL must use the direct PostgreSQL session port 5432; observed ${parsed.port}`,
    );
  }
  if (!parsed.pathname || parsed.pathname === "/") {
    throw new Error("DIRECT_URL must name a database");
  }
  let observedDatabase;
  try {
    observedDatabase = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("DIRECT_URL database name is not valid percent-encoding");
  }
  if (!observedDatabase || observedDatabase.includes("/") || observedDatabase !== expectedDatabase) {
    throw new Error(
      `DIRECT_URL database mismatch: expected ${expectedDatabase}, observed ${observedDatabase || "<missing>"}`,
    );
  }
  const connectionOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "service",
    "user",
  ]);
  const unsafeParameters = [...parsed.searchParams.keys()].filter((key) =>
    connectionOverrides.has(key.toLowerCase()),
  );
  if (unsafeParameters.length > 0) {
    throw new Error(
      `DIRECT_URL must not override connection identity in query parameters: ${unsafeParameters.join(", ")}`,
    );
  }
  const allowedParameters = new Set([
    "connect_timeout",
    "sslcert",
    "sslkey",
    "sslmode",
    "sslrootcert",
    "schema",
  ]);
  const unexpectedParameters = [...parsed.searchParams.keys()].filter(
    (key) => !allowedParameters.has(key),
  );
  if (unexpectedParameters.length > 0) {
    throw new Error(
      `DIRECT_URL contains unapproved query parameters: ${unexpectedParameters.join(", ")}`,
    );
  }
  const keyCounts = new Map();
  for (const key of parsed.searchParams.keys()) {
    const normalised = key.toLowerCase();
    keyCounts.set(normalised, (keyCounts.get(normalised) ?? 0) + 1);
  }
  const duplicateKeys = [...keyCounts].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateKeys.length > 0) {
    throw new Error(`DIRECT_URL contains duplicate query parameters: ${duplicateKeys.join(", ")}`);
  }
  const observedSchema = parsed.searchParams.get("schema") ?? "public";
  if (observedSchema !== expectedSchema) {
    throw new Error(
      `DIRECT_URL schema mismatch: expected ${expectedSchema}, observed ${observedSchema}`,
    );
  }
}

export function main() {
  try {
    assertDirectDatabaseUrl(
      process.env.DIRECT_URL,
      process.env.EXPECTED_DIRECT_DATABASE_HOST,
      process.env.EXPECTED_DIRECT_DATABASE_NAME,
      process.env.EXPECTED_DIRECT_DATABASE_SCHEMA,
    );
  } catch (error) {
    console.error(`[direct-database] ERROR: ${error.message}`);
    return 1;
  }
  console.log("[direct-database] PASS: direct database host and session port are bound");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
