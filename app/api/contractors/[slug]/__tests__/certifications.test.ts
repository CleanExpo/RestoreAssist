/**
 * RA-8457 — the public profile shows VERIFIED certifications and never a
 * PENDING one. The fake applies the handler's own `certifications.where` to
 * planted rows, so a change to that filter changes what this test sees.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const planted = [
  {
    id: "cert-verified",
    certificationName: "WRT",
    verificationStatus: "VERIFIED",
  },
  {
    id: "cert-pending",
    certificationName: "ASD",
    verificationStatus: "PENDING",
  },
  {
    id: "cert-rejected",
    certificationName: "AMRT",
    verificationStatus: "REJECTED",
  },
];

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contractorProfile: {
      findUnique: async (args: {
        include: { certifications: { where: { verificationStatus?: string } } };
      }) => {
        const where = args.include.certifications.where;
        return {
          id: "profile-1",
          slug: "acme-restoration",
          user: {
            businessName: "Acme",
            businessLogo: null,
            businessAddress: null,
          },
          certifications: planted.filter(
            (c) =>
              where.verificationStatus === undefined ||
              c.verificationStatus === where.verificationStatus,
          ),
          serviceAreas: [],
          reviews: [],
        };
      },
    },
    contractorReview: {
      groupBy: async () => [],
      aggregate: async () => ({ _avg: {} }),
    },
  },
}));

import { GET } from "../route";

describe("GET /api/contractors/[slug] certifications (RA-8457)", () => {
  it("returns the VERIFIED certification and not the PENDING or REJECTED ones", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/contractors/acme-restoration"),
      { params: Promise.resolve({ slug: "acme-restoration" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.certifications.map((c: { id: string }) => c.id);
    expect(ids).toEqual(["cert-verified"]);
  });
});
