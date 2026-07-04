import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the args passed to prisma.integration.findMany so we can assert the
// query is bounded (take) and column-scoped (select) per CLAUDE.md rule 3.
// vi.hoisted lets the mock fn be referenced inside the hoisted vi.mock factory.
const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([]),
}));
vi.mock("../prisma", () => ({
  prisma: { integration: { findMany } },
}));

// The helper resolves the org owner first; return the same id so the query runs.
vi.mock("../organization-credits", () => ({
  getOrganizationOwner: vi.fn().mockResolvedValue("user-1"),
}));

import { getIntegrationsForUser } from "../ai-provider";

describe("getIntegrationsForUser — bounded, column-scoped query (ai-provider-integrations-select-take)", () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  it("selects only id/name/apiKey and never over-fetches sensitive columns", async () => {
    await getIntegrationsForUser("user-1");

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];

    // Column-scoped: exactly the three columns callers read, nothing more.
    expect(args.select).toEqual({ id: true, name: true, apiKey: true });
    // Sensitive columns must not be requested.
    expect(args.select).not.toHaveProperty("accessToken");
    expect(args.select).not.toHaveProperty("refreshToken");
    expect(args.select).not.toHaveProperty("config");
  });

  it("bounds the result set with an explicit take", async () => {
    await getIntegrationsForUser("user-1");

    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
  });
});
