import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalInvitation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { DELETE } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  portalInvitation: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1", userType: "contractor" } });
});

const req = () =>
  new NextRequest("http://localhost/api/portal/invitations/inv1", {
    method: "DELETE",
  });

describe("DELETE /api/portal/invitations/[id]", () => {
  it("401 without session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await DELETE(req(), { params: Promise.resolve({ id: "inv1" }) })).status).toBe(
      401,
    );
  });

  it("404 when invitation not owned", async () => {
    p.portalInvitation.findFirst.mockResolvedValueOnce(null);
    expect((await DELETE(req(), { params: Promise.resolve({ id: "inv1" }) })).status).toBe(
      404,
    );
  });

  it("400 when already accepted", async () => {
    p.portalInvitation.findFirst.mockResolvedValueOnce({
      id: "inv1",
      status: "ACCEPTED",
    });
    expect((await DELETE(req(), { params: Promise.resolve({ id: "inv1" }) })).status).toBe(
      400,
    );
  });

  it("revokes a pending invitation", async () => {
    p.portalInvitation.findFirst.mockResolvedValueOnce({
      id: "inv1",
      status: "PENDING",
    });
    p.portalInvitation.update.mockResolvedValueOnce({});
    const res = await DELETE(req(), { params: Promise.resolve({ id: "inv1" }) });
    expect(res.status).toBe(200);
    expect(p.portalInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { status: "REVOKED" },
    });
  });
});
