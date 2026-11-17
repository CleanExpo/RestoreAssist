/**
 * Nullable unique-key guard (RA-8440).
 *
 * Postgres treats NULLs as distinct in a unique index by default. A composite
 * unique key that contains an optional (`?`) column therefore does NOT stop two
 * rows whose other columns match and whose optional column is NULL. Code that
 * relies on such a key for idempotency (StorageMirrorJob, RA-8440) or for
 * "one row per X" (Integration, RA-8439) silently gets duplicates.
 *
 * This guard makes the decision explicit. Every composite unique key in
 * prisma/schema.prisma that contains an optional column must be listed in
 * scripts/nullable-unique-keys.allowlist.json as one of:
 *
 *   - "exempt"             NULL rows are meant to repeat; `reason` says why.
 *   - "nulls-not-distinct" a migration enforces it with NULLS NOT DISTINCT or a
 *                          partial unique index; `migration` names the file and
 *                          the guard checks the file says so.
 *   - "known-defect"       the key is broken; `ticket` owns the fix.
 *   - "undecided"          nobody has decided yet; `ticket` owns the decision.
 *
 * Allow-list entries for keys no longer in the schema also fail, so the list
 * cannot rot.
 *
 * Single-column keys (`@unique` on an optional field, or `@@unique([x])`) are
 * exempt by structure: with one column there is no non-NULL part for a NULL
 * row to defeat, so NULL simply means "no value".
 *
 * Usage: node scripts/check-nullable-unique-keys.mjs  (exit 1 on any violation)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchemaObjects } from "./check-schema-drift.mjs";

const KINDS = new Set(["exempt", "nulls-not-distinct", "known-defect", "undecided"]);

/**
 * Composite unique keys that contain at least one optional column.
 * Key ids look like `Model(colA,colB)` with columns sorted, so field order in
 * the schema does not matter.
 * @param {string} schemaText
 */
export function findNullableUniqueKeys(schemaText) {
  const { tables, notNull, uniques } = parseSchemaObjects(schemaText);
  const found = [];
  for (const model of tables) {
    const nn = notNull.get(model);
    for (const s of uniques.get(model)) {
      const columns = s.split(",");
      if (columns.length < 2) continue; // single-column: exempt by structure
      const optional = columns.filter((c) => !nn.has(c));
      if (optional.length === 0) continue;
      found.push({ id: `${model}(${s})`, model, columns, optional });
    }
  }
  return found;
}

/**
 * @param {string} schemaText
 * @param {Record<string, {kind: string, reason?: string, ticket?: string, migration?: string}>} allowlist
 * @param {(relPath: string) => string | null} readMigration returns file text, or null when absent
 * @returns {string[]} violations; empty means pass
 */
export function checkNullableUniqueKeys(schemaText, allowlist, readMigration) {
  const violations = [];
  const keys = findNullableUniqueKeys(schemaText);
  const ids = new Set(keys.map((k) => k.id));

  for (const k of keys) {
    const entry = allowlist[k.id];
    if (!entry) {
      violations.push(
        `${k.id}: unique key contains optional column(s) ${k.optional.join(", ")}; ` +
          `Postgres lets rows with NULL there repeat. Add it to ` +
          `scripts/nullable-unique-keys.allowlist.json with a decision, or make the key real.`,
      );
      continue;
    }
    if (!KINDS.has(entry.kind)) {
      violations.push(`${k.id}: unknown kind "${entry.kind}"`);
    } else if (entry.kind === "exempt" && !entry.reason?.trim()) {
      violations.push(`${k.id}: "exempt" needs a reason`);
    } else if ((entry.kind === "known-defect" || entry.kind === "undecided") && !/^RA-\d+$/.test(entry.ticket ?? "")) {
      violations.push(`${k.id}: "${entry.kind}" needs a ticket like RA-1234`);
    } else if (entry.kind === "nulls-not-distinct") {
      const sql = entry.migration ? readMigration(entry.migration) : null;
      if (sql === null) {
        violations.push(`${k.id}: migration "${entry.migration ?? ""}" not found`);
      } else if (!/NULLS\s+NOT\s+DISTINCT/i.test(sql) && !/CREATE\s+UNIQUE\s+INDEX[^;]*\bWHERE\b/i.test(sql)) {
        violations.push(`${k.id}: ${entry.migration} has no NULLS NOT DISTINCT or partial unique index`);
      }
    }
  }

  for (const id of Object.keys(allowlist)) {
    if (!ids.has(id)) violations.push(`${id}: allow-list entry has no matching nullable unique key in the schema; remove it`);
  }
  return violations;
}

const isMain = process.argv[1] && /check-nullable-unique-keys\.mjs$/.test(process.argv[1]);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const allowlist = JSON.parse(
    fs.readFileSync(path.join(root, "scripts/nullable-unique-keys.allowlist.json"), "utf8"),
  ).keys;
  const read = (rel) => {
    const p = path.join(root, "prisma/migrations", rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const violations = checkNullableUniqueKeys(schema, allowlist, read);
  if (violations.length) {
    console.error(`Nullable unique-key guard: ${violations.length} violation(s)`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`Nullable unique-key guard: ${Object.keys(allowlist).length} key(s) decided, 0 violations`);
}
