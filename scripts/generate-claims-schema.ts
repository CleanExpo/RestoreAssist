/**
 * Regenerates docs/contracts/claims-integration-v1.schema.json from the zod
 * source of truth in lib/export/claims-contract.ts. The colocated contract
 * test fails whenever the checked-in artifact drifts from the zod schema —
 * run this script, review the diff, and commit both together.
 *
 * Usage: pnpm exec tsx scripts/generate-claims-schema.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { claimsIntegrationJsonSchema } from "../lib/export/claims-contract";

const target = join(
  process.cwd(),
  "docs/contracts/claims-integration-v1.schema.json",
);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  `${JSON.stringify(claimsIntegrationJsonSchema(), null, 2)}\n`,
);
console.log(`wrote ${target}`);
