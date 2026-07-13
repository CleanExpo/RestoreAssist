/**
 * Synthetic-but-valid ABN generator for E2E smoke tests.
 *
 * The setup-wizard test (`setup-storage-google-drive.spec.ts`) writes the
 * supplied ABN to `Organization.abn`, which has a UNIQUE constraint. Hardcoding
 * a real ABN like BHP's `53004085616` means every smoke run after the first
 * collides with the prior run's organization → P2002 unique-constraint error
 * on `/api/setup/hydrate` → smoke false-failure.
 *
 * This helper generates a fresh valid ABN per run (seeded by `Date.now()`),
 * so each smoke iteration writes a never-before-used ABN and the constraint
 * is satisfied. ABN checksum reference:
 *
 *   1. Subtract 1 from the leading digit
 *   2. Multiply each of the 11 digits by WEIGHTS = [10,1,3,5,7,9,11,13,15,17,19]
 *   3. Sum the products
 *   4. Valid iff sum % 89 === 0
 *
 * The ABR (Australian Business Register) lookup will return "not found" for
 * the synthetic ABN, but `runAbrJob` is fire-and-forget in the hydrate route
 * — the smoke test does not wait for it.
 */

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

function isValidChecksum(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false;
  const first = parseInt(abn[0], 10) - 1;
  const rest = abn.slice(1).split("").map((d) => parseInt(d, 10));
  const digits = [first, ...rest];
  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/**
 * Generate a valid 11-digit ABN.
 *
 * Strategy: take 10 trailing digits derived from `seed` (defaults to
 * `Date.now()`), then iterate leading digits 1-9 to find one that produces
 * a valid checksum. Falls back to incrementing the seed until a valid ABN
 * is found (always terminates within a handful of iterations).
 */
export function generateValidAbn(seed: number = Date.now()): string {
  let attempt = seed;
  for (let safety = 0; safety < 100; safety++) {
    const trailing = String(attempt).padStart(10, "0").slice(-10);
    for (let first = 1; first <= 9; first++) {
      const candidate = `${first}${trailing}`;
      if (isValidChecksum(candidate)) return candidate;
    }
    attempt += 1;
  }
  // Mathematically should never happen — ABN distribution is dense enough
  // that some leading digit works for every 10-trailing-digit suffix. But
  // we throw rather than silently return an invalid value.
  throw new Error(`Could not derive valid ABN from seed ${seed}`);
}
