import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn() },
  },
}));

import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import {
  resolvePortalAccess,
  resolvePortalInspectionId,
} from "../resolve-portal-inspection";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mVerify = verifyPortalToken as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mLookup.mockResolvedValue(null);
  mVerify.mockReturnValue(null);
  p.inspection.findFirst.mockResolvedValue(null);
});

describe("resolvePortalAccess (RA-7575 / RA-4861)", () => {
  it("prefers a live ClientPortalAccount over HMAC and returns its inspection", async () => {
    mLookup.mockResolvedValue({ clientId: "c_1" });
    mVerify.mockReturnValue({ inspectionId: "hmac_insp" });
    p.inspection.findFirst.mockResolvedValue({ id: "acct_insp" });

    await expect(resolvePortalAccess("acct-tok")).resolves.toEqual({
      kind: "inspection",
      inspectionId: "acct_insp",
    });
    expect(mVerify).not.toHaveBeenCalled();
  });

  it("returns unready for a valid account-token with no inspection yet", async () => {
    mLookup.mockResolvedValue({ clientId: "c_1" });
    p.inspection.findFirst.mockResolvedValue(null);

    await expect(resolvePortalAccess("acct-tok")).resolves.toEqual({
      kind: "unready",
    });
    expect(mVerify).not.toHaveBeenCalled();
    await expect(resolvePortalInspectionId("acct-tok")).resolves.toBeNull();
  });

  it("falls back to HMAC when no portal account matches", async () => {
    mLookup.mockResolvedValue(null);
    mVerify.mockReturnValue({ inspectionId: "hmac_insp" });

    await expect(resolvePortalAccess("hmac-tok")).resolves.toEqual({
      kind: "inspection",
      inspectionId: "hmac_insp",
    });
  });

  it("returns invalid when neither token type resolves", async () => {
    await expect(resolvePortalAccess("garbage")).resolves.toEqual({
      kind: "invalid",
    });
    await expect(resolvePortalInspectionId("garbage")).resolves.toBeNull();
  });
});
