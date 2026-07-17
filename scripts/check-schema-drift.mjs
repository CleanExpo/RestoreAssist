/**
 * Schema drift smoke test — run AFTER `prisma migrate deploy` in the build pipeline.
 *
 * Compares prisma/schema.prisma against the live database. Scalar-column drift is
 * FATAL (the original guard); the WS3 dimensions below are REPORT-ONLY by default
 * (set DRIFT_STRICT=1 — prod verification / RA-1807 runbook — to make them fatal).
 * Originally scalar-columns-only; WS3 (RA-1807 remediation) extends it
 * to unique indexes, and column nullability, and makes every comparator
 * BIDIRECTIONAL and PER-OBJECT:
 *
 *   - missing-in-db : schema declares an object the DB lacks (a no-op'd migration)
 *   - extra-in-db   : the DB carries an object the schema removed (a DROP that
 *                     never applied — e.g. a stale unique). A one-directional
 *                     schema->DB diff is BLIND to these, yet all three live
 *                     RA-1807 drift bugs are extra-in-db uniques (adversarial-
 *                     verify AV-2).
 *   - nullability   : a column's NOT NULL differs between schema and DB (the Xero
 *                     `category` bug: nullable in schema, NOT NULL in prod).
 *
 * Each drifted object is reported on its own line so a fixture can assert
 * per-object detection (AC-15) — an aggregate pass/fail would let a comparator
 * that only sees the `category` mismatch mask blindness to the stale uniques.
 *
 * Root cause this guards against: a `_prisma_migrations` row can be marked
 * `finished_at IS NOT NULL` while its DDL silently no-op'd against the :6543
 * transaction pooler (see scripts/build.sh WS1 fail-close + the RA-1807 runbook).
 *
 * Limits: relations and CHECK constraints are still not compared (enums now are,
 * name + values, via pg_enum). Unique
 * detection reads pg_indexes column lists; expression/partial unique indexes are
 * skipped (noted in extractIndexColumns).
 *
 * Usage:   node scripts/check-schema-drift.mjs
 * Exit:    0 no drift · 1 drift detected (details on stderr) · 2 connect/parse error
 */
import fs from "node:fs";

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

/** Column-set signature — sorted so index column ORDER never causes a false diff. */
export function sig(cols) {
  return [...cols].map((c) => c.trim()).sort().join(",");
}

/**
 * Parse schema.prisma into the objects we compare: per-model column set, the
 * NOT-NULL column set (a field is NOT NULL unless its type carries `?`), and the
 * set of unique column-signatures (field-level `@unique` + block `@@unique(...)`).
 * Pure — unit-tested directly.
 * @param {string} content
 * @returns {{ tables: string[], columns: Map<string,Set<string>>, notNull: Map<string,Set<string>>, uniques: Map<string,Set<string>> }}
 */
export function parseSchemaObjects(content) {
  const modelRe = /^model\s+(\w+)\s*\{/gm;

  // Parse enum blocks into name -> Set(values). Names alone feed the field-type
  // check below; the values feed enum drift detection (a no-op'd enum ALTER —
  // e.g. ADD VALUE — that migrate-deploy reported as applied).
  const enumValues = new Map();
  const enumRe = /^enum\s+(\w+)\s*\{/gm;
  let em;
  while ((em = enumRe.exec(content)) !== null) {
    const ename = em[1];
    let ei = em.index + em[0].length;
    let edepth = 1;
    while (edepth > 0 && ei < content.length) {
      const ch = content[ei];
      if (ch === "{") edepth++;
      else if (ch === "}") edepth--;
      ei++;
    }
    const ebody = content.slice(em.index + em[0].length, ei - 1);
    const vals = new Set();
    for (const raw of ebody.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const token = line.split(/\s+/)[0]; // value name; ignores a trailing @map(...)
      if (token) vals.add(token);
    }
    enumValues.set(ename, vals);
  }
  const enums = new Set(enumValues.keys());

  const columns = new Map();
  const notNull = new Map();
  const uniques = new Map();
  const tables = [];

  let m;
  while ((m = modelRe.exec(content)) !== null) {
    const name = m[1];
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && i < content.length) {
      const c = content[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    const body = content.slice(m.index + m[0].length, i - 1);

    tables.push(name);
    const cols = new Set();
    const nn = new Set();
    const uq = new Set();

    for (let raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;

      // Block-level unique index. Handles both @@unique([a, b]) and
      // @@unique(fields: [a, b], name: "x").
      if (line.startsWith("@@")) {
        const um = line.match(/@@unique\([^[]*\[([^\]]+)\]/);
        if (um) {
          const fields = um[1]
            .split(",")
            .map((f) => f.trim().replace(/:.*/, "").replace(/["'`]/g, ""))
            .filter(Boolean);
          if (fields.length) uq.add(sig(fields));
        }
        continue;
      }

      const tokens = line.split(/\s+/);
      if (tokens.length < 2) continue;
      const fname = tokens[0];
      const ftype = tokens[1];
      if (ftype.endsWith("[]")) continue; // relation array
      const core = ftype.replace(/[?\[\]]/g, "");
      if (!PRISMA_SCALARS.has(core) && !enums.has(core)) continue; // relation/unknown

      cols.add(fname);
      if (!ftype.includes("?")) nn.add(fname); // NOT NULL unless optional
      // Field-level @unique => single-column unique index on this column.
      if (/@unique\b/.test(line)) uq.add(sig([fname]));
    }

    columns.set(name, cols);
    notNull.set(name, nn);
    uniques.set(name, uq);
  }

  return { tables, columns, notNull, uniques, enums: enumValues };
}

/**
 * Enum drift between schema and DB — schema-global (not per-table). Detects a
 * missing/extra enum type AND per-value drift (a no-op'd `ALTER TYPE ... ADD
 * VALUE`, the enum analogue of the RA-1807 no-op'd DDL). Report-only unless
 * DRIFT_STRICT=1, same rollout policy as unique/nullability.
 * @param {Map<string,Set<string>>} expectedEnums
 * @param {Map<string,Set<string>>} actualEnums
 */
export function computeEnumDrift(expectedEnums, actualEnums) {
  const findings = [];
  for (const [name, expVals] of expectedEnums) {
    if (!actualEnums.has(name)) {
      findings.push({
        table: name,
        kind: "enum",
        object: name,
        direction: "missing-in-db",
        detail: `enum ${name} declared in schema but missing from DB`,
      });
      continue;
    }
    const dbVals = actualEnums.get(name);
    for (const v of expVals) {
      if (!dbVals.has(v)) {
        findings.push({
          table: name,
          kind: "enum",
          object: `${name}.${v}`,
          direction: "missing-in-db",
          detail: `enum value ${name}.${v} in schema but missing from DB — an ADD VALUE that never applied`,
        });
      }
    }
    for (const v of dbVals) {
      if (!expVals.has(v)) {
        findings.push({
          table: name,
          kind: "enum",
          object: `${name}.${v}`,
          direction: "extra-in-db",
          detail: `enum value ${name}.${v} present in DB but not in schema`,
        });
      }
    }
  }
  return findings;
}

/**
 * Column list of a UNIQUE index from its pg_indexes `indexdef`. Returns a sorted
 * signature, or null for a non-unique / expression / partial index we can't
 * compare by plain columns.
 * @param {string} indexdef
 */
export function extractIndexColumns(indexdef) {
  if (!/CREATE\s+UNIQUE\s+INDEX/i.test(indexdef)) return null;
  // Primary-key backing indexes (Prisma/Postgres name them <table>_pkey) are
  // structural — present on every table — and are NOT the @unique/@@unique drift
  // this gate tracks. Skip them, or every table reads as "extra-in-db".
  const nameM = indexdef.match(/CREATE\s+UNIQUE\s+INDEX\s+"?([^"\s]+)"?/i);
  if (nameM && /_pkey$/i.test(nameM[1])) return null;
  if (/\bWHERE\b/i.test(indexdef)) return null; // partial index — skip
  const paren = indexdef.match(/USING\s+\w+\s*\(([^)]+)\)/i);
  if (!paren) return null;
  const cols = paren[1]
    .split(",")
    .map((c) => c.trim().replace(/["'`]/g, "").replace(/\s+(ASC|DESC)$/i, ""));
  // An expression index (e.g. lower(x)) contains characters no column has.
  if (cols.some((c) => /[()]/.test(c) || c === "")) return null;
  return sig(cols);
}

/**
 * Per-object, bidirectional drift between the schema and the live DB. Pure so it
 * is unit-tested with fixtures reproducing prod (AC-15). Both `expected` and
 * `actual` are `{ tables, columns, notNull, uniques }` shapes (uniques = Set of
 * column-signatures per table).
 * @returns {{ table: string, kind: "column"|"unique"|"nullability", object: string, direction: "missing-in-db"|"extra-in-db"|"nullability-mismatch", detail: string }[]}
 */
export function computeDrift(expected, actual) {
  const findings = [];
  for (const table of expected.tables) {
    const expCols = expected.columns.get(table) || new Set();
    const dbCols = actual.columns.get(table) || new Set();
    const expUq = expected.uniques.get(table) || new Set();
    const dbUq = actual.uniques.get(table) || new Set();
    const expNN = expected.notNull.get(table) || new Set();
    const dbNN = actual.notNull.get(table) || new Set();

    // Columns — schema column absent from DB (the original no-op'd-DDL guard).
    for (const col of expCols) {
      if (!dbCols.has(col)) {
        findings.push({
          table,
          kind: "column",
          object: col,
          direction: "missing-in-db",
          detail: `column ${table}.${col} declared in schema but missing from DB`,
        });
      }
    }

    // Unique indexes — BIDIRECTIONAL (extra-in-db catches the stale RA-1807 uniques).
    for (const s of expUq) {
      if (!dbUq.has(s)) {
        findings.push({
          table,
          kind: "unique",
          object: s,
          direction: "missing-in-db",
          detail: `unique (${s}) declared in schema but missing from DB`,
        });
      }
    }
    for (const s of dbUq) {
      if (!expUq.has(s)) {
        findings.push({
          table,
          kind: "unique",
          object: s,
          direction: "extra-in-db",
          detail: `unique (${s}) present in DB but not in schema — a DROP that never applied`,
        });
      }
    }

    // Nullability — compare only columns present in both, both directions.
    for (const col of expCols) {
      if (!dbCols.has(col)) continue;
      const expIsNN = expNN.has(col);
      const dbIsNN = dbNN.has(col);
      if (expIsNN !== dbIsNN) {
        findings.push({
          table,
          kind: "nullability",
          object: col,
          direction: "nullability-mismatch",
          detail: `column ${table}.${col} is ${
            expIsNN ? "NOT NULL" : "nullable"
          } in schema but ${dbIsNN ? "NOT NULL" : "nullable"} in DB`,
        });
      }
    }
  }
  return findings;
}

export function formatFindings(findings) {
  return findings.map((f) => `  [${f.direction}] ${f.detail}`).join("\n");
}

async function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`✗ schema file not found at ${SCHEMA_PATH}`);
    process.exit(2);
  }
  const expected = parseSchemaObjects(fs.readFileSync(SCHEMA_PATH, "utf-8"));
  if (expected.tables.length === 0) {
    console.error("✗ no models found in schema — parse error?");
    process.exit(2);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let colRows;
  let idxRows;
  let enumRows;
  try {
    colRows = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      expected.tables,
    );
    idxRows = await prisma.$queryRawUnsafe(
      `SELECT tablename, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      expected.tables,
    );
    enumRows = await prisma.$queryRawUnsafe(
      `SELECT t.typname AS enum_name, e.enumlabel AS value
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'`,
    );
  } catch (err) {
    console.error(`✗ could not query live schema: ${err.message}`);
    await prisma.$disconnect();
    process.exit(2);
  }
  await prisma.$disconnect();

  // Build the actual shape.
  const columns = new Map();
  const notNull = new Map();
  const uniques = new Map();
  for (const t of expected.tables) {
    columns.set(t, new Set());
    notNull.set(t, new Set());
    uniques.set(t, new Set());
  }
  for (const r of colRows) {
    columns.get(r.table_name)?.add(r.column_name);
    if (r.is_nullable === "NO") notNull.get(r.table_name)?.add(r.column_name);
  }
  for (const r of idxRows) {
    const s = extractIndexColumns(r.indexdef);
    if (s !== null) uniques.get(r.tablename)?.add(s);
  }
  const actual = { tables: expected.tables, columns, notNull, uniques };

  // Actual enum types + values from pg_enum.
  const actualEnums = new Map();
  for (const r of enumRows) {
    if (!actualEnums.has(r.enum_name)) actualEnums.set(r.enum_name, new Set());
    actualEnums.get(r.enum_name).add(r.value);
  }

  const drift = [
    ...computeDrift(expected, actual),
    ...computeEnumDrift(expected.enums, actualEnums),
  ];
  if (drift.length === 0) {
    console.log(
      `[drift-check] ✓ no schema drift — ${expected.tables.length} models: columns, unique indexes, nullability, and enum values all match`,
    );
    process.exit(0);
  }

  // Rollout policy: the ORIGINAL scalar-column check stays FATAL (a schema column
  // missing from the DB = `migrate deploy` reported success but the DDL never
  // applied — the exact failure this gate was built for). The NEW dimensions
  // (unique indexes + nullability) are REPORT-ONLY by default so a stricter gate
  // can ship without blocking every build on pre-existing latent drift between
  // schema.prisma and the migrations. Set DRIFT_STRICT=1 (prod verification / the
  // RA-1807 runbook) to make the new dimensions fatal too.
  const columnDrift = drift.filter((f) => f.kind === "column");
  const strict = process.env.DRIFT_STRICT === "1";
  const fatal = columnDrift.length > 0 || strict;

  const byTable = new Map();
  for (const f of drift) byTable.set(f.table, (byTable.get(f.table) || 0) + 1);
  console.error(
    `[drift-check] ${fatal ? "✗" : "⚠"} ${drift.length} drift finding(s) across ${byTable.size} table(s):`,
  );
  console.error(formatFindings(drift));
  console.error("");

  if (columnDrift.length > 0) {
    console.error(
      "A `migrate deploy` reported success but a column's DDL never applied — re-run the",
    );
    console.error(
      "affected migrations against the direct :5432 connection (RA-1807 runbook).",
    );
    process.exit(1);
  }
  if (strict) {
    console.error(
      "DRIFT_STRICT=1 — unique/nullability drift is fatal (prod verification mode).",
    );
    process.exit(1);
  }
  console.error(
    "[drift-check] unique/nullability drift is REPORT-ONLY (set DRIFT_STRICT=1 to enforce) — not failing the build.",
  );
  process.exit(0);
}

// Run only when invoked directly (not when imported by the drift-gate tests).
const invokedDirectly =
  process.argv[1] && /check-schema-drift\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[drift-check] unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
