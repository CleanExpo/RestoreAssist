import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Stub the route's import-time dependencies so GET runs without a live
// session or database (same pattern as guidewire-photo-manifest.test.ts).
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    contractorProfile: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
}));

import { getServerSession } from "next-auth";

import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { claimsIntegrationExportSchema } from "@/lib/export/claims-contract";
import { prisma } from "@/lib/prisma";

import { GET } from "../guidewire/route";

function primeMocks() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: "user_1", name: "Tech Name" },
  } as never);
  vi.mocked(assertInspectionTenancy).mockResolvedValue({ ok: true } as never);
  vi.mocked(prisma.inspection.findUnique).mockResolvedValue({
    id: "insp_1",
    status: "COMPLETED",
    propertyPostcode: "2150",
    propertyAddress: "123 Smith St, Parramatta NSW 2150",
    inspectionDate: new Date("2026-01-01T00:00:00.000Z"),
    submittedAt: new Date("2026-01-02T00:00:00.000Z"),
    classifications: [],
    scopeItems: [],
    costEstimates: [],
    affectedAreas: [],
    moistureReadings: [],
    environmentalData: [],
    photos: [],
  } as never);
  vi.mocked(prisma.contractorProfile.findUnique).mockResolvedValue(null);
}

function makeParams(id = "insp_1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/inspections/[id]/guidewire — claimsIntegration envelope", () => {
  it("publishes a schema-valid claims integration envelope alongside the Guidewire payload", async () => {
    primeMocks();

    const response = await GET(
      new NextRequest(
        "http://localhost/api/inspections/insp_1/guidewire?policyNumber=POL-99",
      ),
      makeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const envelope = claimsIntegrationExportSchema.parse(body.claimsIntegration);
    expect(envelope.source.inspectionId).toBe("insp_1");
    expect(envelope.claimReference.policyNumber).toBe("POL-99");
    expect(envelope.explicitOmissions).toEqual([
      "claimReference.insurerClaimNumber",
    ]);
    // The envelope's report section is the SAME canonical payload the route
    // already publishes for debugging — one source, no drift.
    expect(envelope.report).toEqual(body.nirOutput);
  });

  it("maps the POL-UNKNOWN sentinel to an explicit policy-number omission", async () => {
    primeMocks();

    const response = await GET(
      new NextRequest("http://localhost/api/inspections/insp_1/guidewire"),
      makeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const envelope = claimsIntegrationExportSchema.parse(body.claimsIntegration);
    expect(envelope.claimReference.policyNumber).toBeNull();
    expect(envelope.explicitOmissions).toEqual([
      "claimReference.insurerClaimNumber",
      "claimReference.policyNumber",
    ]);
  });
});
