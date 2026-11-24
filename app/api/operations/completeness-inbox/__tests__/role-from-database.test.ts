/**
 * RA-8065: the firm-wide completeness inbox is for managers and owners. The
 * role in the login cookie is only refreshed on sign-in, so a manager demoted
 * to technician keeps a MANAGER cookie for up to 90 days. The route must read
 * the role from the database, not from the session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}));

const mockListInbox = vi.fn();
vi.mock("@/lib/completeness/org-inbox", () => ({
  listCompletenessInboxForOwner: (...a: unknown[]) => mockListInbox(...a),
}));

import { GET } from "../route";

function get() {
  return GET(
    new NextRequest("http://localhost/api/operations/completeness-inbox"),
  );
}

/** The caller's database row; each read of it returns the same user. */
function dbUser(role: string) {
  mockUserFindUnique.mockResolvedValue({ role, organizationId: "org-1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue({
    user: { id: "user-m", role: "MANAGER" },
  });
  mockListInbox.mockResolvedValue([{ inspectionId: "insp-1" }]);
});

describe("GET /api/operations/completeness-inbox role (RA-8065)", () => {
  it("refuses a demoted manager whose cookie still says MANAGER", async () => {
    dbUser("USER");
    const res = await get();
    await expectRefused(res, 403, /Manager or owner role required/);
    expect(mockListInbox).not.toHaveBeenCalled();
  });

  it("refuses a demoted owner whose cookie still says ADMIN", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-m", role: "ADMIN" },
    });
    dbUser("USER");
    const res = await get();
    await expectRefused(res, 403, /Manager or owner role required/);
    expect(mockListInbox).not.toHaveBeenCalled();
  });

  it("refuses when the caller's row no longer exists", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await get();
    await expectRefused(res, 403, /Manager or owner role required/);
    expect(mockListInbox).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "ADMIN"])(
    "serves the inbox when the database role is %s",
    async (role) => {
      dbUser(role);
      const res = await get();
      expect(res.status).toBe(200);
      expect(mockListInbox).toHaveBeenCalledTimes(1);
    },
  );
});
