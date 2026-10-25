/**
 * RA-8067 — POST /api/reports/[id]/authority-forms picks whose business
 * name, ABN and logo go on a new authority form. That decision must come
 * from the caller's role in the database, not the role baked into a login
 * cookie that can be up to 90 days stale.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrganizationOwner: vi.fn(),
  reportFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  instanceCreate: vi.fn(),
  instanceFindUnique: vi.fn(),
  signatureCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mocks.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: (...a: unknown[]) => mocks.getOrganizationOwner(...a),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: { text: () => Promise<string> },
    _userId: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await req.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findUnique: mocks.reportFindUnique },
    user: { findUnique: mocks.userFindUnique },
    authorityFormInstance: {
      create: mocks.instanceCreate,
      findUnique: mocks.instanceFindUnique,
    },
    authorityFormSignature: { create: mocks.signatureCreate },
  },
}));

import { POST } from "../route";

const OWNER_BUSINESS = {
  businessName: "Owner Restorations Pty Ltd",
  businessLogo: "owner-logo.png",
  businessABN: "51 824 753 556",
  businessPhone: "02 9000 0000",
  businessEmail: "office@owner.example",
  businessAddress: "1 Owner St",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reportFindUnique.mockResolvedValue({
    id: "r1",
    userId: "u1",
    assignedManagerId: null,
    assignedAdminId: null,
    clientName: "Client",
    clientContactDetails: null,
    propertyAddress: "2 Client St",
    incidentDate: null,
    technicianFieldReport: null,
    user: {
      businessName: "Caller Own Name",
      businessLogo: null,
      businessABN: null,
      businessPhone: null,
      businessEmail: null,
      businessAddress: null,
    },
  });
  mocks.getOrganizationOwner.mockResolvedValue("owner1");
  mocks.userFindUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      args.where.id === "owner1" ? OWNER_BUSINESS : { role: "USER" },
  );
  mocks.instanceCreate.mockResolvedValue({ id: "form1" });
  mocks.signatureCreate.mockResolvedValue({});
  mocks.instanceFindUnique.mockResolvedValue({ id: "form1" });
});

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/reports/r1/authority-forms", {
    method: "POST",
    body: JSON.stringify({ templateId: "t1" }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/reports/[id]/authority-forms — company details", () => {
  it("uses the owner's business details when the database role is USER but the cookie still says ADMIN", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
    });

    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(res.status).toBe(200);
    const data = mocks.instanceCreate.mock.calls[0][0].data;
    expect(data.companyName).toBe(OWNER_BUSINESS.businessName);
    expect(data.companyABN).toBe(OWNER_BUSINESS.businessABN);
    expect(data.companyLogo).toBe(OWNER_BUSINESS.businessLogo);
    expect(mocks.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });

  it("uses the caller's own business details when the database role is ADMIN", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", role: "MANAGER" },
    });
    mocks.userFindUnique.mockImplementation(
      async (args: { where: { id: string } }) =>
        args.where.id === "owner1" ? OWNER_BUSINESS : { role: "ADMIN" },
    );

    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.getOrganizationOwner).not.toHaveBeenCalled();
    const data = mocks.instanceCreate.mock.calls[0][0].data;
    expect(data.companyName).toBe("Caller Own Name");
  });
});
