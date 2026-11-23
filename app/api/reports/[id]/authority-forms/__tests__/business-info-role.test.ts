/**
 * RA-8067: whose business name, ABN and logo go on a new authority form is
 * decided from the caller's role in the database, not the role inside the
 * login cookie (which can be up to 90 days stale after a promotion or
 * demotion).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrganizationOwner: vi.fn(),
  reportFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  formCreate: vi.fn(),
  formFindUnique: vi.fn(),
  signatureCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mocks.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: (...a: unknown[]) => mocks.getOrganizationOwner(...a),
}));
vi.mock("@prisma/client", () => ({ AuthoritySignatoryRole: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: { text: () => Promise<string> },
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await req.text()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findUnique: mocks.reportFindUnique },
    user: { findUnique: mocks.userFindUnique },
    authorityFormInstance: {
      create: mocks.formCreate,
      findUnique: mocks.formFindUnique,
    },
    authorityFormSignature: {
      create: mocks.signatureCreate,
      createMany: vi.fn(),
    },
  },
}));

import { POST } from "../route";

const OWN = {
  businessName: "Caller Own Pty Ltd",
  businessLogo: null,
  businessABN: "11 111 111 111",
  businessPhone: null,
  businessEmail: null,
  businessAddress: null,
};
const OWNER = {
  businessName: "Owner Restoration Pty Ltd",
  businessLogo: "https://example.test/owner-logo.png",
  businessABN: "22 222 222 222",
  businessPhone: null,
  businessEmail: null,
  businessAddress: null,
};

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/reports/r1/authority-forms", {
    method: "POST",
    body: JSON.stringify({ templateId: "t1" }),
    headers: { "content-type": "application/json" },
  });
}
const routeParams = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reportFindUnique.mockResolvedValue({
    id: "r1",
    userId: "u1",
    assignedManagerId: null,
    assignedAdminId: null,
    clientName: "Client",
    clientContactDetails: null,
    propertyAddress: "1 Test St",
    incidentDate: null,
    technicianFieldReport: null,
    user: OWN,
  });
  mocks.getOrganizationOwner.mockResolvedValue("owner1");
  mocks.userFindUnique.mockImplementation(
    async (args: { where: { id: string } }) => {
      if (args.where.id === "owner1") return OWNER;
      // The caller's current role row.
      return { role: "USER" };
    },
  );
  mocks.formCreate.mockResolvedValue({ id: "f1", template: { id: "t1" } });
  mocks.formFindUnique.mockResolvedValue({ id: "f1" });
  mocks.signatureCreate.mockResolvedValue({});
});

describe("POST /api/reports/[id]/authority-forms business details (RA-8067)", () => {
  it("uses the owner's business details when the cookie says ADMIN but the database says USER", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
    });

    const res = await POST(makeReq(), routeParams);

    expect(res.status).toBe(200);
    const data = mocks.formCreate.mock.calls[0][0].data;
    expect(data.companyName).toBe("Owner Restoration Pty Ltd");
    expect(data.companyABN).toBe("22 222 222 222");
    expect(data.companyLogo).toBe("https://example.test/owner-logo.png");
  });

  it("uses the caller's own details when the cookie says USER but the database says ADMIN", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", role: "USER" },
    });
    mocks.userFindUnique.mockImplementation(
      async (args: { where: { id: string } }) =>
        args.where.id === "owner1" ? OWNER : { role: "ADMIN" },
    );

    const res = await POST(makeReq(), routeParams);

    expect(res.status).toBe(200);
    const data = mocks.formCreate.mock.calls[0][0].data;
    expect(data.companyName).toBe("Caller Own Pty Ltd");
    expect(data.companyABN).toBe("11 111 111 111");
    expect(mocks.getOrganizationOwner).not.toHaveBeenCalled();
  });

  it("403 and no form when the caller's user row is gone", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: "u1", role: "USER" },
    });
    mocks.userFindUnique.mockResolvedValue(null);

    const res = await POST(makeReq(), routeParams);

    expect(res.status).toBe(403);
    expect(mocks.formCreate).not.toHaveBeenCalled();
  });
});
