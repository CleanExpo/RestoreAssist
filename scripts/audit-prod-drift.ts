/**
 * Full-schema drift audit. Compares every table in prod against what
 * Prisma's schema.prisma defines, listing every missing column.
 *
 * Read-only. Safe to run any time.
 *
 * Filters out Prisma back-relations (e.g. `inspections Inspection[]`)
 * which are NOT real columns — they're virtual fields managed by the
 * foreign key on the OTHER side.
 *
 * Run:
 *   DIRECT_URL=$(grep '^DIRECT_URL=' .env.production | cut -d= -f2- | tr -d '"') \
 *     DATABASE_URL="$DIRECT_URL" \
 *     npx tsx scripts/audit-prod-drift.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Crude schema.prisma parser — extracts model name + scalar fields only.
// Skips relations and back-relations.
function parseSchema(schemaPath: string): Map<string, Set<string>> {
  const text = fs.readFileSync(schemaPath, "utf8");
  const result = new Map<string, Set<string>>();

  // Collect model names first so we can detect which "types" are models (relations)
  const modelNames = new Set<string>();
  const modelPreScan = /^model\s+(\w+)\s*\{/gm;
  let preMatch: RegExpExecArray | null;
  while ((preMatch = modelPreScan.exec(text)) !== null) {
    modelNames.add(preMatch[1]);
  }

  // Also collect enum names — they ARE valid scalar column types
  const enumNames = new Set<string>();
  const enumPreScan = /^enum\s+(\w+)\s*\{/gm;
  while ((preMatch = enumPreScan.exec(text)) !== null) {
    enumNames.add(preMatch[1]);
  }

  const knownScalars = new Set([
    "String",
    "Int",
    "BigInt",
    "Boolean",
    "DateTime",
    "Float",
    "Decimal",
    "Json",
    "Bytes",
  ]);

  const modelRegex = /^model\s+(\w+)\s*\{([^}]*)\}/gms;
  let m: RegExpExecArray | null;
  while ((m = modelRegex.exec(text)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const cols = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)([\?\[\]]*)/,
      );
      if (!fm) continue;
      const fieldName = fm[1];
      const baseType = fm[2];
      const modifiers = fm[3] || "";
      const isList = modifiers.includes("[]");

      // Skip back-relations: a field with type [Model] (list of model)
      if (isList && modelNames.has(baseType)) continue;
      // Skip relations: scalar field followed by a relation field — the relation
      // field references the model. Only the underlying foreign key (typically
      // named XId) is a real column, and that's already a String.
      if (modelNames.has(baseType) && !isList) continue;

      // Accept: known scalars, enums, or anything else
      if (!knownScalars.has(baseType) && !enumNames.has(baseType)) {
        // Unknown type — probably a model relation we missed. Skip.
        continue;
      }
      cols.add(fieldName);
    }
    result.set(modelName, cols);
  }
  return result;
}

async function main() {
  // ESM-safe: resolve relative to the script file itself
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const schemaPath = path.join(scriptDir, "..", "prisma", "schema.prisma");
  const schemaModels = parseSchema(schemaPath);
  console.log(`Parsed ${schemaModels.size} models from schema.prisma\n`);

  // Pull every table + column from prod
  const prodCols = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string }[]
  >(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, column_name`,
  );

  const prodByTable = new Map<string, Set<string>>();
  for (const c of prodCols) {
    if (!prodByTable.has(c.table_name))
      prodByTable.set(c.table_name, new Set());
    prodByTable.get(c.table_name)!.add(c.column_name);
  }

  let missingTableCount = 0;
  const missing: { table: string; column: string }[] = [];
  for (const [model, expectedCols] of schemaModels) {
    const prod = prodByTable.get(model);
    if (!prod) {
      console.log(`!!! Model ${model}: ENTIRE TABLE MISSING from prod`);
      missingTableCount++;
      continue;
    }
    for (const col of expectedCols) {
      if (!prod.has(col)) {
        missing.push({ table: model, column: col });
      }
    }
  }

  console.log(`\nMissing tables: ${missingTableCount}`);
  console.log(`Missing scalar columns: ${missing.length}`);

  if (missing.length === 0 && missingTableCount === 0) {
    console.log("\n✓ No drift detected. Prod schema matches schema.prisma.");
    return;
  }

  if (missing.length > 0) {
    console.log(`\n=== Missing scalar columns by table ===`);
    let lastTable = "";
    for (const m of missing) {
      if (m.table !== lastTable) {
        console.log(`\n[${m.table}]`);
        lastTable = m.table;
      }
      console.log(`  - ${m.column}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
