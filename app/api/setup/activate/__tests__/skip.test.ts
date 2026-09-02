/**
 * Tests for POST /api/setup/activate with `{ skip: true }` (RA-7427).
 *
 * The setup wizard was a hard wall: step 2 asks for an AI key, Next is locked
 * until it exists, Back is disabled on step 1, and every route back to the
 * dashboard (welcome redirect, "Setup guide", Skip tour) lands on
 * /dashboard/onboarding, whose server redirect sends an unactivated owner
 * straight back to /setup. A stranger without a key had no way in.
 *
 * "Skip setup for now" activates the organisation WITHOUT the red-check gate,
 * so the user lands on the dashboard and stays there. Report generation is
 * still gated on the key by the report page itself. The normal (non-skip)
 * path keeps refusing while any check is red.
 *
 * Mocks session, prisma, checks and email so the test runs offline.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const orgFindFirst = vi.fn();
const orgUpdate = vi.fn();
const userFindUnique = vi.fn();
const runAllChecks = vi.fn();
const sendWelcomeEmail = vi.fn();

const tx = {
  invoiceTemplate: { updateMany: vi.fn() },
  client: { findFirst: vi.fn().mockResolvedValue({ id: "c_sample" }), create: vi.fn() },
  report: { create: vi.fn() },
  organization: { update: (...a: unknown[]) => orgUpdate(...a) },
};

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: (...a: unknown[]) => sendWelcomeEmail(...a),
}));
vi.mock("@/lib/setup/checks", () => ({
  runAllChecks: (...a: unknown[]) => runAllChecks(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findFirst: (...a: unknown[]) => orgFindFirst(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST } = await import("../route");

function makeReq(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/setup/activate", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const RED_KEY_CHECK = {
  capability: "byok_keys",
  label: "AI key",
  status: "red",
  note: "Add an Anthropic or OpenAI key",
};

beforeEach(() => {
  getServerSession.mockReset();
  orgFindFirst.mockReset();
  orgUpdate.mockReset();
  userFindUnique.mockReset();
  runAllChecks.mockReset();
  sendWelcomeEmail.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  orgFindFirst.mockResolvedValue({
    id: "o_1",
    setupStartedAt: new Date("2026-09-03T00:00:00Z"),
    setupCompletedAt: null,
    setupMode: "AI",
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
  });
  orgUpdate.mockResolvedValue({
    id: "o_1",
    setupMode: "AI",
    setupStartedAt: new Date("2026-09-03T00:00:00Z"),
    setupCompletedAt: new Date("2026-09-03T00:01:00Z"),
  });
  userFindUnique.mockResolvedValue({ email: "u@example.com", name: "U" });
  runAllChecks.mockResolvedValue([RED_KEY_CHECK]);
  sendWelcomeEmail.mockResolvedValue(null);
});

describe("POST /api/setup/activate — skip for now (RA-7427)", () => {
  it("without skip, a red check still refuses activation (unchanged)", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("with no body at all, a red check still refuses activation (unchanged)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("with skip: true, activates despite the red AI-key check and points at the dashboard", async () => {
    const res = await POST(makeReq({ skip: true }));
    expect(res.status).toBe(200);
    expect(orgUpdate).toHaveBeenCalledTimes(1);
    const data = orgUpdate.mock.calls[0][0].data;
    expect(data.setupCompletedAt).toBeInstanceOf(Date);
    const body = await res.json();
    expect(body.data.redirectTo).toBe("/dashboard");
  });

  it("with skip: 'yes' (not boolean true), the gate is NOT bypassed", async () => {
    const res = await POST(makeReq({ skip: "yes" }));
    expect(res.status).toBe(400);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("skip still refuses when setup is already activated", async () => {
    orgFindFirst.mockResolvedValue({
      id: "o_1",
      setupStartedAt: new Date(),
      setupCompletedAt: new Date(),
      setupMode: "AI",
      logoUrl: null,
      primaryColor: null,
      accentColor: null,
    });
    const res = await POST(makeReq({ skip: true }));
    expect(res.status).toBe(409);
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});
