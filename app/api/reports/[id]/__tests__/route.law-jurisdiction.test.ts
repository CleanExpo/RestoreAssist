/**
 * RA-7625 — GET /api/reports/[id] returns `lawJurisdiction`, resolved with
 * report generation's own function and inputs, so the report screens name the
 * law generation will apply. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { report: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function report(over: {
  propertyAddress?: string | null;
  propertyPostcode?: string | null;
  inspectionCountry?: string;
  orgCountry?: string | null;
}) {
  return {
    id: "r1",
    propertyAddress: over.propertyAddress ?? null,
    propertyPostcode: over.propertyPostcode ?? null,
    user: {
      name: "Synthetic Tech",
      email: "tech@example.test",
      organization:
        over.orgCountry === null ? null : { country: over.orgCountry ?? "AU" },
    },
    client: null,
    inspection: over.inspectionCountry
      ? {
          id: "i1",
          propertyCountry: over.inspectionCountry,
          propertyPostcode: null,
        }
      : null,
  };
}

async function get(row: ReturnType<typeof report>) {
  mockFindFirst.mockResolvedValue(row);
  const { GET } = await import("../route");
  const res = await GET(new NextRequest("http://localhost/api/reports/r1"), {
    params: Promise.resolve({ id: "r1" }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/reports/[id] lawJurisdiction (RA-7625)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
  });

  it("NZ organisation with a schema-default AU inspection resolves NZ", async () => {
    // 4000 is Brisbane and also a valid NZ-shaped postcode; the stored "AU"
    // is the column default. Generation treats this job as NZ (RA-7599).
    const body = await get(
      report({
        propertyAddress: "9 Synthetic Road, Hamilton",
        propertyPostcode: "4000",
        inspectionCountry: "AU",
        orgCountry: "NZ",
      }),
    );
    expect(body.lawJurisdiction).toBe("NZ");
  });

  it("AU organisation and AU postcode resolve AU", async () => {
    const body = await get(
      report({
        propertyPostcode: "4000",
        inspectionCountry: "AU",
        orgCountry: "AU",
      }),
    );
    expect(body.lawJurisdiction).toBe("AU");
  });

  it("no country signal and no postcode stays unknown", async () => {
    const body = await get(report({ orgCountry: null }));
    expect(body.lawJurisdiction).toBe("unknown");
  });

  it("selects the organisation country generation reads", async () => {
    await get(report({}));
    const include = mockFindFirst.mock.calls[0][0].include;
    expect(include.user.select.organization).toEqual({
      select: { country: true },
    });
    expect(include.inspection.select).toMatchObject({
      propertyCountry: true,
      propertyPostcode: true,
    });
  });
});
