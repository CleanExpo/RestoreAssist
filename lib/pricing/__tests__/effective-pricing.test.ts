import { describe, it, expect, vi } from "vitest";
import {
  resolveEffectivePricing,
  type PricingResolverClient,
} from "../effective-pricing";

const ORG_ROW = { organizationId: "org_1", masterQualifiedNormalHours: 110 };
const USER_ROW = { userId: "user_1", masterQualifiedNormalHours: 999 };

/** Build a stub Prisma with recorded calls. */
function stub(opts: {
  organizationId?: string | null;
  orgConfig?: unknown;
  companyConfig?: unknown;
}) {
  const orgFind = vi.fn(async () => opts.orgConfig ?? null);
  const companyFind = vi.fn(async () => opts.companyConfig ?? null);
  const userFind = vi.fn(async () => ({
    organizationId: opts.organizationId ?? null,
  }));
  const client = {
    user: { findUnique: userFind },
    organizationPricingConfig: { findUnique: orgFind },
    companyPricingConfig: { findUnique: companyFind },
  } as unknown as PricingResolverClient;
  return { client, orgFind, companyFind, userFind };
}

describe("resolveEffectivePricing", () => {
  it("returns the ORG config when the user's org has one (authoritative)", async () => {
    const { client, companyFind } = stub({
      organizationId: "org_1",
      orgConfig: ORG_ROW,
      companyConfig: USER_ROW,
    });
    const out = await resolveEffectivePricing(client, "user_1");
    expect(out).toBe(ORG_ROW);
    // org wins → the user table is never consulted
    expect(companyFind).not.toHaveBeenCalled();
  });

  it("falls back to the user config when the org has no pricing row", async () => {
    const { client } = stub({
      organizationId: "org_1",
      orgConfig: null,
      companyConfig: USER_ROW,
    });
    expect(await resolveEffectivePricing(client, "user_1")).toBe(USER_ROW);
  });

  it("falls back to the user config when the user has no organization", async () => {
    const { client, orgFind } = stub({
      organizationId: null,
      companyConfig: USER_ROW,
    });
    expect(await resolveEffectivePricing(client, "user_1")).toBe(USER_ROW);
    // no org → org table not queried
    expect(orgFind).not.toHaveBeenCalled();
  });

  it("returns null when neither config exists (caller keeps its own fallback)", async () => {
    const { client } = stub({ organizationId: "org_1", orgConfig: null });
    expect(await resolveEffectivePricing(client, "user_1")).toBeNull();
  });

  it("returns null without any DB call for an empty userId", async () => {
    const { client, userFind } = stub({});
    expect(await resolveEffectivePricing(client, "")).toBeNull();
    expect(userFind).not.toHaveBeenCalled();
  });
});

// CI-parity: exercise the real queries (user.findUnique + companyPricingConfig
// fallback) against the LIVE schema. Unknown user → null. Skips without a DB.
describe.skipIf(!process.env.DATABASE_URL)("resolveEffectivePricing (DB)", () => {
  it("resolves null for an unknown user against the real schema", async () => {
    const { prisma } = await import("@/lib/prisma");
    expect(
      await resolveEffectivePricing(prisma, "user_does_not_exist_ra7026"),
    ).toBeNull();
  });
});
