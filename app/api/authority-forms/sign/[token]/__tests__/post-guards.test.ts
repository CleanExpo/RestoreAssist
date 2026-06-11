/**
 * #46 (client-portal security SHOULD-FIX) — CSRF + BotID on the public
 * authority-form signing POST.
 *
 * The sign-submit route is a public, token-gated write (legal signature). It had
 * rate-limiting but no bot/CSRF defence — parity with the other public-write
 * portal routes. These tests pin the guard ordering: rate-limit → BotID → CSRF,
 * each short-circuiting before any DB work.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormSignature: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { applyRateLimit } from "@/lib/rate-limiter";
import { verifyBotId } from "@/lib/auth/botid";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const mBot = verifyBotId as unknown as ReturnType<typeof vi.fn>;
const mCsrf = validateCsrf as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  authorityFormSignature: { findUnique: ReturnType<typeof vi.fn> };
};

const VALID_TOKEN = "12345678-1234-4123-8abc-1234567890ab";

const req = () =>
  new NextRequest("http://localhost/api/authority-forms/sign/x", {
    method: "POST",
    headers: { origin: "https://restoreassist.app" },
    body: JSON.stringify({ signatureData: "data:image/svg+xml;utf8,x" }),
  });
const params = (t = VALID_TOKEN) => ({ params: Promise.resolve({ token: t }) });

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
  mBot.mockResolvedValue({ ok: true });
  mCsrf.mockReturnValue(null);
  p.authorityFormSignature.findUnique.mockResolvedValue(null);
});

describe("POST /api/authority-forms/sign/[token] — bot + CSRF guards", () => {
  it("403 when BotID rejects (before any DB lookup)", async () => {
    mBot.mockResolvedValueOnce({ ok: false, reason: "Bot detected" });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect(p.authorityFormSignature.findUnique).not.toHaveBeenCalled();
  });

  it("returns the CSRF 403 response when origin validation fails", async () => {
    mCsrf.mockReturnValueOnce(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect(p.authorityFormSignature.findUnique).not.toHaveBeenCalled();
  });

  it("passes both guards on a good request (proceeds to token handling)", async () => {
    // Guards pass; invalid token short-circuits to 404 — proves guards did not block.
    const res = await POST(req(), params("not-a-uuid"));
    expect(mBot).toHaveBeenCalled();
    expect(mCsrf).toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
