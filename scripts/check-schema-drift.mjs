/**
 * Schema drift smoke test — run AFTER `prisma migrate deploy` in the build pipeline.
 *
 * Compares every scalar field on every model in prisma/schema.prisma against
 * the live `information_schema.columns`. If any column declared in the schema
 * is missing from the DB, exits with code 1 to fail the build.
 *
 * Root cause this guards against: a migration row in `_prisma_migrations` can
 * be marked `finished_at IS NOT NULL` while its DDL silently no-op'd. We hit
 * this overnight on the sandbox build — `migrate deploy` reported success but
 * 24 columns across 7 tables were never created. The dashboard widgets 500'd
 * for hours before someone noticed.
 *
 * Limits:
 * - Doesn't check enum types, relations, indexes, or constraints. Just scalar columns.
 * - Tolerant of legacy DB columns NOT in schema (extra-in-DB drift is dormant).
 * - Reads DIRECT_URL (falls back to DATABASE_URL) — same pattern as build.sh.
 *
 * Usage:
 *   node scripts/check-schema-drift.mjs
 *
 * Exit codes:
 *   0  No drift (all schema scalar columns exist in DB)
 *   1  Drift detected (with details on stderr)
 *   2  Could not connect / could not read schema
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const SCHEMA_PATH = "prisma/schema.prisma";

const PRISMA_SCALARS = new Set([
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Float",
  "Json",
  "BigInt",
  "Bytes",
  "Decimal",
]);

function parseSchema(content) {
  // Match: model <Name> { ... }
  const models = {};
  const modelRe = /^model\s+(\w+)\s*\{/gm;
  let m;
  while ((m = modelRe.exec(content)) !== null) {
    const name = m[1];
    // Walk forward to find the matching close brace
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && i < content.length) {
      const c = content[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    const body = content.slice(m.index + m[0].length, i - 1);
    models[name] = body;
  }

  // Also collect enum names so we can recognize them in field types.
  const enums = new Set();
  const enumRe = /^enum\s+(\w+)\s*\{/gm;
  while ((m = enumRe.exec(content)) !== null) enums.add(m[1]);

  // For each model, extract scalar fields
  const fields = {};
  for (const [name, body] of Object.entries(models)) {
    const list = [];
    for (let line of body.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      // <name> <Type>[?][[]] [attributes]
      const tokens = line.split(/\s+/);
      if (tokens.length < 2) continue;
      const fname = tokens[0];
      const ftype = tokens[1];
      if (ftype.endsWith("[]")) continue; // relation array
      const core = ftype.replace(/[?\[\]]/g, "");
      // Keep scalars + known enums. Skip unknown types (probably relations).
      if (!PRISMA_SCALARS.has(core) && !enums.has(core)) continue;
      // Also need to filter out lines that are RELATION attributes mistakenly
      // tokenized — look for @relation in the line; if present and the type
      // isn't an enum/scalar that we've allowed, skip.
      list.push(fname);
    }
    fields[name] = list;
  }
  return fields;
}

async function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`✗ schema file not found at ${SCHEMA_PATH}`);
    process.exit(2);
  }
  const schemaText = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const expected = parseSchema(schemaText);
  const modelNames = Object.keys(expected);
  if (modelNames.length === 0) {
    console.error("✗ no models found in schema — parse error?");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `, modelNames);
  } catch (err) {
    console.error(`✗ could not query information_schema.columns: ${err.message}`);
    await prisma.$disconnect();
    process.exit(2);
  }
  await prisma.$disconnect();

  // Build {tableName: Set<column>}
  const actual = {};
  for (const r of rows) {
    if (!actual[r.table_name]) actual[r.table_name] = new Set();
    actual[r.table_name].add(r.column_name);
  }

  // Diff
  const drift = [];
  for (const [model, expectedFields] of Object.entries(expected)) {
    const dbCols = actual[model] || new Set();
    const missing = expectedFields.filter((f) => !dbCols.has(f));
    if (missing.length > 0) {
      drift.push({ model, missing });
    }
  }

  if (drift.length === 0) {
    console.log(`[drift-check] ✓ no schema drift — ${modelNames.length} models, all scalar columns present`);
    process.exit(0);
  }

  console.error(`[drift-check] ✗ schema drift detected on ${drift.length} model(s):`);
  for (const { model, missing } of drift) {
    console.error(`  ${model}: ${missing.length} missing — ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`);
  }
  console.error("");
  console.error("This means `prisma migrate deploy` reported success but the DDL never");
  console.error("applied. Either re-run the affected migrations explicitly or apply the");
  console.error("missing columns via ALTER TABLE. Reference: /tmp/ra-deep-audit.md.");
  process.exit(1);
}

main().catch((err) => {
  console.error(`[drift-check] unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
