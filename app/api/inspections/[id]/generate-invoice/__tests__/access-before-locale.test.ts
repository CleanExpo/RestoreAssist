/**
 * RA-8608: the caller's access to the inspection is decided BEFORE the
 * organisation-locale (GST) lookup.
 *
 * The route used to call resolveUserGstTreatment() first. A caller with no
 * organisation (or no locale set) who was not allowed to see the inspection
 * got 422 ORGANIZATION_LOCALE_REQUIRED instead of the refusal every other
 * non-owner gets, and 422 versus 404 told them whether the id was real.
 *
 * Uses the real resolver (not a mock) so the 422 comes from the real error
 * class through the route's own catch block.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  inspectionFindFirst: vi.fn(),
  invoiceFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  resolveCanonicalClient: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@prisma/client", () => ({
  InspectionStatus: { SUBMITTED: "SUBMITTED", IN_BILLING: "IN_BILLING" },
  ClaimState: { CLOSEOUT: "CLOSEOUT", INVOICE_ISSUED: "INVOICE_ISSUED" },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (
    _request: NextRequest,
    _userId: string,
    fn: () => Promise<Response>,
  ) => fn(),
}));
vi.mock("@/lib/canonical/resolve-job-client", () => ({
  resolveCanonicalClientForInspection: (...args: unknown[]) =>
    mocks.resolveCanonicalClient(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: mocks.inspectionFindFirst },
    user: { findUnique: mocks.userFindUnique },
    invoice: { findFirst: mocks.invoiceFindFirst },
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = vi.mocked(getServerSession);

function callPost() {
  return POST(
    new NextRequest("http://localhost/api/inspections/i1/generate-invoice", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "i1" }) },
  );
}

/** The caller's user row as the GST resolver reads it. */
function callerWithOrganisation(country: string | null) {
  mocks.userFindUnique.mockResolvedValue({
    organization: country ? { country } : null,
  });
}

function ownedInspection(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    status: "SUBMITTED",
    signedAt: new Date("2026-08-09T00:00:00.000Z"),
    reportId: "r1",
    inspectionNumber: "NIR-1",
    propertyAddress: "1 Test St",
    report: {
      id: "r1",
      userId: "u1",
      title: "Test report",
      propertyAddress: "1 Test St",
      clientId: "c1",
      client: {
        id: "c1",
        userId: "u1",
        name: "Test Client",
        email: "client@example.com",
        phone: null,
        address: "1 Test St",
      },
    },
    ...overrides,
  };
}

describe("generate-invoice: access is checked before the locale lookup (RA-8608)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({
      user: { id: "u1", name: "Tech" },
    } as never);
    mocks.resolveCanonicalClient.mockResolvedValue(null);
    mocks.invoiceFindFirst.mockResolvedValue(null);
  });

  it("refuses a caller with no organisation and no access with 404, never 422", async () => {
    callerWithOrganisation(null);
    mocks.inspectionFindFirst.mockResolvedValue(null);

    const response = await callPost();

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    // The lookup stays tenancy-scoped to the caller.
    expect(mocks.inspectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", userId: "u1" } }),
    );
    // The locale lookup is never reached for a caller who has no access.
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("gives a no-access caller with a locale the same 404", async () => {
    callerWithOrganisation("AU");
    mocks.inspectionFindFirst.mockResolvedValue(null);

    const response = await callPost();

    expect(response.status).toBe(404);
  });

  it("gives an owner whose job has no linked report the 409 refusal, not 422", async () => {
    callerWithOrganisation(null);
    mocks.inspectionFindFirst.mockResolvedValue(
      ownedInspection({ reportId: null, report: null }),
    );

    const response = await callPost();

    expect(response.status).toBe(409);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("still gives an authorised caller with no organisation locale the 422", async () => {
    callerWithOrganisation(null);
    mocks.inspectionFindFirst.mockResolvedValue(ownedInspection());

    const response = await callPost();

    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toMatch(/locale/i);
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
  });
});
