#!/usr/bin/env node

import { fileURLToPath } from "node:url";

export const PRODUCTION_ORIGIN = "https://restoreassist.app";

export function assertProductionSmokeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`production smoke origin is invalid: ${JSON.stringify(value)}`);
  }
  if (parsed.origin !== PRODUCTION_ORIGIN || parsed.href !== `${PRODUCTION_ORIGIN}/`) {
    throw new Error(
      `production smoke target must be exactly ${PRODUCTION_ORIGIN}; observed ${JSON.stringify(value)}`,
    );
  }
  return PRODUCTION_ORIGIN;
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 1) {
      throw new Error("usage: assert-production-smoke-origin.mjs <base-url>");
    }
    const origin = assertProductionSmokeOrigin(argv[0]);
    console.log(`[production-smoke-origin] PASS ${origin}`);
    return 0;
  } catch (error) {
    console.error(
      `[production-smoke-origin] FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
