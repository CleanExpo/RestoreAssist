/**
 * J-10 (prelaunch audit): a self-signup business must have a Workspace from
 * registration. Add-on and seat entitlements live on it, and
 * checkPaymentGate answers 402 NO_WORKSPACE without one.
 *
 * Real Postgres: proves the row, its owner membership and its READY status
 * exist, not just that the helper was called. Outbound side effects mocked.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth/password-breach", () => ({ rejectIfBreached: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: vi.fn().mockResolvedValue({ messageId: "welcome-1", replayed: false }),
}));
vi.mock("@/lib/notifications", () => ({ notifyWelcome: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/founder-signup-alert", () => ({
  sendFounderSignupAlert: vi.fn().mockResolvedValue({ sent: true }),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  extractRequestContext: vi.fn(() => ({ ipAddress: "127.0.0.1" })),
}));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn().mockResolvedValue(undefined) }));

const { POST } = await import("../route");

describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/register — workspace at signup (J-10)", () => {
  const email = `j10-owner-${Date.now()}@example.com`;

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id }, select: { id: true } });
    for (const ws of workspaces) {
      await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
    }
    await prisma.organization.deleteMany({ where: { ownerId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  it("creates a READY workspace owned by, and with an active membership for, the new owner", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: "J10 Owner",
          email,
          password: "correct horse battery staple",
          acceptedTerms: true,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: user.id },
      select: { id: true, status: true, members: { select: { userId: true, status: true } } },
    });
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].status).toBe("READY");
    expect(workspaces[0].members).toEqual([{ userId: user.id, status: "ACTIVE" }]);
  });
});
