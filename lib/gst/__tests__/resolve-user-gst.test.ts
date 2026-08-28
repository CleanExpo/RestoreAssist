import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

import { resolveUserGstTreatment } from "../resolve-user-gst";

describe("resolveUserGstTreatment", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
  });

  it.each([
    ["AU", 10, "AUD", "OUTPUT"],
    ["NZ", 15, "NZD", "OUTPUT2"],
  ] as const)(
    "resolves %s from the authenticated user's organisation",
    async (country, ratePercent, currency, xeroTaxType) => {
      userFindUnique.mockResolvedValue({ organization: { country } });

      await expect(resolveUserGstTreatment("user-1")).resolves.toEqual(
        expect.objectContaining({ country, ratePercent, currency, xeroTaxType }),
      );
      expect(userFindUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { organization: { select: { country: true } } },
      });
    },
  );

  it.each([null, { organization: null }, { organization: { country: "US" } }])(
    "fails closed for unsupported tenant data: %j",
    async (record) => {
      userFindUnique.mockResolvedValue(record);
      await expect(resolveUserGstTreatment("user-1")).rejects.toThrow(
        "Organization locale is required before financial work",
      );
    },
  );
});
