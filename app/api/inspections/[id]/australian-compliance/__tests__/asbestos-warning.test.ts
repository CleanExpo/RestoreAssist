import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma-helpers", () => ({ softDelete: vi.fn() }));

const mockAssertTenancy = vi.fn();
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => mockAssertTenancy(...a),
  resolveInspectionWrite: vi.fn(),
}));

const mockUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    australianComplianceRecord: {
      upsert: (...a: unknown[]) => mockUpsert(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

const ctx = { params: Promise.resolve({ id: "i1" }) };

function post(body: Record<string, unknown>) {
  return new NextRequest(
    "http://localhost/api/inspections/i1/australian-compliance",
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * The asbestos-era threshold on the compliance record.
 *
 * This route warned on `propertyYearBuilt < 1990`. That is the Queensland
 * asbestos-REGISTER exemption date, which lib/compliance/regulatory-registry/
 * asbestos.ts records as an administrative record-keeping rule and says in as
 * many words is not a national safety threshold: "Applying this date as a
 * national safety threshold is the defect this registry was built to stop."
 *
 * Australia prohibited asbestos in workplaces from 31 December 2003, so the
 * presumption year is 2004. Every property built from 1990 to 2003 therefore
 * got NO warning on its compliance record, and the absence of a warning is
 * indistinguishable from a property that was checked and cleared.
 */
describe("POST /api/inspections/[id]/australian-compliance — asbestos warning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true, data: { id: "i1" } });
    mockUpsert.mockResolvedValue({ id: "rec1", inspectionId: "i1" });
  });

  it("warns on a 1995 property, which the old 1990 rule cleared", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ propertyYearBuilt: 1995 }), ctx);
    const body = await res.json();
    expect(body.asbestosWarning).toBeTruthy();
  });

  it("warns on a 2003 property — the ban took effect 31 December 2003", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ propertyYearBuilt: 2003 }), ctx);
    expect((await res.json()).asbestosWarning).toBeTruthy();
  });

  it("does not warn on a 2004 property", async () => {
    // The other side of the boundary. Without it, a rule that warned on every
    // building would satisfy both assertions above.
    const { POST } = await import("../route");
    const res = await POST(post({ propertyYearBuilt: 2004 }), ctx);
    expect((await res.json()).asbestosWarning).toBeNull();
  });

  it("stays silent once the risk is acknowledged", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({ propertyYearBuilt: 1995, asbestosRiskAcknowledged: true }),
      ctx,
    );
    expect((await res.json()).asbestosWarning).toBeNull();
  });

  it("states the year it applied, not a hardcoded one", async () => {
    // The message read "Property built before 1990". A technician reading that
    // on a 1995 job would take away the wrong rule even once the gate fired.
    const { POST } = await import("../route");
    const res = await POST(post({ propertyYearBuilt: 1995 }), ctx);
    const warning = (await res.json()).asbestosWarning as string;
    expect(warning).toContain("2004");
    expect(warning).not.toContain("1990");
  });

  it("does not warn when no year is recorded", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ insurerName: "Acme" }), ctx);
    expect((await res.json()).asbestosWarning).toBeNull();
  });
});
