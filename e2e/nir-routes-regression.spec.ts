/**
 * RA — NIR inspector routes regression coverage
 *
 * 11 NIR inspector routes silently 500'd on prod from 2026-04-06 until
 * 2026-05-13 when PR #965 + #972 fixed them via atomic Prisma model +
 * migration + route cleanups. These tests catch the next regression:
 *
 *   401 — auth-gated correctly → route wired up, DB schema intact, Prisma
 *         client knows the model. (Healthy.)
 *   500 — silent break — the exact failure mode #965/#972 fixed.
 *   404 — route file removed (regression).
 *
 * Strategy: hit each route unauthenticated. The auth check is the FIRST
 * thing every handler does — before any Prisma access — so a healthy
 * route always returns 401. If a route returns 500, it means the handler
 * blew up *before* reaching the auth check, which on Next.js App Router
 * means the route module itself failed to load (e.g. missing Prisma model).
 *
 * No fixtures, no DB seeding, no auth — these are fast smoke tests.
 *
 * Run: npx playwright test e2e/nir-routes-regression.spec.ts --reporter=list
 */

import { test, expect } from "@playwright/test";

// A throw-away inspection id. Tenancy is never reached because auth fails
// first; this is purely a URL placeholder.
const DUMMY_INSPECTION_ID = "00000000-0000-0000-0000-000000000000";
const DUMMY_ITEM_ID = "11111111-1111-1111-1111-111111111111";

const PARENT_ROUTES = [
  "fire-smoke-assessment",
  "mould-remediation",
  "contents-pack-out",
  "storm-damage",
  "biohazard-assessment",
  "carpet-restoration",
  "hvac-assessment",
  "australian-compliance",
  "psychrometric",
  "circuit-assessment",
  "water-damage-classification",
] as const;

test.describe("NIR inspector routes — unauthenticated regression", () => {
  for (const segment of PARENT_ROUTES) {
    const path = `/api/inspections/${DUMMY_INSPECTION_ID}/${segment}`;

    test(`GET ${path} → 401 (not 500, not 404)`, async ({ request }) => {
      const res = await request.get(path);
      const status = res.status();

      // Explicit, loud failure messages for the two regression modes
      // that bit prod 2026-04-06 → 2026-05-13.
      expect(
        status,
        `REGRESSION: ${segment} returned 500 — route module failed to ` +
          `load before auth check ran. Likely cause: missing Prisma model, ` +
          `corrupt migration, or bad import. This is the exact failure PR ` +
          `#965/#972 fixed.`,
      ).not.toBe(500);

      expect(
        status,
        `REGRESSION: ${segment} returned 404 — route file removed or ` +
          `dynamic segment renamed.`,
      ).not.toBe(404);

      expect(
        status,
        `Expected 401 from unauthenticated GET ${path}, got ${status}`,
      ).toBe(401);
    });
  }

  // The contents-pack-out nested itemId route only exports DELETE.
  // Unauthenticated DELETE should also hit the auth gate first → 401.
  const NESTED_PATH = `/api/inspections/${DUMMY_INSPECTION_ID}/contents-pack-out/${DUMMY_ITEM_ID}`;

  test(`DELETE ${NESTED_PATH} → 401 (not 500, not 404)`, async ({
    request,
  }) => {
    const res = await request.delete(NESTED_PATH);
    const status = res.status();

    expect(
      status,
      `REGRESSION: contents-pack-out/[itemId] returned 500 — route module ` +
        `failed to load before auth check ran.`,
    ).not.toBe(500);

    expect(
      status,
      `REGRESSION: contents-pack-out/[itemId] returned 404 — route file ` +
        `removed or dynamic segment renamed.`,
    ).not.toBe(404);

    expect(
      status,
      `Expected 401 from unauthenticated DELETE ${NESTED_PATH}, got ${status}`,
    ).toBe(401);
  });
});
