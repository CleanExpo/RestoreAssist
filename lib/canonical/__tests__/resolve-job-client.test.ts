import { describe, it, expect, vi } from "vitest";
import { resolveCanonicalClientForInspection } from "../resolve-job-client";

describe("resolveCanonicalClientForInspection", () => {
  it("prefers Inspection.clientId over report.clientId", async () => {
    const client = {
      id: "c1",
      userId: "u1",
      name: "Acme",
      email: "a@example.com",
      phone: null,
      address: null,
    };
    const prisma = {
      inspection: {
        findFirst: vi.fn().mockResolvedValue({
          clientId: "c1",
          reportId: "r1",
          report: { clientId: "c2" },
        }),
      },
      report: {},
      client: { findFirst: vi.fn().mockResolvedValue(client) },
    };
    const out = await resolveCanonicalClientForInspection(prisma as never, {
      inspectionId: "i1",
      ownerUserId: "u1",
    });
    expect(out?.id).toBe("c1");
  });
});
