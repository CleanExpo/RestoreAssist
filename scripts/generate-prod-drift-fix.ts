/**
 * Generate a single SQL file that brings prod schema up to schema.prisma.
 *
 * Calls `prisma migrate diff` via spawn, passing DATABASE_URL through env
 * (NOT --from-url argv) so the credential never appears in process listings.
 *
 * Output: scripts/prod-drift-fix.sql (gitignored — has no creds, just DDL,
 *         but treat as sensitive: it discloses our schema)
 *
 * Run:
 *   DATABASE_URL=$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"') \
 *     npx tsx scripts/generate-prod-drift-fix.ts
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function main() {
  // Prefer DIRECT_URL (port 5432) over DATABASE_URL (port 6543 pgbouncer pooler).
  // Pooler blocks prepared statements which Prisma migrate diff uses.
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DIRECT_URL or DATABASE_URL env var is required");
    process.exit(1);
  }
  console.log(
    `[diff] using ${process.env.DIRECT_URL ? "DIRECT_URL (port 5432, no pooler)" : "DATABASE_URL (may be pooled)"}`,
  );

  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.join(scriptDir, "..");
  const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
  const outFile = path.join(scriptDir, "prod-drift-fix.sql");

  // We must pass --from-url because Prisma's migrate diff doesn't accept
  // --from-env-var. To avoid the URL appearing in process listings, we use
  // a temp datasource block file approach — but that's also visible in argv.
  //
  // The least-bad workaround: use `--from-schema-datasource <path>` which
  // takes a small Prisma schema with just the datasource block. The URL
  // there is read by the engine via env interpolation if we set
  // `url = env("DATABASE_URL")`.
  const tmpDir = fs.mkdtempSync("/tmp/prisma-diff-");
  const tmpDatasource = path.join(tmpDir, "datasource.prisma");
  // multiSchema preview feature + schemas list = handles Supabase's auth schema
  // referenced from public.profiles via auth.users foreign key.
  fs.writeFileSync(
    tmpDatasource,
    `generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "auth"]
}
`,
  );

  console.log(`[diff] using temp datasource at ${tmpDatasource}`);
  console.log(`[diff] writing SQL to ${outFile}`);
  console.log(`[diff] running prisma migrate diff (no URL in argv)...`);

  const result = spawnSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-schema-datasource",
      tmpDatasource,
      "--to-schema-datamodel",
      schemaPath,
      "--script",
    ],
    {
      env: { ...process.env, DATABASE_URL: dbUrl },
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  // Cleanup temp datasource
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  if (result.status !== 0) {
    console.error("[diff] FAILED");
    console.error("[diff] stderr:", result.stderr);
    process.exit(result.status ?? 1);
  }

  const sql = result.stdout;
  fs.writeFileSync(outFile, sql);
  const lineCount = sql.split("\n").length;
  console.log(`\n[diff] ✓ wrote ${lineCount} lines to ${outFile}`);
  console.log(`\n[diff] First 30 lines preview:`);
  console.log(sql.split("\n").slice(0, 30).join("\n"));
  console.log(`\n[diff] Last 10 lines preview:`);
  console.log(sql.split("\n").slice(-10).join("\n"));
  console.log(`\n[diff] Full file: ${outFile}`);
  console.log(
    `[diff] Add scripts/prod-drift-fix.sql to .gitignore before reviewing.`,
  );
}

main();
