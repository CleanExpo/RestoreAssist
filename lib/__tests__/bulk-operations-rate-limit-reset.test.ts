/**
 * The bulk-operations limiter (10 per user per hour) keeps its state in a
 * process-local Map. The JEV route harness calls many bulk-status cases for
 * one user in one process, so without a way to clear that Map every case after
 * the tenth got 429 before the handler ran and was never tested.
 * __resetBulkRateLimit is the test-only reset; the limit itself is unchanged.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: vi.fn(),
  getOrganizationOwner: vi.fn(),
}));

import { rateLimit, __resetBulkRateLimit } from "@/lib/bulk-operations";

describe("bulk-operations rate limit reset", () => {
  it("still refuses the 11th operation in an hour", () => {
    __resetBulkRateLimit();
    for (let i = 0; i < 10; i++) expect(rateLimit("u-limit", "op").allowed).toBe(true);
    expect(rateLimit("u-limit", "op").allowed).toBe(false);
  });

  it("allows the user again after the test-only reset", () => {
    __resetBulkRateLimit();
    for (let i = 0; i < 10; i++) rateLimit("u-reset", "op");
    expect(rateLimit("u-reset", "op").allowed).toBe(false);
    __resetBulkRateLimit();
    expect(rateLimit("u-reset", "op").allowed).toBe(true);
  });
});
