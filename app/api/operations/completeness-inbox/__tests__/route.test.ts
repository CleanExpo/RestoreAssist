import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const listCompletenessInboxForOwner = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));
vi.mock("@/lib/completeness/org-inbox", () => ({
  listCompletenessInboxForOwner: (...a: unknown[]) =>
    listCompletenessInboxForOwner(...a),
}));

import { GET } from "../route";

const req = () =>
  new NextRequest("http://localhost/api/operations/completeness-inbox");

beforeEach(() => {
  vi.clearAllMocks();
  listCompletenessInboxForOwner.mockResolvedValue([]);
});

// RA-8065: the session role comes from the login cookie and goes stale on
// demotion; the gate must follow the database role.
describe("GET /api/operations/completeness-inbox — role gate", () => {
  it("returns 403 when the cookie says MANAGER but the database says USER", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org1" });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(listCompletenessInboxForOwner).not.toHaveBeenCalled();
  });

  it("returns 403 when the cookie says ADMIN but the database says USER", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org1" });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it.each(["MANAGER", "ADMIN"])(
    "returns 200 when the database role is %s",
    async (dbRole) => {
      getServerSession.mockResolvedValue({ user: { id: "u1", role: dbRole } });
      userFindUnique.mockResolvedValue({ role: dbRole, organizationId: "org1" });
      const res = await GET(req());
      expect(res.status).toBe(200);
      expect(listCompletenessInboxForOwner).toHaveBeenCalledWith(
        expect.anything(),
        { userId: "u1", organizationId: "org1" },
      );
    },
  );

  it("returns 403 when the caller row no longer exists", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER" } });
    userFindUnique.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
});
