import { describe, expect, it, vi, beforeEach } from "vitest";

const getServerSession = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { POST } from "@/app/api/reports/[id]/acknowledge-ownership/route";

beforeEach(() => {
  getServerSession.mockReset();
  findFirst.mockReset();
  update.mockReset();
});

describe("POST acknowledge-ownership", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects when human edit missing", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    findFirst.mockResolvedValue({
      id: "r1",
      detailedReport: "draft",
      aiDraftGeneratedAt: new Date(),
      aiDraftHumanEditedAt: null,
      reportOwnershipAcknowledgedAt: null,
    });
    const res = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("acknowledges after human edit", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    findFirst.mockResolvedValue({
      id: "r1",
      detailedReport: "rewritten",
      aiDraftGeneratedAt: new Date("2026-01-01T00:00:00Z"),
      aiDraftHumanEditedAt: new Date("2026-01-01T02:00:00Z"),
      reportOwnershipAcknowledgedAt: null,
    });
    update.mockResolvedValue({
      id: "r1",
      reportOwnershipAcknowledgedAt: new Date(),
      reportOwnershipAcknowledgedBy: "u1",
    });
    const res = await POST(new Request("http://localhost") as any, {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });
});
