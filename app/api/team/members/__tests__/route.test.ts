import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA: GET /api/team/members must wrap its prisma.user calls in try/catch so a
// thrown Prisma error routes through the sanitized fromException envelope
// instead of bypassing the error pipeline (defense-in-depth for CLAUDE.md rule 9).

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const fromException = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: (...a: unknown[]) => {
    fromException(...a);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
    },
  },
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin1" } });
});

const req = () => new NextRequest("http://localhost/api/team/members");

describe("team/members GET — error envelope", () => {
  it("routes a thrown Prisma error through fromException (500 envelope)", async () => {
    userFindUnique.mockRejectedValue(
      Object.assign(new Error("connection pool exhausted"), { code: "P1001" }),
    );

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(fromException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: "P1001" }),
      { stage: "team-members-get" },
    );
  });

  it("returns members normally when queries succeed", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN", organizationId: "org1" });
    userFindMany.mockResolvedValue([
      { id: "u1", name: "A", email: "a@x.com", role: "USER" },
    ]);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      members: [{ id: "u1", name: "A", email: "a@x.com", role: "USER" }],
    });
    expect(fromException).not.toHaveBeenCalled();
  });
});
