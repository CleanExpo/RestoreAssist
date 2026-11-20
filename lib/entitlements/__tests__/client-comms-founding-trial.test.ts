import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { featureEntitlement: { findUnique } },
}));

import { requireAddonForWorkspace } from "../require-addon";

/**
 * RA-7722 says the pilot includes all add-ons. There is no "pilot" flag: a pilot
 * business is entitled only because the Founding Trial grant wrote a
 * complimentary active row. This runs the real gate on a row of that shape.
 */
describe("CLIENT_COMMS for a Founding Trial business", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the send on the complimentary row the grant writes", async () => {
    findUnique.mockResolvedValue({
      id: "ent_1",
      active: true,
      stripePriceId: COMPLIMENTARY_PRICE_ID,
    });

    const gate = await requireAddonForWorkspace("ws_1", "CLIENT_COMMS");

    expect(gate.allowed).toBe(true);
  });

  it("refuses the send with no row, whatever the business believes", async () => {
    findUnique.mockResolvedValue(null);

    const gate = await requireAddonForWorkspace("ws_1", "CLIENT_COMMS");

    expect(gate.allowed).toBe(false);
  });
});
