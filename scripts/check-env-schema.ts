// RA-7784 — CLI: fail when .env.example and lib/env.ts ENV_SCHEMA disagree.
// Usage: npm run check:env-schema [-- <path to an example file>]
// Reads only the example file named (default .env.example). Prints names,
// never values. Logic lives in scripts/lib/env-schema-check.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENV_NAMES } from "../lib/env";
import {
  compareEnvSchema,
  formatEnvSchemaComparison,
  parseEnvExampleNames,
} from "./lib/env-schema-check";

const examplePath = resolve(process.argv[2] ?? ".env.example");
const problems = formatEnvSchemaComparison(
  compareEnvSchema(ENV_NAMES, parseEnvExampleNames(readFileSync(examplePath, "utf8"))),
);

if (problems.length > 0) {
  console.error(`check:env-schema FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check:env-schema OK: ${ENV_NAMES.length} names agree between lib/env.ts and .env.example`);
