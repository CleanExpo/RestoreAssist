/**
 * Tenancy gate — CLAUDE.md rule 3 (DB re-validation of admin override) and
 * RA-7628 (an admin reaches only its own organisation's reports).
 *
 * GET /api/progress/[reportId]/documents/[type] streams a claim PDF. Access is
 * the owner, or an ADMIN of the owner's organisation. The admin half is read
 * from the DB, because the NextAuth JWT `session.user.role` claim can be stale
 * (a demoted admin keeps `role: "ADMIN"` in their token until it expires), and
 * it is bounded by organisation, because every firm that self-registers is
 * ADMIN of its own account.
 *
 * These tests pin:
 *   1. Unauthenticated → 401, no DB access.
 *   2. Report owner → allowed.
 *   3. Non-owner whose JWT says ADMIN but DB says USER (stale claim) → 404.
 *   4. Non-owner ADMIN (JWT and DB) of the owner's organisation → allowed.
 *   5. Non-owner ADMIN (JWT and DB) of ANOTHER organisation → 404.
 *   6. Non-owner ADMIN when neither account has an organisation → 404.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/progress/document-generators", () => ({
  generateCarrierPacketPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateCloseoutPack: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateLabourHireSummary: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateStabilisationCertificate: vi.fn(async () => new Uint8Array([1, 2, 3])),
  loadClaimDataGraph: vi.fn(async () => ({ ok: true, data: {} })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const reportFindUnique = prisma.report
  .findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user
  .findUnique as unknown as ReturnType<typeof vi.fn>;

function makeGet(): NextRequest {
  return new NextRequest(
    "http://localhost/api/progress/r1/documents/carrier-packet",
  );
}

const ctx = {
  params: Promise.resolve({ reportId: "r1", type: "carrier-packet" }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/progress/[reportId]/documents/[type] — auth gate", () => {
  it("401s when unauthenticated and never touches the DB", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(401);
    expect(reportFindUnique).not.toHaveBeenCalled();
  });

  it("allows the report owner", async () => {
    mockSession.mockResolvedValue({ user: { id: "owner-1", role: "USER" } });
    reportFindUnique.mockResolvedValue({
      id: "r1",
      userId: "owner-1",
      user: { organizationId: "org-1" },
    });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org-1" });
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(200);
  });

  it("404s a non-owner whose ADMIN role is a stale JWT claim (DB says USER)", async () => {
    mockSession.mockResolvedValue({ user: { id: "ex-admin", role: "ADMIN" } });
    reportFindUnique.mockResolvedValue({
      id: "r1",
      userId: "someone-else",
      user: { organizationId: "org-1" },
    });
    // DB re-validation: role has since been downgraded (same organisation).
    userFindUnique.mockResolvedValue({
      id: "ex-admin",
      role: "USER",
      organizationId: "org-1",
    });
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(404);
    expect(userFindUnique).toHaveBeenCalled();
  });

  it("allows a non-owner ADMIN of the owner's organisation (confirmed by the DB)", async () => {
    mockSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    reportFindUnique.mockResolvedValue({
      id: "r1",
      userId: "someone-else",
      user: { organizationId: "org-1" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      organizationId: "org-1",
    });
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(200);
  });

  it("RA-7628: 404s a non-owner ADMIN of ANOTHER organisation", async () => {
    mockSession.mockResolvedValue({ user: { id: "admin-2", role: "ADMIN" } });
    reportFindUnique.mockResolvedValue({
      id: "r1",
      userId: "someone-else",
      user: { organizationId: "org-1" },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-2",
      role: "ADMIN",
      organizationId: "org-2",
    });
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(404);
  });

  it("RA-7628: 404s a non-owner ADMIN when neither account has an organisation", async () => {
    mockSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    reportFindUnique.mockResolvedValue({
      id: "r1",
      userId: "someone-else",
      user: { organizationId: null },
    });
    userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      organizationId: null,
    });
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(404);
  });
});
