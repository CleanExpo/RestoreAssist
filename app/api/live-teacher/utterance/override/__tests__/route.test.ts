/**
 * RA-1132i-3 — POST /api/live-teacher/utterance/override.
 * Marks a teacher answer overridden by the tech. Mocks auth, rate-limiter, prisma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    teacherUtterance: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function req(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/live-teacher/utterance/override", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function post(b?: unknown) {
  const { POST } = await import("../route");
  return POST(req(b));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user-1" } } as never);
  findUnique.mockResolvedValue({
    id: "utt-1",
    role: "assistant",
    session: { userId: "user-1" },
  });
  update.mockResolvedValue({});
});

describe("POST /api/live-teacher/utterance/override", () => {
  it("401 without a session", async () => {
    mockSession.mockResolvedValueOnce(null as never);
    expect((await post({ utteranceId: "utt-1", reason: "wrong class" })).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 when utteranceId or reason is missing", async () => {
    expect((await post({ utteranceId: "utt-1" })).status).toBe(400);
    expect((await post({ reason: "x" })).status).toBe(400);
    expect((await post({ utteranceId: "utt-1", reason: "   " })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("404 when the utterance belongs to another user", async () => {
    findUnique.mockResolvedValueOnce({
      id: "utt-1",
      role: "assistant",
      session: { userId: "someone-else" },
    });
    expect((await post({ utteranceId: "utt-1", reason: "x" })).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 when the target is not an assistant answer", async () => {
    findUnique.mockResolvedValueOnce({
      id: "utt-1",
      role: "user",
      session: { userId: "user-1" },
    });
    expect((await post({ utteranceId: "utt-1", reason: "x" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("sets userOverride + overrideReason on the owned assistant utterance", async () => {
    const res = await post({
      utteranceId: "utt-1",
      reason: "  Category is 3, not 2 — sewage present  ",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.overridden).toBe(true);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "utt-1" });
    expect(arg.data).toEqual({
      userOverride: true,
      overrideReason: "Category is 3, not 2 — sewage present",
    });
  });
});
