import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  organization: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "owner-1" } });
});

describe("GET /api/organization/profile", () => {
  it("returns profile for owner", async () => {
    p.organization.findFirst.mockResolvedValue({
      legalName: "Acme Pty Ltd",
      logoUrl: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legalName).toBe("Acme Pty Ltd");
  });
});

describe("PATCH /api/organization/profile", () => {
  it("updates legal name after setup", async () => {
    p.organization.findFirst.mockResolvedValue({ id: "org-1" });
    p.organization.update.mockResolvedValue({
      legalName: "Fixed Name Pty Ltd",
      tradingName: null,
      state: "NSW",
      logoUrl: null,
      primaryColor: "#1C2E47",
      accentColor: "#8A6B4E",
      country: "AU",
      abn: null,
      nzbn: null,
    });
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ legalName: "Fixed Name Pty Ltd" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update).toHaveBeenCalled();
  });
});
