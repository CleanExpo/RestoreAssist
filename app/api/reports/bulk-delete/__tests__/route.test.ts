/**
 * Rate-limit key regression guard.
 *
 * The bulk-delete cap (10 / 15min) must be keyed on session.user.id, not the
 * client IP — IP keys are bypassable in serverless cold starts (CLAUDE.md rule 8).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    report: { findMany: vi.fn(), deleteMany: vi.fn() },
    authorityFormInstance: { findMany: vi.fn() },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return { prisma };
});

import { DELETE } from "../route";
import { getServerSession } from "next-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";

function makeRequest(ids: string[]) {
  return new NextRequest("http://localhost/api/reports/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

describe("DELETE /api/reports/bulk-delete rate-limit key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([{ id: "r1" }] as never);
    vi.mocked(prisma.report.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.authorityFormInstance.findMany).mockResolvedValue([] as never);
  });

  it("keys the rate limit on session.user.id", async () => {
    const res = await DELETE(makeRequest(["r1"]));
    expect(res.status).toBe(200);
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "u1" }),
    );
  });
});

// RA-8526: deleting a report cascades into its authority forms and their
// signatures, so a report holding a signed form must not be deleted.
describe("DELETE /api/reports/bulk-delete signed authority forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      { id: "r1" },
      { id: "r2" },
    ] as never);
    vi.mocked(prisma.report.deleteMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.authorityFormInstance.findMany).mockResolvedValue([] as never);
  });

  it("refuses the whole batch with 409 when any report holds a signed form", async () => {
    vi.mocked(prisma.authorityFormInstance.findMany).mockResolvedValue([
      { reportId: "r2" },
    ] as never);
    const res = await DELETE(makeRequest(["r1", "r2"]));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/signed authority form/);
    expect(prisma.report.deleteMany).not.toHaveBeenCalled();
  });

  it("carries the unsigned rule in the delete itself", async () => {
    const res = await DELETE(makeRequest(["r1", "r2"]));
    expect(res.status).toBe(200);
    expect(prisma.report.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        authorityForms: {
          none: { signatures: { some: { signedAt: { not: null } } } },
        },
      }),
    });
  });

  it("rolls the batch back with 409 when a signature lands after the check", async () => {
    vi.mocked(prisma.report.deleteMany).mockResolvedValue({ count: 1 } as never);
    const res = await DELETE(makeRequest(["r1", "r2"]));
    expect(res.status).toBe(409);
  });
});
