import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  mostRecentAuthorisationForUser,
  _resetCacheForTests,
} from "../most-recent";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorisation: { findFirst: (...args: unknown[]) => findFirst(...args) },
  },
}));

beforeEach(() => {
  findFirst.mockReset();
  _resetCacheForTests();
});

describe("mostRecentAuthorisationForUser", () => {
  it("returns null when no prior Authorisation exists", async () => {
    findFirst.mockResolvedValueOnce(null);
    const result = await mostRecentAuthorisationForUser("user_1");
    expect(result).toBeNull();
  });

  it("returns the most recent Authorisation by verifiedAt", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: "Restoration",
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: "CGU",
      publicLiabilityPolicyNumber: "POL-1",
      publicLiabilityCoverAmount: null,
      verifiedAt: new Date("2026-05-10T00:00:00Z"),
    });
    const result = await mostRecentAuthorisationForUser("user_1");
    expect(result?.subjectLicenceNumber).toBe("IICRC-1");
    expect(result?.whsCardNumber).toBe("WHS-1");
  });

  it("uses an explicit select with the expected fields", async () => {
    findFirst.mockResolvedValueOnce(null);
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subjectUserId: "user_1" },
        orderBy: { verifiedAt: "desc" },
        select: expect.objectContaining({
          subjectLicenceNumber: true,
          subjectLicenceState: true,
          subjectLicenceClass: true,
          whsCardNumber: true,
          publicLiabilityInsurer: true,
          publicLiabilityPolicyNumber: true,
          publicLiabilityCoverAmount: true,
          verifiedAt: true,
        }),
      }),
    );
  });

  it("caches a non-null result for the same user for 5 minutes", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: null,
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: null,
      publicLiabilityPolicyNumber: null,
      publicLiabilityCoverAmount: null,
      verifiedAt: new Date(),
    });
    await mostRecentAuthorisationForUser("user_1");
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not leak cache across users", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      verifiedAt: new Date(),
    });
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-2",
      verifiedAt: new Date(),
    });
    const a = await mostRecentAuthorisationForUser("user_1");
    const b = await mostRecentAuthorisationForUser("user_2");
    expect(a?.subjectLicenceNumber).toBe("IICRC-1");
    expect(b?.subjectLicenceNumber).toBe("IICRC-2");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("invalidates cache on invalidateAuthorisationCache", async () => {
    const { invalidateAuthorisationCache } = await import("../most-recent");
    findFirst.mockResolvedValue({
      subjectLicenceNumber: "IICRC-1",
      verifiedAt: new Date(),
    });
    await mostRecentAuthorisationForUser("user_1");
    invalidateAuthorisationCache("user_1");
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
